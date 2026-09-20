const tools = [
  {
    name: 'PRISM',
    text: 'Runtime observability for agent calls, approvals, and latency.',
  },
  {
    name: 'Prelint',
    text: 'Pre-merge product review for policy drift, bad defaults, and risky logic.',
  },
  {
    name: 'GIDE',
    text: 'Secure offline editing and emergency fixes when the network is not trusted.',
  },
];

const steps = [
  'Capture a code change, spend request, or agent action.',
  'Review it against product policy and trust rules.',
  'Attach a PRISM trace to the runtime decision.',
  'Produce an approve / deny / counter outcome.',
  'Store the decision in a ledger future runs can reuse.',
];

const roadmap = [
  {
    phase: 'Phase 1',
    title: 'Foundation kit',
    text: 'Ship the shared agent glossary, model/tool matrix, and the when-to-use-an-agent decision tree.',
  },
  {
    phase: 'Phase 2',
    title: 'Framework benchmark',
    text: 'Compare LangGraph, OpenAI Agents SDK, AutoGen, PydanticAI, and LlamaIndex on the same finance task.',
  },
  {
    phase: 'Phase 3',
    title: 'Research and reasoning',
    text: 'Deliver the fundamental analysis pipeline, deep search flow, and reusable reasoning templates.',
  },
  {
    phase: 'Phase 4',
    title: 'Production controls',
    text: 'Add eval harnesses, drift checks, tracing, guardrails, and human approval gates before release.',
  },
  {
    phase: 'Phase 5',
    title: 'Decision substrate',
    text: 'Record every promote / refuse / lock as a CHP decision record: R0 gate, deterministic scoring, per-domain floors, and human locks on an append-only sealed ledger.',
  },
];

export default function Page() {
  return (
    <main>
      <div className="shell">
        <section className="hero">
          <div className="eyebrow">BuilderBase · Trust and Risk</div>
          <h1>Trust Ledger OS</h1>
          <p className="lede">
            A trust and risk control plane for AI teams. Every high-impact change is
            reviewed, traced, and recorded before it reaches customers or cash.
          </p>

          <div className="hero-grid">
            <div className="panel">
              <h2>Problem</h2>
              <p>
                AI teams are shipping code, spend, and agent actions faster than humans can
                review them. Existing tools catch bugs or logs, but not product policy drift,
                runtime risk, and approval history in one place.
              </p>
            </div>

            <div className="panel">
              <h2>What it does</h2>
              <div className="mini-grid">
                <div className="stat">
                  <span className="label">Runtime</span>
                  <strong>PRISM traces</strong>
                </div>
                <div className="stat">
                  <span className="label">Review</span>
                  <strong>Prelint checks</strong>
                </div>
                <div className="stat">
                  <span className="label">Offline</span>
                  <strong>GIDE edits</strong>
                </div>
                <div className="stat">
                  <span className="label">Ledger</span>
                  <strong>Approve / deny</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sections">
          <article className="section span-6">
            <h2>How it works</h2>
            <div className="timeline">
              {steps.map((step, index) => (
                <div className="step" key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="section span-6">
            <h2>Tool stack</h2>
            <div className="tools">
              {tools.map((tool) => (
                <div className="tool" key={tool.name}>
                  <h3>{tool.name}</h3>
                  <p>{tool.text}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="section span-8">
            <h2>BuilderBase fit</h2>
            <p>
              Trust Ledger OS closes the gap between shipping fast and staying in control.
              It makes every high-impact change reviewed, traced, and recorded before it
              reaches customers or cash.
            </p>
          </article>

          <article className="section span-4">
            <h2>Implementation roadmap</h2>
            <div className="timeline">
              {roadmap.map((item) => (
                <div className="step" key={item.phase}>
                  <span>{item.phase.replace('Phase ', '')}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14 }}>
              <a href="/foundation" style={{ color: 'var(--accent)' }}>
                Open the foundation scaffold
              </a>
            </p>
            <p>
              <a href="/framework-benchmark" style={{ color: 'var(--accent)' }}>
                Open the framework benchmark scaffold
              </a>
            </p>
            <p>
              <a href="/research-reasoning" style={{ color: 'var(--accent)' }}>
                Open the research and reasoning scaffold
              </a>
            </p>
            <p>
              <a href="/production-controls" style={{ color: 'var(--accent)' }}>
                Open the production controls scaffold
              </a>
            </p>
          <p>
            <a href="/decisions" style={{ color: 'var(--accent)' }}>
              Open the decision ledger
            </a>
          </p>
          </article>
        </section>

        <div className="footer">
          Repo base: `trust-ledger-os` · Mirrors to `icohangar-ops` and `Cubiczan`
        </div>
      </div>
    </main>
  );
}
