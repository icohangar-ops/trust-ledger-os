import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { ChpDecisionSubstrate } from "./substrate.js";
import { DecisionLedger } from "./ledger.js";
import { LockTransitionError } from "./locks.js";
import type { DecisionInput } from "./substrate.js";

const directories: string[] = [];

function tempSubstrate(env: NodeJS.ProcessEnv = {}): { substrate: ChpDecisionSubstrate; ledger: DecisionLedger } {
  const dir = mkdtempSync(join(tmpdir(), "chp-substrate-"));
  directories.push(dir);
  const ledger = new DecisionLedger(join(dir, "decisions.jsonl"));
  return { substrate: new ChpDecisionSubstrate(ledger, env), ledger };
}

function goodInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    decisionId: "substrate-flow-001",
    title: "Promote a governed claim",
    domain: "general",
    criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
    foundation: { guardrailsPassed: true, boundedResult: { rowCount: 4 }, parity: null },
    now: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ChpDecisionSubstrate", () => {
  it("records an R0 refusal without executing or assessing anything", () => {
    const { substrate, ledger } = tempSubstrate();
    const entry = substrate.openDecision(
      goodInput({
        decisionId: "r0-refused",
        criteria: { solvable: true, scoped: false, valid: true, worth_it: true },
      }),
    );
    assert.equal(entry.r0_verdict, "HALT");
    const parsed = JSON.parse(entry.body);
    assert.deepEqual(parsed.fatal_failures, ["r0_fatal:Scoped"]);
    assert.equal(parsed.foundation_score, null);
    assert.equal(parsed.lock_state, "EXPLORING");

    // The refusal is durably in the ledger, not thrown away.
    assert.equal(ledger.get("r0-refused")?.r0_verdict, "HALT");
    // And it serves as refused, never as pending promotion.
    assert.equal(substrate.serve("r0-refused").outcome, "refused");
  });

  it("runs the promotable flow: provisional lock, human confirm, then serve as promoted", () => {
    const { substrate, ledger } = tempSubstrate();
    const opened = substrate.openDecision(goodInput({ decisionId: "flow" }));
    assert.equal(opened.lock_state, "PROVISIONAL_LOCK");
    assert.equal(opened.floor_result, "PASS");
    assert.equal(opened.foundation_score, 70);

    // Flag is on by default: the provisional record cannot serve as promoted.
    assert.equal(substrate.serve("flow").outcome, "pending_confirmation");

    // Locking appends a second, sealed version — the ledger is append-only.
    const confirmed = substrate.confirm("flow", "compliance@trustledger.dev", { now: "2026-09-20T01:00:00.000Z" });
    assert.equal(confirmed.lock_state, "LOCKED");
    assert.equal(confirmed.envelope.route, "CONFIRM");
    assert.equal(ledger.history("flow").length, 2);

    const served = substrate.serve("flow");
    assert.equal(served.outcome, "promoted");
    assert.match(served.reason, /locked by compliance@trustledger\.dev/);
  });

  it("enforces the human lock by the substrate, not by callers", () => {
    const { substrate } = tempSubstrate({});
    substrate.openDecision(goodInput({ decisionId: "locked-out" }));
    assert.equal(substrate.humanLockRequired(), true);
    assert.equal(substrate.serve("locked-out").outcome, "pending_confirmation");

    const { substrate: flagOff } = tempSubstrate({ TRUST_LEDGER_CHP_REQUIRE_HUMAN_LOCK: "0" });
    flagOff.openDecision(goodInput({ decisionId: "flag-off" }));
    assert.equal(flagOff.humanLockRequired(), false);
    assert.equal(flagOff.serve("flag-off").outcome, "promoted");
  });

  it("refuses to confirm a refused record — the lock machine cannot be bypassed", () => {
    const { substrate } = tempSubstrate();
    substrate.openDecision(
      goodInput({
        decisionId: "floor-fail",
        domain: "finance",
        foundation: { guardrailsPassed: true, boundedResult: { rowCount: 1 }, parity: null },
      }),
    );
    assert.throws(() => substrate.confirm("floor-fail", "cfo@trustledger.dev"), LockTransitionError);
    // The ledger was not rewritten with a bogus lock.
    assert.equal(substrate.ledger.get("floor-fail")?.lock_state, "EXPLORING");
  });

  it("refuses to serve a tampered entry even if its lock state says LOCKED", () => {
    const { substrate, ledger } = tempSubstrate();
    substrate.openDecision(goodInput({ decisionId: "integrity" }));
    substrate.confirm("integrity", "human@trustledger.dev");

    // Corrupt the head entry in place: rewrite the body without resealing.
    const head = ledger.readAll().at(-1)!;
    const corrupted = { ...head, body: head.body.replace("\"LOCKED\"", "\"LOCKED tampered\"") };
    rmSync(ledger.path);
    mkdirSync(dirname(ledger.path), { recursive: true });
    appendFileSync(ledger.path, `${JSON.stringify(corrupted)}\n`, "utf8");

    const served = substrate.serve("integrity");
    assert.equal(served.outcome, "refused");
    assert.match(served.reason, /integrity validation/);
    assert.equal(served.entry?.integrity_valid, false);
  });

  it("refuses to confirm an integrity-failed entry", () => {
    const { substrate, ledger } = tempSubstrate();
    substrate.openDecision(goodInput({ decisionId: "confirm-tamper" }));
    const head = ledger.readAll().at(-1)!;
    appendFileSync(ledger.path, `${JSON.stringify({ ...head, body_sha256: "0".repeat(64) })}\n`, "utf8");

    // The head is now the digest-broken duplicate; confirm must refuse.
    assert.throws(
      () => substrate.confirm("confirm-tamper", "human@trustledger.dev"),
      /failed integrity validation/,
    );
  });

  it("rejects an unknown decision at confirm and serves unknown as refused", () => {
    const { substrate } = tempSubstrate();
    assert.throws(() => substrate.confirm("ghost", "human"), /unknown decision/);
    const served = substrate.serve("ghost");
    assert.equal(served.outcome, "refused");
    assert.equal(served.entry, null);
  });

  it("keeps the parity-mismatch refusal fatal through the whole substrate", () => {
    const { substrate } = tempSubstrate();
    const entry = substrate.openDecision(
      goodInput({
        decisionId: "parity-fatal",
        domain: "finance",
        foundation: {
          guardrailsPassed: true,
          boundedResult: { rowCount: 1 },
          parity: { caseId: "gold-1", metric: "arr", unit: "usd", expected: 500, tolerance: 5, actual: 401, withinTolerance: false },
        },
      }),
    );
    assert.deepEqual(JSON.parse(entry.body).fatal_failures, ["parity_mismatch"]);
    assert.equal(substrate.serve("parity-fatal").outcome, "refused");
    assert.throws(() => substrate.confirm("parity-fatal", "cfo@trustledger.dev"), LockTransitionError);
  });
});
