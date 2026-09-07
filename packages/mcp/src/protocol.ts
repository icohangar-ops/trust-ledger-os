import {
  MCP_TOOL_NAMES,
  SERVER_INFO,
  mcpManifest,
  mcpPhaseDetails,
  mcpResourceCatalog,
  mcpResources,
  mcpToolCatalog,
} from "./catalog.js";

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"] as const;
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

export function isCatalogTool(name: string): name is (typeof MCP_TOOL_NAMES)[number] {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name);
}

export function jsonValue(name: string, params: Record<string, unknown> | undefined) {
  switch (name) {
    case "get_manifest":
      return mcpManifest;
    case "list_phases":
      return mcpManifest.phases;
    case "get_phase": {
      const id = String(params?.id ?? "");
      return mcpPhaseDetails.find((entry) => entry.id === id) ?? null;
    }
    case "list_routes":
      return mcpManifest.routes;
    case "list_packages":
      return mcpManifest.packages;
    default:
      return null;
  }
}

export function makeError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function resolveProtocolVersion(params: Record<string, unknown> | undefined) {
  const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;
}

/**
 * Shared MCP JSON-RPC handler used by stdio and Streamable HTTP.
 * Notifications (no id) return null.
 */
export function handleJsonRpc(request: JsonRpcRequest): JsonRpcResponse | null {
  const id = request.id ?? null;
  const method = String(request.method ?? "");
  const isNotification = request.id === undefined;

  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: resolveProtocolVersion(request.params),
        serverInfo: { name: SERVER_INFO.name, version: SERVER_INFO.version },
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
      },
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: mcpToolCatalog } };
  }

  if (method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args = (request.params?.arguments as Record<string, unknown> | undefined) ?? undefined;
    if (!isCatalogTool(name)) {
      return makeError(id, -32601, `Unknown tool: ${name}`);
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(jsonValue(name, args), null, 2) }],
        isError: false,
      },
    };
  }

  if (method === "resources/list") {
    return { jsonrpc: "2.0", id, result: { resources: mcpResourceCatalog } };
  }

  if (method === "resources/read") {
    const uri = String(request.params?.uri ?? "");
    if (!(uri in mcpResources)) {
      return makeError(id, -32602, `Unknown resource: ${uri}`);
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(mcpResources[uri as keyof typeof mcpResources], null, 2),
          },
        ],
      },
    };
  }

  if (isNotification) {
    return null;
  }

  return makeError(id, -32601, `Unknown method: ${method}`);
}
