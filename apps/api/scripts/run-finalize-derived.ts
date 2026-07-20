import { runPipelineTimeouts } from "../src/lib/finalize-derived";

async function main() {
  const result = await runPipelineTimeouts();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
