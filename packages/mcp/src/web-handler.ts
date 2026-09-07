/**
 * Web-standard Streamable HTTP handler (Request → Response).
 *
 * Used by the Node listen entry and the Vercel Fluid Compute function.
 * Stateless: no Mcp-Session-Id, one JSON-RPC exchange per POST.
 */

import { SERVER_INFO } from "./catalog.js";
import { bearerAuthorized, resolveExpectedToken } from "./auth.js";
import { handleJsonRpc, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

export const DEFAULT_MCP_PATH = "/mcp";

export type HandleWebRequestOptions = {
  env?: NodeJS.ProcessEnv;
  path?: string;
  bearerToken?: string;
  jsonResponse?: boolean;
  corsOrigins?: string[] | "*";
};

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolvePath(env: NodeJS.ProcessEnv = process.env, explicit?: string): string {
  const path = explicit || env.MCP_HTTP_PATH || DEFAULT_MCP_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

export function jsonResponseEnabled(env: NodeJS.ProcessEnv = process.env, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  const raw = env.MCP_HTTP_JSON_RESPONSE;
  if (raw == null || raw === "") return true;
  return !["0", "false", "off", "no"].includes(String(raw).toLowerCase());
}

export function healthPayload() {
  return {
    ok: true,
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    transport: "streamable-http",
    mode: "stateless",
  };
}

function resolveCorsOrigin(request: Request, origins: string[] | "*"): string | null {
  const requestOrigin = request.headers.get("origin");
  const list = origins === "*" || !origins || (Array.isArray(origins) && origins.length === 0) ? ["*"] : origins;
  if (list.includes("*")) return requestOrigin || "*";
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return null;
}

function withCors(response: Response, request: Request, origins: string[] | "*"): Response {
  const headers = new Headers(response.headers);
  const allowOrigin = resolveCorsOrigin(request, origins);
  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  );
  headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpc(status: number, error: { code: number; message: string }, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error, id: null }), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function unauthorized() {
  return jsonRpc(
    401,
    { code: -32001, message: "Unauthorized" },
    { "WWW-Authenticate": 'Bearer realm="Trust Ledger OS MCP", error="invalid_token"' },
  );
}

function asSse(payload: unknown): Response {
  const data = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  return new Response(data, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function asJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "MCP-Protocol-Version": "2025-03-26",
    },
  });
}

function prefersSse(request: Request, enableJson: boolean): boolean {
  if (enableJson) return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/event-stream");
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dispatchMessage(message: JsonRpcRequest): JsonRpcResponse | null {
  return handleJsonRpc(message);
}

async function handleMcpPost(request: Request, enableJson: boolean): Promise<Response> {
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return jsonRpc(400, { code: -32700, message: "Parse error" });
  }

  const messages = Array.isArray(body) ? body : [body];
  if (!messages.every(isJsonRpcRequest)) {
    return jsonRpc(400, { code: -32600, message: "Invalid Request" });
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of messages) {
    const result = dispatchMessage(message);
    if (result) responses.push(result);
  }

  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return prefersSse(request, enableJson) ? asSse(payload) : asJson(payload);
}

export async function handleWebRequest(request: Request, options: HandleWebRequestOptions = {}): Promise<Response> {
  const env = options.env || process.env;
  const mcpPath = resolvePath(env, options.path);
  const corsOrigins = options.corsOrigins ?? parseList(env.MCP_HTTP_CORS_ORIGINS);
  const originSetting: string[] | "*" = corsOrigins.length === 0 ? "*" : corsOrigins;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  const respond = (response: Response) => withCors(response, request, originSetting);

  if (request.method === "OPTIONS") {
    return respond(new Response(null, { status: 204 }));
  }

  if (pathname === "/health" || pathname === "/healthz") {
    return respond(Response.json(healthPayload()));
  }

  if (pathname !== mcpPath) {
    return respond(Response.json({ error: "Not found" }, { status: 404 }));
  }

  const expectedToken = resolveExpectedToken(env, options.bearerToken);
  if (!bearerAuthorized(request.headers.get("authorization"), expectedToken)) {
    return respond(unauthorized());
  }

  if (request.method === "GET" || request.method === "DELETE") {
    return respond(jsonRpc(405, { code: -32000, message: "Method not allowed." }));
  }
  if (request.method !== "POST") {
    return respond(jsonRpc(405, { code: -32000, message: "Method not allowed." }));
  }

  try {
    return respond(await handleMcpPost(request, jsonResponseEnabled(env, options.jsonResponse)));
  } catch (error) {
    console.error("Error handling MCP request:", error instanceof Error ? error.message : "unknown");
    return respond(jsonRpc(500, { code: -32603, message: "Internal server error" }));
  }
}
