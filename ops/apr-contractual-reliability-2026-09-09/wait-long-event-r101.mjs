#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const reportPath = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-contractual-reliability-r101-long-20260909/report.json";
const lastProcessed = Number(process.argv[2] ?? 0);
const lastFailureCount = Number(process.argv[3] ?? 0);
const milestone = [20, 30, 31, 40, 50, 60, 63].find((value) => value > lastProcessed) ?? 63;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

while (true) {
  if (!existsSync(reportPath)) {
    await sleep(2_000);
    continue;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const failures = (report.cases ?? []).filter((item) => ["operator_required", "technical_block", "inconsistent"].includes(item.state));
  const urgent = failures.find((item) => /fingerprint|login_required|interru|sessione.*scad/i.test(`${item.reason ?? ""}`));
  if (failures.length > lastFailureCount || urgent || report.status !== "running" || report.processed >= milestone) {
    process.stdout.write(`${JSON.stringify({
      type: urgent ? "urgent" : failures.length > lastFailureCount ? "failure" : report.status !== "running" ? "terminal" : "milestone",
      milestone,
      status: report.status,
      processed: report.processed,
      saved: report.saved,
      operatorRequired: report.operatorRequired,
      technicalBlock: report.technicalBlock,
      inconsistent: report.inconsistent,
      currentCustomerKey: report.currentCustomerKey,
      updatedAt: report.updatedAt,
      failures,
    })}\n`);
    break;
  }
  await sleep(2_000);
}
