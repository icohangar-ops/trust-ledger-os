import type {
  DecisionDomain,
  DecisionRecord,
  FoundationInput,
  LedgerEntry,
  Outcome,
  R0Criteria,
} from "./types.js";
import { scoreFoundation } from "./adversary.js";
import { assessFloor, resolveDomainFloor } from "./floors.js";
import {
  confirmLock,
  LockTransitionError,
  openProvisionalLock,
  recordOutcome,
  requireHumanLock,
} from "./locks.js";
import { DecisionLedger, entryToRecord, validateEnvelopeShape } from "./ledger.js";
import { evaluateR0Gate, r0FatalCriteria } from "./r0.js";

export type DecisionInput = {
  decisionId: string;
  title: string;
  domain: DecisionDomain;
  owner?: string;
  criteria: R0Criteria;
  foundation?: FoundationInput | null;
  /** Per-domain floors; defaults to DEFAULT_DOMAIN_FLOORS. */
  floors?: Record<string, number>;
  /** Per-record floor override — wins over the domain default. */
  floorOverride?: number;
  artifacts?: Record<string, unknown>;
  /** ISO timestamp injection for deterministic tests. */
  now?: string;
};

/**
 * Pure decision pipeline: R0 gate -> adversary foundation pass -> domain
 * floor -> provisional lock. Refusals are recorded, never thrown away:
 * an R0 HALT or a floor breach persists as a refused record so the
 * question "why was this not promoted?" has a mechanical answer.
 */
export function buildDecisionRecord(input: DecisionInput): DecisionRecord {
  const now = input.now ?? new Date().toISOString();
  const r0 = evaluateR0Gate(input.criteria);
  const floor = resolveDomainFloor(input.domain, input.floors, input.floorOverride);
  const base: DecisionRecord = {
    decisionId: input.decisionId,
    title: input.title,
    domain: input.domain,
    createdAt: now,
    owner: input.owner ?? "trust-ledger-os",
    r0,
    foundation: null,
    floor,
    floorResult: "NOT_ASSESSED",
    lockState: "EXPLORING",
    confirmedBy: null,
    fatalFailures: [],
    artifacts: input.artifacts ?? {},
  };

  if (r0.verdict === "HALT") {
    // HALT refuses with nothing executed or assessed.
    return {
      ...base,
      fatalFailures: r0FatalCriteria(r0).map((criterion) => `r0_fatal:${criterion}`),
    };
  }

  const foundation = scoreFoundation(input.foundation ?? { guardrailsPassed: false, boundedResult: null, parity: null }, input.domain);
  if (foundation.fatalFailures.length > 0) {
    // A fatal adversary failure (parity mismatch) refuses regardless of floor.
    return { ...base, foundation, fatalFailures: [...foundation.fatalFailures] };
  }

  const floorCheck = assessFloor(foundation.score, floor);
  if (floorCheck.result === "FAIL") {
    return { ...base, foundation, floorResult: "FAIL" };
  }

  // Every promotable record opens as a provisional decision pending
  // human confirmation; only the lock state machine may close it.
  return openProvisionalLock({ ...base, foundation, floorResult: "PASS" });
}

export type ServeReport = { outcome: Outcome; reason: string; entry: LedgerEntry | null };

/**
 * The decision substrate: runs requests through R0 -> adversary -> floor
 * -> lock and seals every outcome into the ledger. The lock state
 * machine and the REQUIRE_HUMAN_LOCK rule are enforced here — callers
 * observe outcomes, they cannot set lock state or bypass the floor.
 */
export class ChpDecisionSubstrate {
  readonly ledger: DecisionLedger;
  private readonly env: NodeJS.ProcessEnv;

  constructor(ledger: DecisionLedger = new DecisionLedger(), env: NodeJS.ProcessEnv = process.env) {
    this.ledger = ledger;
    this.env = env;
  }

  /** Evaluate, seal, and append the outcome of one decision request. */
  openDecision(input: DecisionInput): LedgerEntry {
    const record = buildDecisionRecord(input);
    return this.ledger.append(record, { recordedAt: input.now });
  }

  /**
   * Human confirmation: PROVISIONAL_LOCK -> LOCKED. Appends a new sealed
   * version of the record (the ledger is append-only); rejects records
   * the lock state machine refuses (refusals, already-locked, empty names).
   */
  confirm(decisionId: string, confirmedBy: string, options: { now?: string } = {}): LedgerEntry {
    const entry = this.ledger.get(decisionId);
    if (!entry) {
      throw new Error(`unknown decision: ${decisionId}`);
    }
    if (entry.integrity_valid === false || entry.envelope_valid === false) {
      throw new Error(`cannot confirm decision ${decisionId}: ledger entry failed integrity validation`);
    }
    const current = entryToRecord(entry);
    // Refusals are terminal — belt and suspenders with openProvisionalLock.
    if (recordOutcome(current, { requireHumanLock: true }).outcome === "refused") {
      throw new LockTransitionError(
        `decision ${decisionId} was refused by the substrate and cannot be locked`,
      );
    }
    const record = confirmLock(current, confirmedBy);
    return this.ledger.append(record, { route: "CONFIRM", recordedAt: options.now });
  }

  /**
   * The substrate-enforced serving rule. When REQUIRE_HUMAN_LOCK is on
   * (default), only LOCKED records serve as promoted; pending records
   * read as pending_confirmation; refusals read as refused.
   */
  serve(decisionId: string): ServeReport {
    const entry = this.ledger.get(decisionId);
    if (!entry) {
      return { outcome: "refused", reason: `unknown decision: ${decisionId}`, entry: null };
    }
    if (entry.integrity_valid === false) {
      return {
        outcome: "refused",
        reason: "ledger entry failed integrity validation (body_sha256 mismatch)",
        entry,
      };
    }
    if (validateEnvelopeShape(entry.envelope) === false) {
      return {
        outcome: "refused",
        reason: "ledger entry failed envelope structure validation",
        entry,
      };
    }
    const report = recordOutcome(entryToRecord(entry), {
      requireHumanLock: requireHumanLock(this.env),
    });
    return { ...report, entry };
  }

  /** Human-lock state as seen by the substrate (env-injectable for tests). */
  humanLockRequired(): boolean {
    return requireHumanLock(this.env);
  }
}
