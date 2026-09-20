import type { LockState, Outcome, R0Evaluation, FloorResult } from "./types.js";
import { r0FatalCriteria } from "./r0.js";

export const REQUIRE_HUMAN_LOCK_ENV = "TRUST_LEDGER_CHP_REQUIRE_HUMAN_LOCK";

/**
 * REQUIRE_HUMAN_LOCK-style flag, default ON. Only "0", "false" or "off"
 * (case-insensitive) disable it; an unset or empty variable keeps the
 * human lock mandatory.
 */
export function requireHumanLock(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[REQUIRE_HUMAN_LOCK_ENV];
  if (raw === undefined || raw.trim() === "") return true;
  return !["0", "false", "off"].includes(raw.trim().toLowerCase());
}

export class LockTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockTransitionError";
  }
}

/**
 * EXPLORING -> PROVISIONAL_LOCK. Only the substrate opens a lock, and
 * never for a refused record: a refusal (R0 fatal failures or a floor
 * breach) is terminal and cannot be routed to LOCKED.
 */
export function openProvisionalLock<T extends {
  lockState: LockState;
  fatalFailures?: string[];
  floorResult?: FloorResult;
}>(record: T): T {
  if ((record.fatalFailures?.length ?? 0) > 0 || record.floorResult === "FAIL") {
    throw new LockTransitionError("refused decisions are terminal and cannot be locked");
  }
  if (record.lockState !== "EXPLORING") {
    throw new LockTransitionError(
      `openProvisionalLock requires lockState EXPLORING, got ${record.lockState}`,
    );
  }
  return { ...record, lockState: "PROVISIONAL_LOCK" };
}

/** PROVISIONAL_LOCK -> LOCKED via a named human confirmer. */
export function confirmLock<T extends { lockState: LockState; confirmedBy: string | null }>(
  record: T,
  confirmedBy: string,
): T {
  if (record.lockState === "LOCKED") {
    throw new LockTransitionError(
      `decision is already LOCKED by ${record.confirmedBy ?? "an unknown confirmer"}`,
    );
  }
  if (record.lockState !== "PROVISIONAL_LOCK") {
    throw new LockTransitionError(
      `confirmLock requires lockState PROVISIONAL_LOCK, got ${record.lockState}`,
    );
  }
  const confirmer = confirmedBy.trim();
  if (!confirmer) {
    throw new LockTransitionError("confirmLock requires a named confirmer (confirmed_by)");
  }
  return { ...record, lockState: "LOCKED", confirmedBy: confirmer };
}

export type OutcomeReport = { outcome: Outcome; reason: string };

/**
 * The substrate-enforced serving rule. Refusals are always servable —
 * nothing was promoted. A promotion may only be served when the human
 * lock is satisfied: LOCKED when REQUIRE_HUMAN_LOCK is on (default),
 * PROVISIONAL_LOCK allowed when the flag is explicitly off.
 */
export function recordOutcome(
  record: {
    r0: R0Evaluation;
    floorResult: FloorResult;
    lockState: LockState;
    confirmedBy: string | null;
    fatalFailures: string[];
  },
  options: { requireHumanLock?: boolean } = {},
): OutcomeReport {
  const needsLock = options.requireHumanLock ?? true;
  if (record.r0.verdict === "HALT") {
    return {
      outcome: "refused",
      reason: `R0 HALT: failed ${r0FatalCriteria(record.r0).join(", ")}`,
    };
  }
  if (record.fatalFailures.length > 0) {
    return { outcome: "refused", reason: `fatal: ${record.fatalFailures.join(", ")}` };
  }
  if (record.floorResult === "NOT_ASSESSED") {
    return { outcome: "refused", reason: "foundation was never assessed" };
  }
  if (record.floorResult === "FAIL") {
    return {
      outcome: "refused",
      reason: "foundation score below the domain floor for this record",
    };
  }
  if (record.lockState === "LOCKED") {
    return { outcome: "promoted", reason: `locked by ${record.confirmedBy ?? "unknown"}` };
  }
  if (needsLock) {
    return {
      outcome: "pending_confirmation",
      reason: "REQUIRE_HUMAN_LOCK is on: a named confirmer must lock this decision before it is served",
    };
  }
  return {
    outcome: "promoted",
    reason: "REQUIRE_HUMAN_LOCK is off: provisional record served without a human lock",
  };
}
