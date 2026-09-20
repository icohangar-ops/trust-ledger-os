import type { LedgerEntry } from "./types.js";
import { scoreFoundation } from "./adversary.js";
import { assessFloor, resolveDomainFloor } from "./floors.js";
import { confirmLock, openProvisionalLock } from "./locks.js";
import { sealRecord } from "./ledger.js";
import { evaluateR0Gate } from "./r0.js";
import type { DecisionRecord } from "./types.js";

const EXAMPLE_EPOCH = "2026-09-20T00:00:00.000Z";

/**
 * Deterministic example decision records for the trust/risk views. They
 * run through the real gate -> adversary -> floor -> lock pipeline (no
 * ledger I/O) so every view renders what the substrate actually records.
 */
function baseRecord(partial: Pick<DecisionRecord, "decisionId" | "title" | "domain"> & { floor?: number }): DecisionRecord {
  const r0 = evaluateR0Gate({ solvable: true, scoped: true, valid: true, worth_it: true });
  return {
    decisionId: partial.decisionId,
    title: partial.title,
    domain: partial.domain,
    createdAt: EXAMPLE_EPOCH,
    owner: "trust-ledger-os",
    r0,
    foundation: null,
    floor: partial.floor ?? resolveDomainFloor(partial.domain),
    floorResult: "NOT_ASSESSED",
    lockState: "EXPLORING",
    confirmedBy: null,
    fatalFailures: [],
    artifacts: {},
  };
}

export function exampleDecisionEntries(): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  // 1. General-domain claim, fully evidenced, locked by a named human.
  const general = baseRecord({ decisionId: "general-evidence-001", title: "Approve agent summary of support-volume trend", domain: "general" });
  const generalFoundation = scoreFoundation(
    { guardrailsPassed: true, boundedResult: { rowCount: 1, latencyMs: 42 }, parity: null },
    general.domain,
  );
  entries.push(
    sealRecord(confirmLock(openProvisionalLock({ ...general, foundation: generalFoundation, floorResult: assessFloor(generalFoundation.score, general.floor).result === "FAIL" ? "FAIL" : "PASS" }), "ops-lead@trustledger.dev"), { recordedAt: EXAMPLE_EPOCH }),
  );

  // 2. Finance claim with golden parity — the only way past the 100 floor.
  const financeOk = baseRecord({ decisionId: "finance-parity-002", title: "Publish net-revenue figure to the board view", domain: "finance" });
  const financeOkFoundation = scoreFoundation(
    {
      guardrailsPassed: true,
      boundedResult: { rowCount: 1, latencyMs: 17 },
      parity: { caseId: "fin-001", metric: "net_revenue", unit: "usd", expected: 1_730_000, tolerance: 1, actual: 1_730_000, withinTolerance: true },
    },
    financeOk.domain,
  );
  entries.push(
    sealRecord(confirmLock(openProvisionalLock({ ...financeOk, foundation: financeOkFoundation, floorResult: assessFloor(financeOkFoundation.score, financeOk.floor).result === "FAIL" ? "FAIL" : "PASS" }), "cfo@trustledger.dev"), { recordedAt: EXAMPLE_EPOCH }),
  );

  // 3. Finance claim without parity — score 70 cannot pass the 100 floor.
  const financeWeak = baseRecord({ decisionId: "finance-unverified-003", title: "Publish unverified margin estimate", domain: "finance" });
  const financeWeakFoundation = scoreFoundation({ guardrailsPassed: true, boundedResult: { rowCount: 1, latencyMs: 9 }, parity: null }, financeWeak.domain);
  entries.push(
    sealRecord({ ...financeWeak, foundation: financeWeakFoundation, floorResult: assessFloor(financeWeakFoundation.score, financeWeak.floor).result }, { recordedAt: EXAMPLE_EPOCH }),
  );

  // 4. On-chain claim below the blockchain/DeFi floor (85).
  const chain = baseRecord({ decisionId: "chain-tvl-004", title: "Publish protocol TVL without a second source", domain: "blockchain" });
  const chainFoundation = scoreFoundation({ guardrailsPassed: true, boundedResult: { rowCount: 1 }, parity: null }, chain.domain);
  entries.push(
    sealRecord({ ...chain, foundation: chainFoundation, floorResult: assessFloor(chainFoundation.score, chain.floor).result }, { recordedAt: EXAMPLE_EPOCH }),
  );

  // 5. R0 refusal recorded before anything executed (not worth_it).
  const halted = baseRecord({ decisionId: "r0-halt-005", title: "Promote a vanity question with no metric", domain: "general" });
  const haltedRecord: DecisionRecord = {
    ...halted,
    r0: evaluateR0Gate({ solvable: true, scoped: true, valid: true, worth_it: false }),
    fatalFailures: ["r0_fatal:Worth_it"],
  };
  entries.push(sealRecord(haltedRecord, { recordedAt: EXAMPLE_EPOCH }));

  return entries;
}
