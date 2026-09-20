import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateR0Gate, r0FatalCriteria, R0_CRITERIA } from "./r0.js";

describe("evaluateR0Gate", () => {
  it("passes when every criterion holds", () => {
    const evaluation = evaluateR0Gate({ solvable: true, scoped: true, valid: true, worth_it: true });
    assert.equal(evaluation.verdict, "PASS");
    for (const criterion of R0_CRITERIA) {
      assert.equal(evaluation.results[criterion], "PASS");
    }
  });

  it("uses capitalized criterion keys and FATAL for failures", () => {
    const evaluation = evaluateR0Gate({ solvable: true, scoped: false, valid: true, worth_it: true });
    assert.deepEqual(Object.keys(evaluation.results), ["Solvable", "Scoped", "Valid", "Worth_it"]);
    assert.equal(evaluation.results.Scoped, "FATAL");
    assert.equal(evaluation.verdict, "HALT");
    assert.deepEqual(r0FatalCriteria(evaluation), ["Scoped"]);
  });

  it("halts on each individual failing criterion", () => {
    const failures: Array<Parameters<typeof evaluateR0Gate>[0]> = [
      { solvable: false, scoped: true, valid: true, worth_it: true },
      { solvable: true, scoped: false, valid: true, worth_it: true },
      { solvable: true, scoped: true, valid: false, worth_it: true },
      { solvable: true, scoped: true, valid: true, worth_it: false },
    ];
    for (const criteria of failures) {
      const evaluation = evaluateR0Gate(criteria);
      assert.equal(evaluation.verdict, "HALT");
      assert.equal(r0FatalCriteria(evaluation).length, 1);
    }
  });

  it("collects every failing criterion, not just the first", () => {
    const evaluation = evaluateR0Gate({ solvable: false, scoped: false, valid: true, worth_it: false });
    assert.deepEqual(r0FatalCriteria(evaluation), ["Solvable", "Scoped", "Worth_it"]);
    assert.equal(evaluation.verdict, "HALT");
  });
});
