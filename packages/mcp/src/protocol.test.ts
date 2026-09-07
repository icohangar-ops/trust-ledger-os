import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCP_TOOL_NAMES } from "./catalog.js";
import { handleJsonRpc } from "./protocol.js";

describe("handleJsonRpc", () => {
  it("initializes with catalog capabilities", () => {
    const response = handleJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    });
    assert.ok(response);
    assert.equal(response.error, undefined);
    const result = response.result as { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: unknown } };
    assert.equal(result.protocolVersion, "2025-03-26");
    assert.equal(result.serverInfo.name, "trust-ledger-os-mcp");
    assert.ok(result.capabilities.tools);
  });

  it("lists the five catalog tools", () => {
    const response = handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.ok(response);
    const tools = (response.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
    for (const name of MCP_TOOL_NAMES) {
      assert.ok(tools.includes(name), `missing ${name}`);
    }
  });

  it("calls get_manifest and get_phase", () => {
    const manifest = handleJsonRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_manifest", arguments: {} },
    });
    assert.ok(manifest);
    const text = (manifest.result as { content: { text: string }[] }).content[0].text;
    assert.match(text, /Trust Ledger OS/);

    const phase = handleJsonRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_phase", arguments: { id: "foundation" } },
    });
    assert.ok(phase);
    const phaseText = (phase.result as { content: { text: string }[] }).content[0].text;
    assert.match(phaseText, /foundation-kit/);
  });

  it("reads the manifest resource", () => {
    const response = handleJsonRpc({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "trust-ledger-os://manifest" },
    });
    assert.ok(response);
    const contents = (response.result as { contents: { uri: string }[] }).contents;
    assert.equal(contents[0].uri, "trust-ledger-os://manifest");
  });

  it("returns null for initialized notifications", () => {
    assert.equal(handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  });

  it("rejects unknown tools and methods", () => {
    const unknownTool = handleJsonRpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "not_a_tool", arguments: {} },
    });
    assert.equal(unknownTool?.error?.code, -32601);

    const unknownMethod = handleJsonRpc({ jsonrpc: "2.0", id: 7, method: "nope" });
    assert.equal(unknownMethod?.error?.code, -32601);
  });
});
