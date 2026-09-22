/**
 * Sandbox-only: run JUST the 20h recontacto nudge (no escalate/finalize).
 * Usage:
 *   ABANDONED_NUDGE_HOURS=0.001 npx tsx scripts/run-abandoned-nudge-only.ts
 */
import { sendAbandonedNudges } from "../src/lib/finalize-derived";

async function main() {
  const result = await sendAbandonedNudges();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
