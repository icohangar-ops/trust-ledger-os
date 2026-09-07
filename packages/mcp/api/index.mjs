/**
 * Vercel Fluid Compute entry for Streamable HTTP MCP.
 *
 * Stateless JSON request/response — no sticky sessions, no long-lived GET /mcp
 * SSE. Same catalog and Bearer auth as `npm run http`.
 *
 * Public URL after deploy: https://$VERCEL_PROJECT_PRODUCTION_URL/mcp
 * (do not hardcode a hostname in this repo).
 */

import { handleWebRequest } from "../dist/web-handler.js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default {
  async fetch(request) {
    return handleWebRequest(request);
  },
};
