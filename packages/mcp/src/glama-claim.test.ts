import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("glama http claim", () => {
  it("publishes the exact Glama connector claim under public/.well-known", () => {
    const raw = readFileSync(join(packageRoot, "public/.well-known/glama.json"), "utf8");
    assert.deepEqual(JSON.parse(raw), {
      $schema: "https://glama.ai/mcp/schemas/connector.json",
      claim: "glama_claim_qDvtrndqyP8-4jRKqCdo-v3yAXFG6hHv",
    });
  });

  it("does not rewrite /.well-known into /api", () => {
    const vercel = JSON.parse(readFileSync(join(packageRoot, "vercel.json"), "utf8")) as {
      outputDirectory: string;
      rewrites: { source: string; destination: string }[];
    };
    assert.equal(vercel.outputDirectory, "public");
    assert.deepEqual(
      vercel.rewrites.map((rule) => rule.source),
      ["/mcp", "/health", "/healthz"],
    );
    assert.equal(
      vercel.rewrites.some((rule) => rule.source.includes("well-known") || rule.source === "/(.*)" || rule.source === "/:path*"),
      false,
    );
  });
});
