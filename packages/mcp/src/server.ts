#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import {
  mcpManifest,
  mcpResourceCatalog,
  mcpResources,
  mcpToolCatalog,
} from "./catalog.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

let buffer = Buffer.alloc(0);

/** Glama mcp-proxy expects NDJSON on stdout (no Content-Length). Do not log to stdout. */
function writeMessage(message: JsonRpcResponse) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Accept both NDJSON lines and legacy MCP Content-Length frames on stdin
 * (mirrors governed-mcp-gateway tryReadMcpMessage).
 */
function tryReadMcpMessage(buf: Buffer): { value: JsonRpcRequest; rest: Buffer } | undefined {
  const headerEnd = buf.indexOf("\r\n\r\n");
  if (headerEnd !== -1) {
    const header = buf.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) return undefined;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buf.length < start + length) return undefined;
    const value = JSON.parse(buf.subarray(start, start + length).toString("utf8")) as JsonRpcRequest;
    return { value, rest: buf.subarray(start + length) };
  }

  const nl = buf.indexOf("\n");
  if (nl === -1) return undefined;
  const line = buf.subarray(0, nl).toString("utf8").trim();
  if (!line.startsWith("{")) return undefined;
  const value = JSON.parse(line) as JsonRpcRequest;
  return { value, rest: buf.subarray(nl + 1) };
}

function makeError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function jsonValue(name: string, params: Record<string, unknown> | undefined) {
  switch (name) {
    case "get_manifest":
      return mcpManifest;
    case "list_phases":
      return mcpManifest.phases;
    case "get_phase": {
      const id = String(params?.id ?? "");
      const phase = [
        { id: "foundation", title: "Foundation kit", summary: "Shared agent glossary, decision tree, model/tool matrix, and prompt skeletons.", packageRoot: "foundation-kit/", route: "/foundation" },
        { id: "framework-benchmark", title: "Framework benchmark suite", summary: "Framework profiles, comparison cases, and scoring rubric.", packageRoot: "framework-benchmark-suite/", route: "/framework-benchmark" },
        { id: "research-reasoning", title: "Research and reasoning kit", summary: "Planner, researcher, validator, synthesizer, and reusable reasoning patterns.", packageRoot: "research-reasoning-kit/", route: "/research-reasoning" },
        { id: "production-controls", title: "Production controls kit", summary: "Eval harness, drift monitor, guardrails, and release gate.", packageRoot: "production-controls-kit/", route: "/production-controls" },
      ].find((entry) => entry.id === id);
      return phase ?? null;
    }
    case "list_routes":
      return mcpManifest.routes;
    case "list_packages":
      return mcpManifest.packages;
    default:
      return null;
  }
}

function handleRequest(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    writeMessage({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "trust-ledger-os-mcp", version: "0.1.0" },
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
      },
    });
    return;
  }

  if (request.method === "tools/list") {
    writeMessage({ jsonrpc: "2.0", id: request.id ?? null, result: { tools: mcpToolCatalog } });
    return;
  }

  if (request.method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args = (request.params?.arguments as Record<string, unknown> | undefined) ?? undefined;
    if (!["get_manifest", "list_phases", "get_phase", "list_routes", "list_packages"].includes(name)) {
      writeMessage(makeError(request.id ?? null, -32601, `Unknown tool: ${name}`));
      return;
    }
    writeMessage({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        content: [{ type: "text", text: JSON.stringify(jsonValue(name, args), null, 2) }],
        isError: false,
      },
    });
    return;
  }

  if (request.method === "resources/list") {
    writeMessage({ jsonrpc: "2.0", id: request.id ?? null, result: { resources: mcpResourceCatalog } });
    return;
  }

  if (request.method === "resources/read") {
    const uri = String(request.params?.uri ?? "");
    if (!(uri in mcpResources)) {
      writeMessage(makeError(request.id ?? null, -32602, `Unknown resource: ${uri}`));
      return;
    }
    writeMessage({
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(mcpResources[uri as keyof typeof mcpResources], null, 2),
          },
        ],
      },
    });
    return;
  }

  if (request.id !== undefined) {
    writeMessage(makeError(request.id ?? null, -32601, `Unknown method: ${request.method}`));
  }
}

function tryParseFrames() {
  while (true) {
    const parsed = tryReadMcpMessage(buffer);
    if (!parsed) return;
    buffer = parsed.rest;
    try {
      handleRequest(parsed.value);
    } catch (error) {
      writeMessage(makeError(null, -32700, "Parse error", String(error)));
    }
  }
}

stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  tryParseFrames();
});
