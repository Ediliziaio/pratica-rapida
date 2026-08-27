import { resolve } from "node:path";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { replayEconomicCorpusFiles } from "./aprEconomicCorpusReplay";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`apr_economic_cli_argument_missing:${name}`);
  return resolve(process.argv[index + 1]);
}

async function main() {
  const replayPath = argument("--replay");
  const manifestPath = argument("--source-manifest");
  const first = await replayEconomicCorpusFiles(replayPath, manifestPath);
  const second = await replayEconomicCorpusFiles(replayPath, manifestPath);
  const output = {
    ...first,
    deterministicDoubleReplay: {
      status: first.firstReplayFingerprint === second.firstReplayFingerprint ? "PASS" : "FAIL",
      firstFingerprint: first.firstReplayFingerprint,
      secondFingerprint: second.firstReplayFingerprint,
    },
    reportFingerprint: canonicalSha256(first),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status !== "PASS" || output.deterministicDoubleReplay.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
