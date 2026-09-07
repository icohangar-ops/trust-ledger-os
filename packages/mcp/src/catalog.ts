export const SERVER_INFO = {
  name: "trust-ledger-os-mcp",
  version: "0.1.2",
} as const;

export const mcpManifest = {
  product: {
    name: "Trust Ledger OS",
    description: "A trust and risk control plane for AI teams.",
    tagline: "Every high-impact change is reviewed, traced, and recorded before it reaches customers or cash.",
  },
  routes: ["/", "/foundation", "/framework-benchmark", "/research-reasoning", "/production-controls"],
  phases: ["foundation", "framework-benchmark", "research-reasoning", "production-controls"],
  packages: ["@cubiczan/trust-ledger-os", "trust-ledger-os", "trust-ledger-os-mcp"],
} as const;

export const mcpPhaseDetails = [
  {
    id: "foundation",
    title: "Foundation kit",
    summary: "Shared agent glossary, decision tree, model/tool matrix, and prompt skeletons.",
    packageRoot: "foundation-kit/",
    route: "/foundation",
  },
  {
    id: "framework-benchmark",
    title: "Framework benchmark suite",
    summary: "Framework profiles, comparison cases, and scoring rubric.",
    packageRoot: "framework-benchmark-suite/",
    route: "/framework-benchmark",
  },
  {
    id: "research-reasoning",
    title: "Research and reasoning kit",
    summary: "Planner, researcher, validator, synthesizer, and reusable reasoning patterns.",
    packageRoot: "research-reasoning-kit/",
    route: "/research-reasoning",
  },
  {
    id: "production-controls",
    title: "Production controls kit",
    summary: "Eval harness, drift monitor, guardrails, and release gate.",
    packageRoot: "production-controls-kit/",
    route: "/production-controls",
  },
] as const;

export const MCP_TOOL_NAMES = [
  "get_manifest",
  "list_phases",
  "get_phase",
  "list_routes",
  "list_packages",
] as const;

export const mcpToolCatalog = [
  {
    name: "get_manifest",
    description: "Return the Trust Ledger OS manifest.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_phases",
    description: "List the roadmap phases.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_phase",
    description: "Fetch one roadmap phase by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_routes",
    description: "List the live app routes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_packages",
    description: "List the npm, PyPI, and MCP package surfaces.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export const mcpResourceCatalog = [
  { uri: "trust-ledger-os://manifest", name: "manifest", description: "Full Trust Ledger OS manifest" },
  { uri: "trust-ledger-os://phases", name: "phases", description: "Phase catalog" },
  { uri: "trust-ledger-os://routes", name: "routes", description: "Route catalog" },
  { uri: "trust-ledger-os://packages", name: "packages", description: "Package catalog" },
] as const;

export const mcpResources = {
  "trust-ledger-os://manifest": mcpManifest,
  "trust-ledger-os://phases": mcpManifest.phases,
  "trust-ledger-os://routes": mcpManifest.routes,
  "trust-ledger-os://packages": mcpManifest.packages,
} as const;
