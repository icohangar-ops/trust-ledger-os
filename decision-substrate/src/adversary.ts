import type {
  DecisionDomain,
  FoundationAssessment,
  FoundationInput,
} from "./types.js";

/**
 * Deterministic adversary scoring (out of 100). Weights mirror the
 * erp-control-plane reference: 40 guardrails + 30 bounded result +
 * 30 golden parity. The finance floor is exactly 100, so only a
 * parity-verified answer can self-certify a financial claim.
 */
export const GUARDRAIL_POINTS = 40;
export const BOUNDED_RESULT_POINTS = 30;
export const PARITY_POINTS = 30;
export const FULL_SCORE = GUARDRAIL_POINTS + BOUNDED_RESULT_POINTS + PARITY_POINTS;

export function scoreFoundation(
  input: FoundationInput,
  domain: DecisionDomain = "general",
): FoundationAssessment {
  let score = 0;
  const findings: string[] = [];
  const fatalFailures: string[] = [];

  if (input.guardrailsPassed) {
    score += GUARDRAIL_POINTS;
    findings.push("guardrails passed: bounded, read-only execution");
  } else {
    findings.push("guardrails failed: unbounded or mutating execution");
  }

  const rowCount = input.boundedResult?.rowCount ?? 0;
  if (rowCount >= 1) {
    score += BOUNDED_RESULT_POINTS;
    const latency = input.boundedResult?.latencyMs;
    findings.push(latency === undefined ? `bounded result: ${rowCount} row(s)` : `bounded result: ${rowCount} row(s) in ${latency} ms`);
  } else {
    findings.push("query returned zero rows — no result evidence");
  }

  let goldenMatched = input.goldenMatched ?? false;
  if (input.parity === null) {
    if (goldenMatched) {
      findings.push("golden case matched but the result is not a single comparable scalar — parity evidence unavailable");
    } else {
      findings.push("no golden-set case matches — parity evidence unavailable");
    }
  } else {
    goldenMatched = true;
    const parity = input.parity;
    if (parity.actual === null) {
      findings.push("golden case matched but the result is not a single comparable scalar — parity evidence unavailable");
    } else if (parity.withinTolerance) {
      score += PARITY_POINTS;
      findings.push(
        `golden parity: ${parity.caseId} (${parity.metric}) expected ${parity.expected} ± ${parity.tolerance} ${parity.unit}, got ${parity.actual}`,
      );
    } else {
      findings.push(
        `golden parity MISMATCH: ${parity.caseId} (${parity.metric}) expected ${parity.expected} ± ${parity.tolerance} ${parity.unit}, got ${parity.actual}`,
      );
      // An answer contradicting pinned truth must not persist, and no
      // confirmer can wave it through.
      fatalFailures.push("parity_mismatch");
    }
  }

  return {
    score: Math.min(score, FULL_SCORE),
    domain,
    findings,
    parity: input.parity,
    goldenMatched,
    fatalFailures,
  };
}
