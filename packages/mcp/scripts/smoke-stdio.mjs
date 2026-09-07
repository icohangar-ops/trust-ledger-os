#!/usr/bin/env node

/**
 * Smoke: stdio NDJSON path used by Glama mcp-proxy. Must stay intact.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function main() {
  const child = spawn(process.execPath, [resolve(root, "dist/server.js")], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines = createInterface({ input: child.stdout });
  const nextLine = () =>
    new Promise((resolveLine, reject) => {
      const timer = setTimeout(() => reject(new Error("stdio timed out waiting for a line")), 3000);
      lines.once("line", (line) => {
        clearTimeout(timer);
        resolveLine(line);
      });
    });

  try {
    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke-stdio", version: "0" } },
    });
    const init = JSON.parse(await nextLine());
    if (init.result?.serverInfo?.name !== "trust-ledger-os-mcp") {
      throw new Error(`unexpected initialize: ${JSON.stringify(init)}`);
    }

    send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listed = JSON.parse(await nextLine());
    const names = (listed.result?.tools ?? []).map((tool) => tool.name);
    for (const expected of ["get_manifest", "list_phases", "get_phase", "list_routes", "list_packages"]) {
      if (!names.includes(expected)) throw new Error(`stdio missing tool ${expected}`);
    }

    console.log(`ok stdio tools=${names.length} framing=ndjson`);
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
