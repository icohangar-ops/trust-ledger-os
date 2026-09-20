# decision-substrate

The CHP decision-record substrate for Trust Ledger OS: R0 gate, deterministic
adversary scoring, configurable domain floors, the human-lock state machine,
and a sealed append-only decision ledger. Ported from the erp-control-plane
reference (`api/genbi/chp.py`, commit `70678cc`) — the shape, not the code.

## Package provenance (divergence note)

The task chain was: use the published npm package → fall back to the
`chp-examples` TS consumer → implement the decision-record shape directly.
What was actually found:

- **`@cubiczan/chp@0.1.1` is published**, but its programmatic surface is the
  **Profile B capital gate** (`evaluateGate`, `approveHuman`, `GatePolicy` —
  spend/budget limits) plus canonical-JSON and hashing utilities
  (`canonicalJson`, `contentHash`, `chainHash`). It has **no** R0 gate, no
  adversary foundation scoring, no lock state machine, and no payload
  envelope — the Profile A decision-substrate machinery.
- **`chp-examples/typescript/clearance-gate`** consumes that same Profile B
  gate, so it does not cover the decision-record shape either.

Therefore the Profile A decision-record shape (R0 with capitalized
`Solvable`/`Scoped`/`Valid`/`Worth_it` keys and `FATAL` failures, the
40/30/30 adversary, `EXPLORING → PROVISIONAL_LOCK → LOCKED`) is **implemented
directly in this kit**. The published package **is** used for what it does
provide: `canonicalJson` (CHP spec §3.1 canonicalization) and `contentHash`
(SHA-256 over canonical JSON) seal every ledger body, so ledger digests stay
byte-compatible with the rest of the CHP portfolio.

## Shape

- **R0 gate** (`r0.ts`) — pre-execution criteria; any `FATAL` halts before
  the engine runs. Refusals are recorded, not discarded.
- **Adversary** (`adversary.ts`) — deterministic foundation score out of 100:
  40 guardrails + 30 bounded result + 30 golden parity. A parity mismatch
  against pinned truth is fatal and cannot be confirmed by a human.
- **Floors** (`floors.ts`) — configurable per record: `general: 70` (default),
  `finance: 100` (financial claims self-certify only with full parity
  evidence), `blockchain`/`defi: 85` (on-chain claims). Unknown domains fall
  back to the general floor; per-record overrides win.
- **Locks** (`locks.ts`) — the state machine is enforced here, not by
  callers: `EXPLORING → PROVISIONAL_LOCK → LOCKED` via a named
  `confirmed_by`; refusals can never be locked;
  `TRUST_LEDGER_CHP_REQUIRE_HUMAN_LOCK` (default ON) makes the human
  confirmer mandatory before a record serves as promoted. Only
  `0`/`false`/`off` disable the flag.
- **Ledger** (`ledger.ts`) — append-only JSONL (default
  `.trust-ledger/decisions.jsonl`, gitignored state). The CHP payload
  envelope validates **structure only**; the ledger adds its own
  `body_sha256` (SHA-256 over the canonical body) and re-validates both on
  every read, exposing `envelope_valid` and `integrity_valid`. A state change
  appends a new entry for the same `decision_id` — nothing is rewritten.
- **Aggregation** (`aggregate.ts`) — the pass trust/risk views run over
  decision records: verdicts, lock states, refusals, floor breaches, and
  ledger integrity health.

## Tests

```
npm run build:substrate   # tsc -p decision-substrate/tsconfig.json
node --test decision-substrate/dist/*.test.js
```

The suite mirrors the erp-control-plane CHP tests: R0 refusal recorded,
floor failures per domain, substrate-enforced lock flow, ledger round trip +
tamper detection, human-lock enforcement, and aggregation over records.
