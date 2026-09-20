import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalJson, CHP_VERSION, contentHash } from "@cubiczan/chp";
import type {
  DecisionRecord,
  Envelope,
  LedgerEntry,
  LockState,
  ParityEvidence,
  R0Evaluation,
  FloorResult,
} from "./types.js";

export const DEFAULT_LEDGER_PATH = ".trust-ledger/decisions.jsonl";

export type SealedPayload = {
  decision_id: string;
  title: string;
  domain: string;
  created_at: string;
  owner: string;
  r0_verdict: string;
  r0_results: Record<string, string>;
  foundation_score: number | null;
  adversary_findings: string[];
  parity: unknown;
  floor: number;
  floor_result: string;
  fatal_failures: string[];
  lock_state: LockState;
  confirmed_by: string | null;
  artifacts: Record<string, unknown>;
};

/**
 * Structure-only envelope validation — the CHP payload envelope proves
 * shape, never content. Content integrity is the ledger's own SHA-256
 * body digest (`body_sha256`), re-checked on every read.
 */
export function validateEnvelopeShape(envelope: unknown): boolean {
  if (typeof envelope !== "object" || envelope === null) return false;
  const candidate = envelope as Record<string, unknown>;
  if (typeof candidate.chp_version !== "string" || candidate.chp_version === "") return false;
  if (typeof candidate.route !== "string" || candidate.route === "") return false;
  if (candidate.algorithm !== "sha256") return false;
  if (typeof candidate.created_at !== "string" || Number.isNaN(Date.parse(candidate.created_at))) {
    return false;
  }
  return true;
}

/** Pure seal: canonical JSON body + its SHA-256 digest + structure-only envelope. */
export function sealRecord(
  record: DecisionRecord,
  options: { route?: string; recordedAt?: string } = {},
): LedgerEntry {
  const payload: SealedPayload = {
    decision_id: record.decisionId,
    title: record.title,
    domain: record.domain,
    created_at: record.createdAt,
    owner: record.owner,
    r0_verdict: record.r0.verdict,
    r0_results: record.r0.results,
    foundation_score: record.foundation?.score ?? null,
    adversary_findings: record.foundation?.findings ?? [],
    parity: record.foundation?.parity ?? null,
    floor: record.floor,
    floor_result: record.floorResult,
    fatal_failures: record.fatalFailures,
    lock_state: record.lockState,
    confirmed_by: record.confirmedBy,
    artifacts: record.artifacts,
  };
  const recordedAt = options.recordedAt ?? record.createdAt;
  const entry: LedgerEntry = {
    decision_id: record.decisionId,
    recorded_at: recordedAt,
    domain: record.domain,
    lock_state: record.lockState,
    r0_verdict: record.r0.verdict,
    foundation_score: record.foundation?.score ?? null,
    floor: record.floor,
    floor_result: record.floorResult,
    confirmed_by: record.confirmedBy,
    body: canonicalJson(payload),
    body_sha256: contentHash(payload),
    envelope: {
      chp_version: CHP_VERSION,
      route: options.route ?? "DECIDE",
      algorithm: "sha256",
      created_at: recordedAt,
    },
    // A fresh seal is valid by construction; reads revalidate both.
    envelope_valid: true,
    integrity_valid: true,
  };
  return entry;
}

/**
 * Re-validate a record on read. The stored body bytes are hashed exactly
 * as written — a tampered or reformatted body reads as integrity_valid:
 * false instead of re-canonicalizing itself back to a matching digest.
 */
export function revalidateEntry(entry: LedgerEntry): LedgerEntry {
  const digest = createHash("sha256").update(entry.body ?? "", "utf8").digest("hex");
  return {
    ...entry,
    envelope_valid: validateEnvelopeShape(entry.envelope),
    integrity_valid: digest === entry.body_sha256,
  };
}

/** Rebuild the decision record a sealed body carries (latest state). */
export function entryToRecord(entry: LedgerEntry): DecisionRecord {
  const payload = JSON.parse(entry.body) as SealedPayload;
  const r0: R0Evaluation = {
    verdict: payload.r0_verdict === "HALT" ? "HALT" : "PASS",
    results: payload.r0_results as R0Evaluation["results"],
  };
  const floorResult = payload.floor_result as FloorResult;
  return {
    decisionId: payload.decision_id,
    title: payload.title,
    domain: payload.domain,
    createdAt: payload.created_at,
    owner: payload.owner,
    r0,
    foundation:
      payload.foundation_score === null
        ? null
        : {
            score: payload.foundation_score,
            domain: payload.domain,
            findings: payload.adversary_findings,
            parity: (payload.parity as ParityEvidence | null) ?? null,
            goldenMatched: payload.parity !== null,
            fatalFailures: payload.fatal_failures.filter((f) => f === "parity_mismatch"),
          },
    floor: payload.floor,
    floorResult,
    lockState: payload.lock_state,
    confirmedBy: payload.confirmed_by,
    fatalFailures: payload.fatal_failures,
    artifacts: payload.artifacts,
  };
}

/**
 * Append-only JSONL of CHP decision records; envelope structure and body
 * integrity re-checked on every read. There is no update or delete — a
 * state change appends a new entry for the same decision_id.
 */
export class DecisionLedger {
  readonly path: string;

  constructor(path: string = DEFAULT_LEDGER_PATH) {
    this.path = path;
  }

  append(record: DecisionRecord, options: { route?: string; recordedAt?: string } = {}): LedgerEntry {
    const entry = sealRecord(record, options);
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf8");
    return revalidateEntry(entry);
  }

  /** All entries, oldest first, each revalidated on read. */
  readAll(): LedgerEntry[] {
    if (!existsSync(this.path)) return [];
    const lines = readFileSync(this.path, "utf8").split("\n");
    const entries: LedgerEntry[] = [];
    for (const line of lines) {
      const raw = line.trim();
      if (!raw) continue;
      try {
        entries.push(revalidateEntry(JSON.parse(raw) as LedgerEntry));
      } catch (error) {
        // Never swallow: a corrupted or tampered line surfaces as an
        // invalid entry instead of being dropped from the ledger view.
        entries.push({
          decision_id: `unparseable:${entries.length}`,
          recorded_at: "",
          domain: "unknown",
          lock_state: "EXPLORING",
          r0_verdict: "HALT",
          foundation_score: null,
          floor: 0,
          floor_result: "NOT_ASSESSED",
          confirmed_by: null,
          body: raw,
          body_sha256: "",
          envelope: { chp_version: "", route: "", algorithm: "sha256", created_at: "" },
          envelope_valid: false,
          integrity_valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return entries;
  }

  /** Newest-first records with integrity revalidated on read. */
  list(limit = 100): LedgerEntry[] {
    return this.readAll().slice(-limit).reverse();
  }

  /** Latest entry for a decision (the append-only head). */
  get(decisionId: string): LedgerEntry | null {
    const all = this.readAll();
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].decision_id === decisionId) return all[i];
    }
    return null;
  }

  /** Every sealed version of a decision, oldest first. */
  history(decisionId: string): LedgerEntry[] {
    return this.readAll().filter((entry) => entry.decision_id === decisionId);
  }
}
