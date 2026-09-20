# AGENTS.md — Trust Ledger OS

## Mission

Trust Ledger OS is a Next.js application with a separately-compiled TypeScript
decision substrate (`decision-substrate/`) that records governed decisions with
append-only evidence and verification records. Agents working here must keep
the substrate deterministic and the ledger append-only: no destructive
migration of existing records, no weakening of hash/integrity checks, and no
new runtime dependency without an explicit reason in the PR.

## Architecture

| Layer | Role | Do | Don't |
|-------|------|----|-------|
| `app/` | Next.js UI | Keep server/client boundaries explicit | Import substrate internals into client components |
| `decision-substrate/` | Deterministic decision/verification core | Compile and test it independently (`npm run build:substrate`) | Couple it to Next.js request lifecycle or React |
| `foundation-kit/` | Seeded kit content | Treat as data | Edit kit behavior inline in app code |

## Engineering rules

### Non-negotiables

1. **Ledger is append-only** — verification records and decisions are never
   rewritten or deleted; corrections are new records.
2. **Substrate stays framework-free** — `decision-substrate/` must compile and
   test without Next.js.
3. **No untyped boundaries** — substrate public API keeps strict TypeScript;
   `npm run lint` (which runs `tsc --noEmit`) must pass.

### Propagation Matrix — Wave C rows

- **Row 21 (executable contracts) — adopted.** This file compiles under
  agent-conductor: the checklist below matches the parser's gate section and
  its commands execute as gates. Conductor verifies it with
  `contract_load`/`--run-gates`.
- **Row 23 (supply-chain discipline) — pending carrier.** The
  receipts/skills-lock/bundle-manifest kit extension lives in the archived
  `_cubiczan-shared` repo (push blocked); delivery waits on the
  owner-designated live `chp init` carrier. This file's contract + gates are
  the row-21 half, delivered now.

## Code change checklist

```bash
npm run build:substrate
npm run lint
npm test
```
