#!/usr/bin/env node

/**
 * Trust Ledger OS MCP — Streamable HTTP (stateless)
 *
 * Same catalog as stdio. Public HTTPS + streamable-http is what Glama remote
 * connectors require. Bind host/port come from env; this file never invents
 * a public hostname.
 *
 * Local / Docker use this Node listen process. Vercel uses the same
 * handleWebRequest via api/index.mjs (Fluid Compute).
 */

import http from "node:http";
import { pathToFileURL } from "node:url";
import { configuredBearerToken } from "./auth.js";
import { handleWebRequest, resolvePath, type HandleWebRequestOptions } from "./web-handler.js";

const DEFAULT_PORT = 8787;

export function resolveHost(env: NodeJS.ProcessEnv = process.env, explicit?: string): string {
  if (explicit) return explicit;
  if (env.MCP_HTTP_HOST) return env.MCP_HTTP_HOST;
  if (env.HOST) return env.HOST;
  if (env.PORT) return "0.0.0.0";
  return "127.0.0.1";
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env, explicit?: number | string): number {
  if (explicit != null && explicit !== "") return Number(explicit);
  if (env.MCP_HTTP_PORT) return Number(env.MCP_HTTP_PORT);
  if (env.PORT) return Number(env.PORT);
  return DEFAULT_PORT;
}

function incomingToRequest(req: http.IncomingMessage): Request {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || "http";
  const host = req.headers.host || "127.0.0.1";
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  const method = req.method || "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = req as unknown as ReadableStream;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendNodeResponse(res: http.ServerResponse, webResponse: Response) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!webResponse.body) {
    res.end();
    return;
  }
  const reader = webResponse.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

export function createRequestListener(options: HandleWebRequestOptions = {}) {
  return async function requestListener(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const request = incomingToRequest(req);
      const response = await handleWebRequest(request, options);
      await sendNodeResponse(res, response);
    } catch (error) {
      console.error("Error handling HTTP request:", error instanceof Error ? error.message : "unknown");
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    }
  };
}

export async function startHttpServer(options: HandleWebRequestOptions & { host?: string; port?: number | string } = {}) {
  const env = options.env || process.env;
  const host = resolveHost(env, options.host);
  const port = resolvePort(env, options.port);
  const mcpPath = resolvePath(env, options.path);
  const listener = createRequestListener(options);

  return new Promise<{
    server: http.Server;
    host: string;
    port: number;
    path: string;
    url: string;
    close: () => Promise<void>;
  }>((resolve, reject) => {
    const server = http.createServer(listener);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      const boundHost = typeof address === "object" && address ? address.address : host;
      resolve({
        server,
        host: boundHost,
        port: Number(boundPort),
        path: mcpPath,
        url: `http://127.0.0.1:${boundPort}${mcpPath}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
    server.on("error", reject);
  });
}

async function main() {
  const token = configuredBearerToken(process.env);
  if (!token) {
    console.error("MCP_BEARER_TOKEN unset — local HTTP is open. Set a secret before exposing a public port.");
  }
  const listening = await startHttpServer();
  console.error(
    `Trust Ledger OS MCP Streamable HTTP (stateless) at http://${listening.host}:${listening.port}${listening.path}`,
  );
  console.error("Health: GET /health (no tools, no secrets)");
  if (token) {
    console.error("Auth: Authorization: Bearer <MCP_BEARER_TOKEN>");
  }
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
