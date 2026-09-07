import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bearerAuthorized,
  configuredBearerToken,
  parseBearerToken,
  resolveExpectedToken,
  tokensEqual,
} from "./auth.js";

describe("auth", () => {
  it("parses Bearer tokens and compares in constant time", () => {
    assert.equal(parseBearerToken("Bearer secret-token"), "secret-token");
    assert.equal(parseBearerToken("bearer secret-token"), "secret-token");
    assert.equal(parseBearerToken("Basic nope"), null);
    assert.equal(tokensEqual("abc", "abc"), true);
    assert.equal(tokensEqual("abc", "abd"), false);
    assert.equal(tokensEqual("abc", "ab"), false);
  });

  it("treats unset token as local-open and Vercel as fail-closed", () => {
    assert.equal(configuredBearerToken({}), "");
    assert.equal(resolveExpectedToken({}), "");
    assert.equal(resolveExpectedToken({ VERCEL: "1" }), null);
    assert.equal(resolveExpectedToken({ MCP_BEARER_TOKEN: " local-secret " }), "local-secret");
    assert.equal(resolveExpectedToken({ MCP_BEARER_TOKEN: "short", NODE_ENV: "production" }), null);
    assert.equal(resolveExpectedToken({ MCP_BEARER_TOKEN: "long-enough-secret", NODE_ENV: "production" }), "long-enough-secret");
  });

  it("authorizes only matching Bearer when a token is required", () => {
    assert.equal(bearerAuthorized(undefined, ""), true);
    assert.equal(bearerAuthorized(undefined, null), false);
    assert.equal(bearerAuthorized(undefined, "secret"), false);
    assert.equal(bearerAuthorized("Bearer nope", "secret"), false);
    assert.equal(bearerAuthorized("Bearer secret", "secret"), true);
  });
});
