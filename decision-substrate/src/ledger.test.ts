import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { buildDecisionRecord } from "./substrate.js";
import { DecisionLedger, entryToRecord, sealRecord, validateEnvelopeShape } from "./ledger.js";
import { confirmLock } from "./locks.js";
import type { DecisionInput } from "./substrate.js";
import type { LedgerEntry } from "./types.js";

const directories: string[] = [];

function tempLedger(): DecisionLedger {
  const dir = mkdtempSync(join(tmpdir(), "chp-ledger-"));
  directories.push(dir);
  return new DecisionLedger(join(dir, "state", "decisions.jsonl"));
}

function validInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    decisionId: "ledger-roundtrip-001",
    title: "Round trip",
    domain: "general",
    criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
    foundation: { guardrailsPassed: true, boundedResult: { rowCount: 1 }, parity: null },
    now: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function readSealedEntry(ledger: DecisionLedger): LedgerEntry {
  return JSON.parse(readFileSync(ledger.path, "utf8")) as LedgerEntry;
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("DecisionLedger", () => {
  it("round trips a record: append then get returns the sealed entry with valid integrity", () => {
    const ledger = tempLedger();
    const entry = ledger.append(buildDecisionRecord(validInput()));
    assert.equal(entry.envelope_valid, true);
    assert.equal(entry.integrity_valid, true);
    assert.equal(entry.envelope.algorithm, "sha256");
    assert.equal(entry.envelope.route, "DECIDE");

    const read = ledger.get("ledger-roundtrip-001");
    assert.ok(read);
    assert.equal(read.integrity_valid, true);
    assert.equal(read.envelope_valid, true);
    const parsed = JSON.parse(read.body);
    assert.equal(parsed.decision_id, "ledger-roundtrip-001");
    assert.equal(parsed.foundation_score, 70);
    assert.equal(parsed.lock_state, "PROVISIONAL_LOCK");
  });

  it("reads back an empty ledger as nothing", () => {
    const ledger = tempLedger();
    assert.deepEqual(ledger.readAll(), []);
    assert.equal(ledger.get("missing"), null);
  });

  it("detects body tampering: an edited body no longer matches its digest", () => {
    const ledger = tempLedger();
    ledger.append(buildDecisionRecord(validInput()));

    // A naive in-place edit: raise the recorded score without touching
    // body_sha256. The read path must flag it.
    const sealed = readSealedEntry(ledger);
    sealed.body = sealed.body.replace("\"foundation_score\":70", "\"foundation_score\":100");
    writeFileSync(ledger.path, `${JSON.stringify(sealed)}\n`, "utf8");

    const read = ledger.get("ledger-roundtrip-001");
    assert.ok(read);
    assert.equal(read.integrity_valid, false);
    assert.equal(read.envelope_valid, true); // envelope structure is untouched
  });

  it("revalidates the digest over the exact stored bytes on every read", () => {
    const ledger = tempLedger();
    ledger.append(buildDecisionRecord(validInput()));
    const sealed = readSealedEntry(ledger);
    assert.equal(
      createHash("sha256").update(sealed.body, "utf8").digest("hex"),
      sealed.body_sha256,
    );
    // The seal is over canonical JSON: sorted keys, no whitespace.
    assert.equal(sealed.body, JSON.stringify(JSON.parse(sealed.body)));
  });

  it("flags envelope structure failures without touching body integrity", () => {
    const ledger = tempLedger();
    ledger.append(buildDecisionRecord(validInput()));
    const sealed = readSealedEntry(ledger);
    // Simulate a tampered envelope: swap the algorithm after the seal.
    (sealed.envelope as { algorithm: string }).algorithm = "md5";
    writeFileSync(ledger.path, `${JSON.stringify(sealed)}\n`, "utf8");

    const read = ledger.get("ledger-roundtrip-001");
    assert.ok(read);
    assert.equal(read.envelope_valid, false);
    assert.equal(read.integrity_valid, true); // body itself is untouched
  });

  it("validates envelope shape: version, route, algorithm, and ISO timestamp required", () => {
    const good = { chp_version: "1.0", route: "DECIDE", algorithm: "sha256", created_at: "2026-09-20T00:00:00.000Z" };
    assert.equal(validateEnvelopeShape(good), true);
    assert.equal(validateEnvelopeShape({ ...good, chp_version: "" }), false);
    assert.equal(validateEnvelopeShape({ ...good, route: "" }), false);
    assert.equal(validateEnvelopeShape({ ...good, algorithm: "md5" }), false);
    assert.equal(validateEnvelopeShape({ ...good, created_at: "not-a-date" }), false);
    assert.equal(validateEnvelopeShape(null), false);
    assert.equal(validateEnvelopeShape("envelope"), false);
  });

  it("surfaces an unparseable line as an invalid entry instead of dropping it", () => {
    const ledger = tempLedger();
    ledger.append(buildDecisionRecord(validInput()));
    appendFileSync(ledger.path, "not-json-at-all\n", "utf8");
    const all = ledger.readAll();
    assert.equal(all.length, 2);
    assert.equal(all[1].integrity_valid, false);
    assert.equal(all[1].envelope_valid, false);
    assert.match(all[1].error ?? "", /JSON/i);
  });

  it("stays append-only: locking adds a second sealed version, history preserves both", () => {
    const ledger = tempLedger();
    const record = buildDecisionRecord(validInput({ decisionId: "append-only" }));
    ledger.append(record);
    const locked = confirmLock(entryToRecord(ledger.get("append-only")!), "human@corp");
    ledger.append(locked, { route: "CONFIRM", recordedAt: "2026-09-20T01:00:00.000Z" });

    const history = ledger.history("append-only");
    assert.equal(history.length, 2);
    assert.equal(history[0].lock_state, "PROVISIONAL_LOCK"); // nothing rewritten
    assert.equal(history[1].lock_state, "LOCKED");
    assert.equal(history[1].envelope.route, "CONFIRM");
    assert.equal(ledger.get("append-only")?.lock_state, "LOCKED");
  });

  it("lists newest-first", () => {
    const ledger = tempLedger();
    ledger.append(buildDecisionRecord(validInput({ decisionId: "first", now: "2026-09-20T00:00:00.000Z" })));
    ledger.append(buildDecisionRecord(validInput({ decisionId: "second", now: "2026-09-20T02:00:00.000Z" })));
    assert.deepEqual(
      ledger.list().map((entry) => entry.decision_id),
      ["second", "first"],
    );
  });

  it("seals deterministically: identical records produce identical 64-hex digests", () => {
    const record = buildDecisionRecord(validInput());
    const a = sealRecord(record);
    const b = sealRecord(record);
    assert.equal(a.body, b.body);
    assert.equal(a.body_sha256, b.body_sha256);
    assert.match(a.body_sha256, /^[0-9a-f]{64}$/);
  });
});
