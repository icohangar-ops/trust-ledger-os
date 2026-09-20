import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateDecisionRecords } from "./aggregate.js";
import { exampleDecisionEntries } from "./examples.js";

describe("aggregateDecisionRecords", () => {
  it("aggregates the example ledger across verdicts, locks, domains, and integrity", () => {
    const aggregate = aggregateDecisionRecords(exampleDecisionEntries());
    assert.equal(aggregate.total, 5);

    // R0 verdicts: 1 HALT refusal, 4 passing the gate.
    assert.equal(aggregate.byR0Verdict.HALT, 1);
    assert.equal(aggregate.byR0Verdict.PASS, 4);

    // Lock states: 2 locked by humans, 3 refusals left in EXPLORING.
    assert.equal(aggregate.byLockState.LOCKED, 2);
    assert.equal(aggregate.byLockState.EXPLORING, 3);
    assert.equal(aggregate.locked, 2);
    assert.equal(aggregate.pendingHumanLock, 0);

    // Domains.
    assert.equal(aggregate.byDomain.general, 2);
    assert.equal(aggregate.byDomain.finance, 2);
    assert.equal(aggregate.byDomain.blockchain, 1);

    // Refusals: 1 R0 halt + 2 floor breaches = 3.
    assert.equal(aggregate.refusals, 3);
    assert.equal(aggregate.floorBreaches, 2);

    // Integrity: every example entry validates.
    assert.equal(aggregate.integrity.bodyValid, 5);
    assert.equal(aggregate.integrity.bodyInvalid, 0);
    assert.equal(aggregate.integrity.envelopeInvalid, 0);
  });

  it("reports invalid integrity when a record is tampered", () => {
    const entries = exampleDecisionEntries().map((entry, index) =>
      index === 0 ? { ...entry, body: entry.body.replace("1", "9"), integrity_valid: false } : entry,
    );
    const aggregate = aggregateDecisionRecords(entries);
    assert.equal(aggregate.integrity.bodyInvalid, 1);
    assert.equal(aggregate.integrity.bodyValid, 4);
  });

  it("returns an empty, zeroed aggregate for an empty ledger", () => {
    const aggregate = aggregateDecisionRecords([]);
    assert.equal(aggregate.total, 0);
    assert.equal(aggregate.refusals, 0);
    assert.deepEqual(aggregate.byDomain, {});
    assert.equal(aggregate.integrity.bodyInvalid, 0);
  });
});
