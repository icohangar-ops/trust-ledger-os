import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleWebRequest } from "./web-handler.js";

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://127.0.0.1:8787${path}`, init);
}

describe("handleWebRequest", () => {
  it("returns health without auth", async () => {
    const response = await handleWebRequest(request("/health"), { env: {} });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; transport: string; mode: string };
    assert.equal(body.ok, true);
    assert.equal(body.transport, "streamable-http");
    assert.equal(body.mode, "stateless");
  });

  it("fail-closes /mcp when a Bearer token is configured", async () => {
    const env = { MCP_BEARER_TOKEN: "smoke-token" };
    const unauth = await handleWebRequest(
      request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
      { env },
    );
    assert.equal(unauth.status, 401);
    assert.match(unauth.headers.get("www-authenticate") ?? "", /Bearer/);

    const auth = await handleWebRequest(
      request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer smoke-token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      { env },
    );
    assert.equal(auth.status, 200);
    const payload = (await auth.json()) as { result: { tools: { name: string }[] } };
    assert.ok(payload.result.tools.some((tool) => tool.name === "get_manifest"));
  });

  it("fail-closes /mcp on Vercel when the token env is missing", async () => {
    const response = await handleWebRequest(
      request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
      { env: { VERCEL: "1" } },
    );
    assert.equal(response.status, 401);
  });

  it("allows local /mcp without a token", async () => {
    const response = await handleWebRequest(
      request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} }),
      }),
      { env: {} },
    );
    assert.equal(response.status, 200);
  });

  it("rejects GET /mcp and unknown paths", async () => {
    const get = await handleWebRequest(request("/mcp", { headers: { authorization: "Bearer x" } }), {
      env: {},
      bearerToken: "x",
    });
    assert.equal(get.status, 405);
    const missing = await handleWebRequest(request("/nope"), { env: {} });
    assert.equal(missing.status, 404);
  });

  it("accepts initialized notifications with 202", async () => {
    const response = await handleWebRequest(
      request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer smoke-token" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
      { env: { MCP_BEARER_TOKEN: "smoke-token" } },
    );
    assert.equal(response.status, 202);
  });
});
