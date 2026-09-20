import { join } from "node:path";
import { NextResponse } from "next/server";
import { aggregateDecisionRecords } from "@/decision-substrate/dist/index.js";
import { DecisionLedger } from "@/decision-substrate/dist/ledger.js";

// The ledger is read from disk per request; never prerender this route.
export const dynamic = "force-dynamic";

const LEDGER_PATH = "state/decisions.jsonl";

/**
 * Read-only decision ledger API. Mutations (open / confirm) are exposed
 * through the ChpDecisionSubstrate class in-process, where the human-lock
 * rule is enforced by the substrate itself — not through an unauthenticated
 * HTTP write path.
 */
export async function GET() {
  const ledger = new DecisionLedger(join(process.cwd(), LEDGER_PATH));
  const decisions = ledger.list();
  return NextResponse.json({
    ledger: LEDGER_PATH,
    count: decisions.length,
    aggregate: aggregateDecisionRecords(decisions),
    decisions,
  });
}
