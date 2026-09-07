#!/usr/bin/env node

/**
 * Smoke: boot Streamable HTTP, check /health, reject unauthenticated
 * initialize, then complete an authenticated handshake + tools/list.
 *
 * MCP_BEARER_TOKEN=dev-token npm run smoke:http
 *
 * If MCP_HTTP_URL is set, the script probes that URL instead of starting
 * a local server. Host/URL are never hardcoded.
 */

import { startHttpServer } from "../dist/http.js";
import { MCP_TOOL_NAMES } from "../dist/catalog.js";

const rpcHeaders = (token) => ({
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function postJson(url, body, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: rpcHeaders(token),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { response, json };
}

async function main() {
  const remote = process.env.MCP_HTTP_URL;
  const token = process.env.MCP_BEARER_TOKEN || "smoke-token-not-for-production";
  let listening;
  let url = remote;

  if (!url) {
    listening = await startHttpServer({
      host: "127.0.0.1",
      port: process.env.MCP_HTTP_PORT || 0,
      bearerToken: token,
      jsonResponse: true,
    });
    url = listening.url;
  }

  try {
    const healthUrl = new URL("/health", url).toString();
    const healthRes = await fetch(healthUrl);
    if (!healthRes.ok) throw new Error(`GET /health failed: HTTP ${healthRes.status}`);
    const health = await healthRes.json();
    if (!health.ok || health.transport !== "streamable-http") {
      throw new Error(`unexpected health payload: ${JSON.stringify(health)}`);
    }

    const unauth = await postJson(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
    });
    if (unauth.response.status !== 401) {
      throw new Error(`expected 401 without Bearer, got HTTP ${unauth.response.status}`);
    }

    const init = await postJson(
      url,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
      },
      token,
    );
    if (!init.response.ok || !init.json?.result?.serverInfo?.name) {
      throw new Error(`initialize failed: HTTP ${init.response.status} ${JSON.stringify(init.json)}`);
    }

    const listed = await postJson(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, token);
    const names = (listed.json?.result?.tools ?? []).map((tool) => tool.name);
    for (const expected of MCP_TOOL_NAMES) {
      if (!names.includes(expected)) throw new Error(`missing tool ${expected}`);
    }

    console.log(`ok health=${health.mode} tools=${names.length} url=${url}`);
  } finally {
    if (listening) await listening.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
