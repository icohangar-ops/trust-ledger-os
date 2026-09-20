import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DOMAIN_FLOORS, GENERAL_FLOOR, assessFloor, resolveDomainFloor } from "./floors.js";
import { scoreFoundation } from "./adversary.js";
import { buildDecisionRecord } from "./substrate.js";

describe("domain floors", () => {
  it("defaults to the general floor of 70", () => {
    assert.equal(GENERAL_FLOOR, 70);
    assert.equal(resolveDomainFloor("general"), 70);
    assert.equal(resolveDomainFloor("something-unheard-of"), 70);
  });

  it("gates financial claims at 100 and on-chain claims at 85", () => {
    assert.equal(resolveDomainFloor("finance"), 100);
    assert.equal(resolveDomainFloor("blockchain"), 85);
    assert.equal(resolveDomainFloor("defi"), 85);
    assert.equal(DEFAULT_DOMAIN_FLOORS.defi, DEFAULT_DOMAIN_FLOORS.blockchain);
  });

  it("supports configurable floor tables and per-record overrides", () => {
    const floors = { general: 50, "insurance-claims": 95 };
    assert.equal(resolveDomainFloor("insurance-claims", floors), 95);
    assert.equal(resolveDomainFloor("general", floors), 50);
    // Per-record override wins over everything.
    assert.equal(resolveDomainFloor("finance", floors, 60), 60);
    assert.equal(resolveDomainFloor("general", DEFAULT_DOMAIN_FLOORS, 100), 100);
  });

  it("fails a record scoring below its floor and passes one at the floor", () => {
    assert.equal(assessFloor(70, 70).result, "PASS");
    assert.equal(assessFloor(69, 70).result, "FAIL");
    assert.equal(assessFloor(85, 85).breached, false);
  });
});

describe("floor failures per domain", () => {
  const fullEvidence = { guardrailsPassed: true, boundedResult: { rowCount: 3 }, parity: null };

  it("refuses a finance claim at 70 against the 100 floor", () => {
    const record = buildDecisionRecord({
      decisionId: "fin-floor",
      title: "Financial claim without parity",
      domain: "finance",
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: fullEvidence,
    });
    assert.equal(record.foundation?.score, 70);
    assert.equal(record.floorResult, "FAIL");
    assert.equal(record.lockState, "EXPLORING");
  });

  it("refuses an on-chain claim at 70 against the 85 floor but passes at 90", () => {
    const low = buildDecisionRecord({
      decisionId: "chain-floor-low",
      title: "On-chain claim, partial evidence",
      domain: "blockchain",
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: fullEvidence,
    });
    assert.equal(low.floor, 85);
    assert.equal(low.floorResult, "FAIL");

    const high = buildDecisionRecord({
      decisionId: "chain-floor-high",
      title: "On-chain claim with parity",
      domain: "blockchain",
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: {
        guardrailsPassed: true,
        boundedResult: { rowCount: 1 },
        parity: { caseId: "c1", metric: "tvl", unit: "usd", expected: 10, tolerance: 0.5, actual: 10, withinTolerance: true },
      },
    });
    assert.equal(high.foundation?.score, 100);
    assert.equal(high.floorResult, "PASS");
  });

  it("passes a general claim at exactly 70 and honors a per-record override", () => {
    const passed = buildDecisionRecord({
      decisionId: "gen-floor",
      title: "General claim at floor",
      domain: "general",
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: fullEvidence,
    });
    assert.equal(passed.floorResult, "PASS");
    assert.equal(passed.floor, 70);

    const overridden = buildDecisionRecord({
      decisionId: "gen-override",
      title: "General claim with a stricter per-record floor",
      domain: "general",
      floorOverride: 90,
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: fullEvidence,
    });
    assert.equal(overridden.floor, 90);
    assert.equal(overridden.floorResult, "FAIL");
  });

  it("keeps parity-mismatch refusals fatal regardless of floor", () => {
    const record = buildDecisionRecord({
      decisionId: "fin-parity-mismatch",
      title: "Financial claim contradicting pinned truth",
      domain: "finance",
      floorOverride: 10,
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: {
        guardrailsPassed: true,
        boundedResult: { rowCount: 1 },
        parity: { caseId: "fin-9", metric: "revenue", unit: "usd", expected: 100, tolerance: 1, actual: 55, withinTolerance: false },
      },
    });
    assert.deepEqual(record.fatalFailures, ["parity_mismatch"]);
    assert.equal(record.floorResult, "NOT_ASSESSED");
    assert.equal(scoreFoundation({ guardrailsPassed: false, boundedResult: null, parity: null }).score, 0);
  });
});
