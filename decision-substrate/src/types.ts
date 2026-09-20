/**
 * CHP decision-record primitives (Profile A shape) for Trust Ledger OS.
 *
 * Ported from the erp-control-plane decision substrate (api/genbi/chp.py,
 * commit 70678cc): R0 gate, deterministic adversary scoring, the human-lock
 * state machine, and a sealed decision ledger. The published `@cubiczan/chp`
 * package ships the Profile B capital gate only, so the Profile A
 * decision-record shape is implemented here directly — see
 * decision-substrate/README.md for the documented divergence.
 */

export type R0Criterion = "Solvable" | "Scoped" | "Valid" | "Worth_it";

export type R0CriterionResult = "PASS" | "FATAL";

export type R0Verdict = "PASS" | "HALT";

export type R0Criteria = {
  solvable: boolean;
  scoped: boolean;
  valid: boolean;
  worth_it: boolean;
};

export type R0Evaluation = {
  verdict: R0Verdict;
  /** Capitalized CHP criterion keys; failing criteria read "FATAL". */
  results: Record<R0Criterion, R0CriterionResult>;
};

/** Known domains get curated floors; any other domain falls back to general. */
export type DecisionDomain = "general" | "finance" | "blockchain" | "defi" | (string & {});

export type ParityEvidence = {
  caseId: string;
  metric: string;
  unit: string;
  expected: number;
  tolerance: number;
  /** null = the result is not a single comparable scalar. */
  actual: number | null;
  withinTolerance: boolean | null;
};

export type FoundationInput = {
  guardrailsPassed: boolean;
  /** Bounded execution result; null = nothing bounded was returned. */
  boundedResult: { rowCount: number; latencyMs?: number } | null;
  parity: ParityEvidence | null;
  /** True when a golden-set case matched, even if parity is not measurable. */
  goldenMatched?: boolean;
};

export type FoundationAssessment = {
  /** 0-100: 40 guardrails + 30 bounded result + 30 golden parity. */
  score: number;
  domain: DecisionDomain;
  findings: string[];
  parity: ParityEvidence | null;
  goldenMatched: boolean;
  /** Deterministic fatal failures (e.g. "parity_mismatch"). */
  fatalFailures: string[];
};

export type LockState = "EXPLORING" | "PROVISIONAL_LOCK" | "LOCKED";

export type FloorResult = "PASS" | "FAIL" | "NOT_ASSESSED";

export type DecisionRecord = {
  decisionId: string;
  title: string;
  domain: DecisionDomain;
  createdAt: string;
  owner: string;
  r0: R0Evaluation;
  /** null when R0 halted — nothing was executed or assessed. */
  foundation: FoundationAssessment | null;
  /** Domain floor resolved for this record (per-record override wins). */
  floor: number;
  floorResult: FloorResult;
  lockState: LockState;
  confirmedBy: string | null;
  /** FATAL failures: r0_fatal:<criterion> and parity_mismatch. */
  fatalFailures: string[];
  artifacts: Record<string, unknown>;
};

export type Outcome = "promoted" | "pending_confirmation" | "refused";

export type Envelope = {
  chp_version: string;
  route: string;
  algorithm: "sha256";
  created_at: string;
};

export type LedgerEntry = {
  decision_id: string;
  recorded_at: string;
  domain: DecisionDomain;
  lock_state: LockState;
  r0_verdict: R0Verdict;
  foundation_score: number | null;
  floor: number;
  floor_result: FloorResult;
  confirmed_by: string | null;
  /** Canonical JSON (sorted keys, no whitespace) of the sealed payload. */
  body: string;
  body_sha256: string;
  envelope: Envelope;
  /** Set on read: structure-only envelope validation. */
  envelope_valid?: boolean;
  /** Set on read: SHA-256 digest over the stored body bytes. */
  integrity_valid?: boolean;
  /** Set on read when the line could not be parsed at all. */
  error?: string;
};
