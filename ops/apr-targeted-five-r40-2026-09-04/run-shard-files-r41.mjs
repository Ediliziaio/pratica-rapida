import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const shard = Number(process.argv[2] ?? "2");
const baseline = JSON.parse(readFileSync(path.join(directory, `vitest-shard-${shard}-r40.json`), "utf8"));
const files = [...new Set((baseline.testResults ?? []).map((result) => path.relative(root, result.name)))];

for (const [index, file] of files.entries()) {
  const output = path.join(directory, `vitest-shard-${shard}-file-${String(index + 1).padStart(2, "0")}-r41.json`);
  const result = spawnSync("npx", ["vitest", "run", file, "--pool=forks", "--maxWorkers=1", "--minWorkers=1", "--reporter=json", `--outputFile=${output}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`apr_r41_file_timeout:${file}`);
  if (result.status !== 0) throw new Error(`apr_r41_file_failed:${file}:${result.stderr || result.stdout}`);
  process.stdout.write(`${JSON.stringify({ shard, index: index + 1, file, output })}\n`);
}
