import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LockTransitionError,
  REQUIRE_HUMAN_LOCK_ENV,
  confirmLock,
  openProvisionalLock,
  recordOutcome,
  requireHumanLock,
} from "./locks.js";
import { buildDecisionRecord } from "./substrate.js";
import type { DecisionRecord } from "./types.js";

function provisionalRecord(): DecisionRecord {
  return buildDecisionRecord({
    decisionId: "lock-flow",
    title: "Provisional record",
    domain: "general",
    criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
    foundation: { guardrailsPassed: true, boundedResult: { rowCount: 2 }, parity: null },
  });
}

describe("lock state machine", () => {
  it("opens EXPLORING as PROVISIONAL_LOCK and locks via a named confirmer", () => {
    const opened = openProvisionalLock({ lockState: "EXPLORING" });
    assert.equal(opened.lockState, "PROVISIONAL_LOCK");
    const locked = confirmLock({ ...opened, confirmedBy: null }, "  auditor@corp  ");
    assert.equal(locked.lockState, "LOCKED");
    assert.equal(locked.confirmedBy, "auditor@corp");
  });

  it("refuses to open a lock on anything but EXPLORING", () => {
    assert.throws(() => openProvisionalLock({ lockState: "PROVISIONAL_LOCK" }), LockTransitionError);
    assert.throws(() => openProvisionalLock({ lockState: "LOCKED" }), LockTransitionError);
  });

  it("refuses confirmation from EXPLORING or LOCKED, or with an empty confirmer", () => {
    assert.throws(
      () => confirmLock({ lockState: "EXPLORING", confirmedBy: null }, "human"),
      /requires lockState PROVISIONAL_LOCK/,
    );
    assert.throws(
      () => confirmLock({ lockState: "LOCKED", confirmedBy: "first" }, "second"),
      /already LOCKED/,
    );
    for (const empty of ["", "   "]) {
      assert.throws(
        () => confirmLock({ lockState: "PROVISIONAL_LOCK", confirmedBy: null }, empty),
        /named confirmer/,
      );
    }
  });

  it("never opens a provisional lock on a refusal record", () => {
    const record = buildDecisionRecord({
      decisionId: "refused",
      title: "Floor breach",
      domain: "finance",
      criteria: { solvable: true, scoped: true, valid: true, worth_it: true },
      foundation: { guardrailsPassed: true, boundedResult: { rowCount: 1 }, parity: null },
    });
    assert.equal(record.floorResult, "FAIL");
    assert.equal(record.lockState, "EXPLORING");
    assert.throws(() => openProvisionalLock(record), LockTransitionError);
  });
});

describe("REQUIRE_HUMAN_LOCK flag", () => {
  it("defaults ON when unset or empty", () => {
    assert.equal(requireHumanLock({}), true);
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: "" }), true);
  });

  it("only accepts 0, false, or off to disable", () => {
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: "0" }), false);
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: "false" }), false);
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: " OFF " }), false);
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: "1" }), true);
    assert.equal(requireHumanLock({ [REQUIRE_HUMAN_LOCK_ENV]: "yes" }), true);
  });
});

describe("substrate-enforced serving rule", () => {
  const passingRecord = provisionalRecord();

  it("withholds promotion from a provisional record while the flag is on (default)", () => {
    const report = recordOutcome(passingRecord);
    assert.equal(report.outcome, "pending_confirmation");
    assert.match(report.reason, /REQUIRE_HUMAN_LOCK is on/);
  });

  it("serves a provisional record as promoted when the flag is explicitly off", () => {
    const report = recordOutcome(passingRecord, { requireHumanLock: false });
    assert.equal(report.outcome, "promoted");
  });

  it("serves a locked record as promoted regardless of the flag", () => {
    const locked = confirmLock(passingRecord, "human@corp");
    assert.equal(recordOutcome(locked, {}).outcome, "promoted");
    assert.equal(recordOutcome(locked, { requireHumanLock: false }).outcome, "promoted");
  });

  it("always serves refusals as refused", () => {
    const halted = buildDecisionRecord({
      decisionId: "halted",
      title: "R0 refusal",
      domain: "general",
      criteria: { solvable: false, scoped: true, valid: true, worth_it: true },
    });
    assert.equal(recordOutcome(halted, {}).outcome, "refused");
    assert.equal(recordOutcome(halted, { requireHumanLock: false }).outcome, "refused");
  });
});
