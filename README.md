# Trust Ledger OS

Trust Ledger OS is a trust and risk control plane for AI teams. Every high-impact change is reviewed, traced, and recorded before it reaches customers or cash.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRISMtrace](https://img.shields.io/badge/Observability-PRISMtrace-black)](https://blockconvey.com)

[![Release Workflow](https://img.shields.io/github/actions/workflow/status/icohangar-ops/trust-ledger-os/release.yml?branch=main)](./.github/workflows/release.yml)
[![npm package](https://img.shields.io/badge/npm-%40cubiczan%2Ftrust--ledger--os-CB3837?logo=npm&logoColor=white)](./packages/npm/README.md)
[![PyPI package](https://img.shields.io/badge/PyPI-trust--ledger--os-3775A9?logo=pypi&logoColor=white)](./packages/python/README.md)
[![MCP server](https://img.shields.io/badge/MCP-trust--ledger--os--mcp-111827)](./packages/mcp/README.md)

## Overview

The repo combines a public landing page with four scaffolded implementation phases. The same roadmap is mirrored into reusable package boundaries so the app, docs, and future library work stay aligned.

Mirrors:

- `icohangar-ops/trust-ledger-os`
- `Cubiczan/trust-ledger-os`

## Core Roles

- PRISM: runtime observability for agent calls, approvals, and latency.
- Prelint: pre-merge product review for policy drift, bad defaults, and risky logic.
- GIDE: secure offline editing and emergency fixes when the network is not trusted.

## What It Does

1. Capture a code change, spend request, or agent action.
2. Review it against product policy and trust rules.
3. Attach a PRISM trace to the runtime decision.
4. Produce an approve, deny, or counter outcome.
5. Store the decision in a ledger future runs can reuse.

## Live Routes

- `/` landing page and roadmap
- `/foundation` phase 1 scaffold
- `/framework-benchmark` phase 2 scaffold
- `/research-reasoning` phase 3 scaffold
- `/production-controls` phase 4 scaffold
- `/decisions` decision ledger (CHP decision substrate) · `GET /api/decisions` live read

## Phase Packages

- `foundation-kit/`: shared agent glossary, decision tree, model/tool matrix, and prompt skeletons.
- `framework-benchmark-suite/`: framework profiles, comparison cases, and scoring rubric.
- `research-reasoning-kit/`: research pipeline stages and reusable reasoning patterns.
- `production-controls-kit/`: eval harness, drift monitoring, guardrails, and release gate scaffold.
- `decision-substrate/`: CHP decision records — R0 gate, deterministic foundation scoring (guardrails 40 / bounded result 30 / parity 30), configurable per-domain floors (general 70, finance 100, blockchain/DeFi 85), substrate-enforced human locks (`TRUST_LEDGER_CHP_REQUIRE_HUMAN_LOCK`, default on), and an append-only JSONL ledger sealed with SHA-256 `body_sha256` revalidated on every read. TypeScript port of the primitive proven in erp-control-plane; canonical JSON via `@cubiczan/chp`.

## Distribution Surfaces

- `packages/npm/`: npm-friendly manifest and catalog export, published as `@cubiczan/trust-ledger-os@0.1.2`.
- `packages/python/`: PyPI-friendly manifest and catalog export, published as `trust-ledger-os==0.1.2`.
- `packages/mcp/`: MCP-ready tool and resource catalog, published as `trust-ledger-os-mcp@0.1.2`.

## Package Commands

- npm package build: `npm --prefix packages/npm run build`
- MCP package build: `npm --prefix packages/mcp run build`
- MCP server run: `npm --prefix packages/mcp start`
- Python CLI: `PYTHONPATH=packages/python/src python3 -m trust_ledger_os.cli --manifest`
- Vercel Python entrypoint: `src.trust_ledger_os.vercel_app:app` from `packages/python`

## Release Workflow

- GitHub Actions workflow: `.github/workflows/release.yml`
- Trigger it with a `v*` tag or `workflow_dispatch`
- Required secrets for publish mode:
  - `NPM_TOKEN`
  - `PYPI_API_TOKEN`
- The workflow builds the Next app, the npm and MCP packages, and the Python package before publishing.

## Demo Assets

The 2-minute video plan and FFmpeg render command are in [`docs/TRUST_LEDGER_OS_VIDEO.md`](docs/TRUST_LEDGER_OS_VIDEO.md).

Generated assets live in [`public/demo`](public/demo):

- `trust-ledger-os-demo.mp4`
- `01-hero-desktop.png`
- `02-how-it-works.png`
- `03-tool-stack.png`
- `04-builderbase-fit.png`
- `05-demo-deliverables.png`
- `06-hero-mobile.png`

## Implementation Roadmap

1. Foundation kit: shared agent glossary, model/tool matrix, and when-to-use-an-agent guidance.
2. Framework benchmark: compare LangGraph, OpenAI Agents SDK, AutoGen, PydanticAI, and LlamaIndex.
3. Research and reasoning: fundamental analysis, deep search, and reusable reasoning templates.
4. Production controls: eval harnesses, drift checks, tracing, guardrails, and approval gates.

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Development Notes

- Keep shared data in the package folders, not in the page components.
- Import from each package `src/` entry until the package exports are formalized.
- Add new phase work as reusable types and data first, then wire routes and docs.
- Treat `README.md` and `docs/TRUST_LEDGER_OS.md` as the roadmap source of truth.

## Repo Layout

```text
trust-ledger-os/
├── app/
├── decision-substrate/
├── docs/
├── foundation-kit/
├── framework-benchmark-suite/
├── production-controls-kit/
├── research-reasoning-kit/
├── package.json
├── README.md
└── tsconfig.json
```
