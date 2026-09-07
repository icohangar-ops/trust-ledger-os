import { timingSafeEqual } from "node:crypto";

export const MIN_PRODUCTION_TOKEN_LENGTH = 16;

export function configuredBearerToken(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MCP_BEARER_TOKEN;
  if (raw == null) return "";
  return String(raw).trim();
}

export function isPublicHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV);
}

export function tokensEqual(expected: string, provided: string): boolean {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length === 0 || a.length !== b.length) {
    const dummy = Buffer.alloc(a.length || 1);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function parseBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (typeof authorizationHeader !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  return match ? match[1] : null;
}

/**
 * Resolve the token `/mcp` must match.
 * - explicit option wins
 * - empty string = local open (no auth)
 * - null = public host missing token (fail-closed)
 */
export function resolveExpectedToken(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: string,
): string | null {
  if (explicit != null) return explicit;
  const token = configuredBearerToken(env);
  if (token) {
    const production = (env.NODE_ENV || env.VERCEL_ENV || "").toLowerCase() === "production";
    if (production && token.length < MIN_PRODUCTION_TOKEN_LENGTH) {
      return null;
    }
    return token;
  }
  if (isPublicHost(env)) return null;
  return "";
}

export function bearerAuthorized(
  authorizationHeader: string | null | undefined,
  expected: string | null,
): boolean {
  if (expected === "") return true;
  if (expected == null) return false;
  const provided = parseBearerToken(authorizationHeader);
  if (!provided) return false;
  return tokensEqual(expected, provided);
}
