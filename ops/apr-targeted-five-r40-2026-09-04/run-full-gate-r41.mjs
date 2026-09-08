import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const sourceDirectory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const outputDirectory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");

for (let shard = 1; shard <= 8; shard += 1) {
  const baseline = JSON.parse(readFileSync(path.join(sourceDirectory, `vitest-shard-${shard}-r40.json`), "utf8"));
  const files = [...new Set((baseline.testResults ?? []).map((result) => path.relative(root, result.name)))];
  const output = path.join(outputDirectory, `vitest-shard-${shard}-r41.json`);
  const result = spawnSync("npx", ["vitest", "run", ...files, "--pool=forks", "--maxWorkers=1", "--minWorkers=1", "--reporter=json", `--outputFile=${output}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`apr_r41_shard_failed:${shard}:${result.stderr || result.stdout}`);
  process.stdout.write(`${JSON.stringify({ shard, files: files.length, output })}\n`);
}
