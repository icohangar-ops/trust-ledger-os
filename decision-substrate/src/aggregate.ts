import type { LedgerEntry, LockState } from "./types.js";

export type DecisionAggregate = {
  total: number;
  byR0Verdict: { PASS: number; HALT: number };
  byLockState: Record<LockState, number>;
  byDomain: Record<string, number>;
  refusals: number;
  floorBreaches: number;
  locked: number;
  pendingHumanLock: number;
  integrity: {
    entries: number;
    bodyValid: number;
    bodyInvalid: number;
    envelopeInvalid: number;
  };
};

/**
 * The primitive trust/risk views aggregate: one pass over decision
 * records producing the counts a control plane needs — verdicts, lock
 * states, refusals, floor breaches, and ledger integrity health.
 */
export function aggregateDecisionRecords(entries: LedgerEntry[]): DecisionAggregate {
  const aggregate: DecisionAggregate = {
    total: entries.length,
    byR0Verdict: { PASS: 0, HALT: 0 },
    byLockState: { EXPLORING: 0, PROVISIONAL_LOCK: 0, LOCKED: 0 },
    byDomain: {},
    refusals: 0,
    floorBreaches: 0,
    locked: 0,
    pendingHumanLock: 0,
    integrity: { entries: entries.length, bodyValid: 0, bodyInvalid: 0, envelopeInvalid: 0 },
  };

  for (const entry of entries) {
    aggregate.byR0Verdict[entry.r0_verdict] += 1;
    aggregate.byLockState[entry.lock_state] += 1;
    aggregate.byDomain[entry.domain] = (aggregate.byDomain[entry.domain] ?? 0) + 1;
  }

  // Refusals and floor breaches read from the sealed body so the counts
  // cannot drift from what was actually recorded.
  for (const entry of entries) {
    const payload = safeParse(entry.body);
    const fatal: string[] = payload?.fatal_failures ?? [];
    if (entry.r0_verdict === "HALT" || fatal.length > 0 || payload?.floor_result === "FAIL") {
      aggregate.refusals += 1;
    }
    if (payload?.floor_result === "FAIL") aggregate.floorBreaches += 1;
    if (payload?.lock_state === "LOCKED") aggregate.locked += 1;
    if (payload?.lock_state === "PROVISIONAL_LOCK") aggregate.pendingHumanLock += 1;
  }

  for (const entry of entries) {
    if (entry.integrity_valid === true) aggregate.integrity.bodyValid += 1;
    else aggregate.integrity.bodyInvalid += 1;
    if (entry.envelope_valid === false) aggregate.integrity.envelopeInvalid += 1;
  }

  return aggregate;
}

function safeParse(body: string): { fatal_failures?: string[]; floor_result?: string; lock_state?: string } | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
