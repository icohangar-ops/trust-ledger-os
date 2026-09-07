# Trust Ledger OS Python package

Python package surface for the Trust Ledger OS manifest.

Published version: `trust-ledger-os==0.1.2`

## Publish

- Build: `python -m build packages/python`
- CLI: `PYTHONPATH=packages/python/src python3 -m trust_ledger_os.cli --manifest`
- Vercel entrypoint: `src.trust_ledger_os.vercel_app:app`
- Package name: `trust-ledger-os`
- Release path: `.github/workflows/release.yml`

## Modules

- `trust_ledger_os.manifest`
- `trust_ledger_os.phases`

## Goal

Expose the roadmap and distribution metadata in a Python-friendly shape for notebooks, automation, and future PyPI publishing.