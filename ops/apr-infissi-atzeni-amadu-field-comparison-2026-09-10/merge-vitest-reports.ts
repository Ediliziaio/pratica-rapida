import crypto from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("ops/apr-infissi-atzeni-amadu-field-comparison-2026-09-10");
const read = (name: string) => JSON.parse(readFileSync(path.join(root, name), "utf8")) as Record<string, unknown> & { success?: boolean; testResults?: unknown[] };
const sandbox = read("sandbox-vitest-report.json");
const socket = read("socket-vitest-report.json");
if (sandbox.success !== true || socket.success !== true) throw new Error("vitest_source_report_not_green");
const output = {
  ...sandbox,
  success: true,
  testResults: [...(sandbox.testResults ?? []), ...(socket.testResults ?? [])],
};
const target = path.join(root, "full-vitest-report.json");
const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
const descriptor = openSync(temporary, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(output, null, 2)}\n`, "utf8"); fsyncSync(descriptor); }
finally { closeSync(descriptor); }
renameSync(temporary, target);
const bytes = readFileSync(target);
process.stdout.write(`${JSON.stringify({
  target,
  success: output.success,
  testFileCount: output.testResults.length,
  assertionCount: output.testResults.reduce((sum, item) => sum + (Array.isArray((item as { assertionResults?: unknown[] }).assertionResults) ? (item as { assertionResults: unknown[] }).assertionResults.length : 0), 0),
  sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
}, null, 2)}\n`);
