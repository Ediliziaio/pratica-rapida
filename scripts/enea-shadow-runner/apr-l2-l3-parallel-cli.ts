import { resolve } from "node:path";
import { compareFrozenCorpusFiles } from "./aprL2L3ParallelBoundary";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`apr_parallel_cli_argument_missing:${name}`);
  return resolve(process.argv[index + 1]);
}

async function main() {
  const comparison = await compareFrozenCorpusFiles(argument("--replay"), argument("--source-manifest"));
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  if (comparison.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
