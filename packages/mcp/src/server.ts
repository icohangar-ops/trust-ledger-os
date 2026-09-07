#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import { handleJsonRpc, makeError, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

let buffer: Buffer = Buffer.alloc(0);

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

function handleRequest(request: JsonRpcRequest) {
  const response = handleJsonRpc(request);
  if (response) writeMessage(response);
}

function tryParseFrames() {
  while (true) {
    const parsed = tryReadMcpMessage(buffer);
    if (!parsed) return;
    buffer = Buffer.from(parsed.rest);
    try {
      handleRequest(parsed.value);
    } catch (error) {
      writeMessage(makeError(null, -32700, "Parse error", String(error)));
    }
  }
}

stdin.on("data", (chunk) => {
  const next = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk);
  buffer = Buffer.concat([buffer, next]);
  tryParseFrames();
});
