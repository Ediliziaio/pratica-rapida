#!/usr/bin/env node
import path from "node:path";
import { verifyAprRuleGovernanceAdmission } from "./aprRuleGovernanceAdmission";

const directory = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Directory bundle obbligatoria.");
const results = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"].map((name) => verifyAprRuleGovernanceAdmission({ executablePath: path.join(directory, name) }));
process.stdout.write(`${JSON.stringify(results.map((item) => ({ executablePath: item.executablePath, status: item.status, failures: item.failures })), null, 2)}\n`);
if (results.some((item) => item.status !== "admitted")) process.exitCode = 2;
