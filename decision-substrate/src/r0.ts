import type { R0Criteria, R0Criterion, R0CriterionResult, R0Evaluation } from "./types.js";

export const R0_CRITERIA: readonly R0Criterion[] = ["Solvable", "Scoped", "Valid", "Worth_it"];

/**
 * The pre-execution gate: HALT before the engine sees the request.
 * Failing criteria read "FATAL" under their capitalized CHP keys; any
 * FATAL halts the whole evaluation.
 */
export function evaluateR0Gate(criteria: R0Criteria): R0Evaluation {
  const results: Record<R0Criterion, R0CriterionResult> = {
    Solvable: criteria.solvable ? "PASS" : "FATAL",
    Scoped: criteria.scoped ? "PASS" : "FATAL",
    Valid: criteria.valid ? "PASS" : "FATAL",
    Worth_it: criteria.worth_it ? "PASS" : "FATAL",
  };
  const halted = R0_CRITERIA.some((criterion) => results[criterion] === "FATAL");
  return { verdict: halted ? "HALT" : "PASS", results };
}

/** The capitalized criteria whose result is FATAL, in canonical order. */
export function r0FatalCriteria(evaluation: R0Evaluation): R0Criterion[] {
  return R0_CRITERIA.filter((criterion) => evaluation.results[criterion] === "FATAL");
}
