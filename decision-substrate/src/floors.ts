import type { DecisionDomain } from "./types.js";

/** CHP's general-domain floor: the default for records without a curated floor. */
export const GENERAL_FLOOR = 70;

/**
 * Per-domain floors, configurable per record. finance gates at exactly
 * 100 — a financial claim can only self-certify with full evidence.
 * blockchain and defi gate at 85 for on-chain claims. Both spellings are
 * pinned so a synonym cannot silently drop a claim to the general floor.
 * Unknown domains fall back to GENERAL_FLOOR.
 */
export const DEFAULT_DOMAIN_FLOORS: Record<DecisionDomain, number> = {
  general: GENERAL_FLOOR,
  finance: 100,
  blockchain: 85,
  defi: 85,
};

export type FloorAssessment = {
  result: "PASS" | "FAIL";
  score: number;
  floor: number;
  breached: boolean;
};

/**
 * Resolve the floor for one record: an explicit per-record override wins,
 * then the configured domain floor, then the general default.
 */
export function resolveDomainFloor(
  domain: DecisionDomain,
  floors: Record<string, number> = DEFAULT_DOMAIN_FLOORS,
  override?: number,
): number {
  if (override !== undefined) return override;
  return floors[domain] ?? floors.general ?? GENERAL_FLOOR;
}

export function assessFloor(score: number, floor: number): FloorAssessment {
  const breached = score < floor;
  return { result: breached ? "FAIL" : "PASS", score, floor, breached };
}
