import { aggregateDecisionRecords, exampleDecisionEntries } from "@/decision-substrate/dist/index.js";

/**
 * The body of a sealed ledger entry, narrowed to the fields the ledger
 * view renders. Ledger facts (verdict, score, lock state, integrity)
 * live on the entry itself; narrative facts stay in the body.
 */
type DecisionBodyView = {
  title?: string;
  fatalFailures?: string[];
  criteria?: Partial<Record<"Solvable" | "Scoped" | "Valid" | "Worth_it", string>>;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tool">
      <h3>{value}</h3>
      <p>{label}</p>
    </div>
  );
}

export default function DecisionsPage() {
  const entries = exampleDecisionEntries();
  const aggregate = aggregateDecisionRecords(entries);

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <div className="eyebrow">CHP decision substrate</div>
          <h1>Decision ledger</h1>
          <p className="lede">
            Every consequential decision — promote a claim, refuse it, lock it — is recorded
            through one primitive: R0 gate, deterministic foundation scoring, a per-domain floor,
            and a human lock the substrate enforces. These views aggregate that ledger.
          </p>
        </section>

        <section className="sections">
          <article className="section span-12">
            <h2>Ledger at a glance</h2>
            <p>
              Counts below aggregate {aggregate.total} example decisions sealed with the same
              primitive the file-backed JSONL ledger persists (see{" "}
              <a href="/api/decisions" style={{ color: "var(--accent)" }}>GET /api/decisions</a>{" "}
              for a live read).
            </p>
            <div className="tools">
              <StatCard label="decisions recorded" value={aggregate.total} />
              <StatCard label="refusals (R0 halt or floor breach)" value={aggregate.refusals} />
              <StatCard label="locked by a named human" value={aggregate.locked} />
              <StatCard label="awaiting human confirmation" value={aggregate.pendingHumanLock} />
              <StatCard label="integrity revalidated on read" value={`${aggregate.integrity.bodyValid}/${aggregate.total}`} />
            </div>
          </article>

          <article className="section span-6">
            <h2>Domain floors</h2>
            <div className="tools">
              <div className="tool">
                <h3>General — 70</h3>
                <p>Default floor. A 70-point foundation score passes exactly.</p>
              </div>
              <div className="tool">
                <h3>Finance — 100</h3>
                <p>Financial claims need a golden-parity pass; 70 is not enough.</p>
              </div>
              <div className="tool">
                <h3>Blockchain / DeFi — 85</h3>
                <p>On-chain claims are gated above the default. Floors are configurable per record.</p>
              </div>
            </div>
          </article>

          <article className="section span-6">
            <h2>Lock state machine</h2>
            <div className="timeline">
              <div className="step">
                <span>1</span>
                <div>
                  <h3>EXPLORING</h3>
                  <p>The decision is an open question. Refusals are recorded here and are terminal.</p>
                </div>
              </div>
              <div className="step">
                <span>2</span>
                <div>
                  <h3>PROVISIONAL_LOCK</h3>
                  <p>A passing record opens provisional — it cannot serve as promoted yet.</p>
                </div>
              </div>
              <div className="step">
                <span>3</span>
                <div>
                  <h3>LOCKED</h3>
                  <p>A named human confirms. The lock state machine is enforced by the substrate, not callers, and REQUIRE_HUMAN_LOCK defaults on.</p>
                </div>
              </div>
            </div>
          </article>

          <article className="section span-12">
            <h2>Recorded decisions</h2>
            <div className="tools">
              {entries.map((entry) => {
                let body: DecisionBodyView = {};
                try {
                  body = JSON.parse(entry.body) as DecisionBodyView;
                } catch {
                  body = {};
                }
                return (
                  <div className="tool" key={`${entry.decision_id}-${entry.recorded_at}`}>
                    <h3>{body.title ?? entry.decision_id}</h3>
                    <p>
                      {entry.decision_id} · {entry.domain} · {new Date(entry.recorded_at).toISOString().slice(0, 10)}
                    </p>
                    <p>
                      R0 {entry.r0_verdict} · foundation {entry.foundation_score ?? "—"} vs floor {entry.floor} ({entry.floor_result}) · lock {entry.lock_state}
                      {entry.confirmed_by ? ` by ${entry.confirmed_by}` : ""}
                    </p>
                    {body.fatalFailures && body.fatalFailures.length > 0 ? (
                      <p>fatal: {body.fatalFailures.join(", ")}</p>
                    ) : null}
                    <p>
                      integrity {entry.integrity_valid ? "valid" : "INVALID"} · envelope {entry.envelope_valid ? "valid" : "INVALID"} · sha256 {entry.body_sha256.slice(0, 12)}…
                    </p>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="section span-12">
            <h2>How a decision is recorded</h2>
            <div className="timeline">
              <div className="step">
                <span>1</span>
                <div>
                  <h3>R0 gate</h3>
                  <p>Solvable / Scoped / Valid / Worth it. Any FATAL halts before anything executes, and the refusal is recorded.</p>
                </div>
              </div>
              <div className="step">
                <span>2</span>
                <div>
                  <h3>Foundation pass</h3>
                  <p>Guardrails 40 + bounded result 30 + golden parity 30. A parity mismatch is fatal regardless of floor.</p>
                </div>
              </div>
              <div className="step">
                <span>3</span>
                <div>
                  <h3>Domain floor</h3>
                  <p>The score must clear the floor for the claim's domain — no single hardcoded threshold.</p>
                </div>
              </div>
              <div className="step">
                <span>4</span>
                <div>
                  <h3>Sealed append</h3>
                  <p>Canonical JSON body (via @cubiczan/chp), SHA-256 body_sha256, CHP payload envelope. Reads revalidate both integrity and envelope structure.</p>
                </div>
              </div>
            </div>
          </article>
        </section>

        <div className="footer">
          decision-substrate/ · TypeScript port of the CHP decision-record primitive proven in erp-control-plane 70678cc
        </div>
      </div>
    </main>
  );
}
