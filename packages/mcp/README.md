# Trust Ledger OS MCP package

MCP-ready package surface for Trust Ledger OS.

Two transports, one catalog:

- **stdio** (NDJSON on stdout) — Glama server registry / mcp-proxy Dockerfile
- **Streamable HTTP** (`POST /mcp`) — public HTTPS connector on a dedicated Vercel project

## Publish

- Build: `npm --prefix packages/mcp run build`
- Stdio server: `npm --prefix packages/mcp start`
- HTTP server: `MCP_BEARER_TOKEN=dev-token npm --prefix packages/mcp run http`
- Package name: `trust-ledger-os-mcp`
- Release path: `.github/workflows/release.yml`

## Tool catalog

- `list_phases`
- `get_phase`
- `list_routes`
- `list_packages`
- `get_manifest`

## Goal

Expose the roadmap and distribution metadata in an agent-friendly shape for
local MCP runtimes and a hosted Glama connector.

## Stdio transport (Glama server listing)

Stdout uses NDJSON (one JSON object per line). Do not log to stdout. Prefer
the compiled server entry for Glama.

```bash
npm --prefix packages/mcp run build
npm --prefix packages/mcp run smoke:stdio
```

## Streamable HTTP (Glama connector)

Stateless JSON-RPC over HTTP. No `Mcp-Session-Id`, no long-lived `GET /mcp`
SSE (`GET` / `DELETE` return 405). Default responses are JSON.

```bash
export MCP_BEARER_TOKEN="replace-with-a-long-random-secret"
npm --prefix packages/mcp run build
npm --prefix packages/mcp run http
```

```bash
# Liveness — no auth, no tools, no secrets
curl -sS http://127.0.0.1:8787/health

# Handshake (fail-closed when MCP_BEARER_TOKEN is set)
curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Smoke (starts a local listener unless `MCP_HTTP_URL` is set):

```bash
MCP_BEARER_TOKEN="replace-with-a-long-random-secret" npm --prefix packages/mcp run smoke:http
```

Host and URL are never hardcoded. Probe a deployed URL with:

```bash
MCP_HTTP_URL="https://$VERCEL_PROJECT_PRODUCTION_URL/mcp" \
MCP_BEARER_TOKEN="..." \
  npm --prefix packages/mcp run smoke:http
```

## Auth

| Condition | Result |
|-----------|--------|
| Token unset, local HTTP | Open `/mcp` (dev only). Process warns on stderr. |
| `MCP_BEARER_TOKEN` set | `/mcp` requires `Authorization: Bearer <token>` |
| Missing / invalid Bearer | HTTP 401 + `WWW-Authenticate: Bearer` |
| Vercel (`VERCEL` / `VERCEL_ENV`) and token missing | `/mcp` fail-closed (401) |
| `GET /health` or `/healthz` | 200 JSON liveness, no auth |

Production tokens should be at least 16 characters. Never echo the secret.

## Vercel project (dedicated — do not reuse other apps)

This is a **new** Node MCP project. Do **not** point it at:

- repo root (that is the Next.js landing app)
- `packages/python` (that is the PyPI catalog app, e.g. python-nine-pi)

| Setting | Value |
|---------|--------|
| Recommended project name | `trust-ledger-os-mcp` |
| Root Directory | `packages/mcp` |
| Framework | Other / None (`vercel.json` sets `"framework": null`) |
| Fluid Compute | on (`"fluid": true`) |
| Install | `npm ci && npm run build` (tsc writes `dist/` for `api/index.mjs`) |
| Build | `null` — do not run a second build that would wipe `dist/` |
| Output Directory | `public` (checked-in empty folder; Vercel requires this path after build) |
| Production env | `MCP_BEARER_TOKEN` (required for the public Glama connector test profile) |

`vercel.json` rewrites `/mcp`, `/health`, and `/healthz` to `api/index.mjs`
(Fluid Compute `fetch` handler). `maxDuration` is 60s. With
`framework: null`, Vercel still requires `outputDirectory` `public` and
fails if that folder is missing (`null` is ignored). Keep an empty
`public/` in the repo, compile TypeScript during install, and leave
`buildCommand` null so `dist/` stays available for
`includeFiles: dist/**`.

```bash
npx vercel --cwd packages/mcp
npx vercel env add MCP_BEARER_TOKEN
npx vercel --prod --cwd packages/mcp
```

Public URLs (from Vercel, not this repo):

- MCP: `https://$VERCEL_PROJECT_PRODUCTION_URL/mcp`
- Health: `https://$VERCEL_PROJECT_PRODUCTION_URL/health`

Disable **Deployment Protection** (Vercel Authentication) on production so
Glama can reach `/mcp` with only the Bearer header.

## Glama connector fields

After the Vercel production URL exists, Add MCP Server → **Connector**:

| Field | What to enter |
|-------|----------------|
| Name | Trust Ledger OS |
| Server URL | `https://$VERCEL_PROJECT_PRODUCTION_URL/mcp` |
| Transport | `streamable-http` (not stdio, not legacy SSE) |
| Authentication | API Key |
| Header name | `Authorization` |
| Header value | `Bearer $MCP_BEARER_TOKEN` |

Client snippet (replace the host from Vercel):

```json
{
  "mcpServers": {
    "trust-ledger-os": {
      "type": "streamable-http",
      "url": "https://${VERCEL_PROJECT_PRODUCTION_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_BEARER_TOKEN}"
      }
    }
  }
}
```

The npm stdio package stays listed via `server.json` `packages` + the existing
Dockerfile / mcp-proxy path. `remotes` uses `{MCP_HTTP_HOST}` — no fabricated
production hostname.
