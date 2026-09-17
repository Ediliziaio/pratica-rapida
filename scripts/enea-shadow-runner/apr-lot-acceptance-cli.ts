#!/usr/bin/env vite-node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { summariseAprLotAcceptance, type AprLotCaseInput } from "./aprLotAcceptanceSummary";

/**
 * Legge lo stato persistito di un lotto e lo presenta secondo lo standard di
 * accettazione: salvate, con domanda, non conformi, ritirate. Sola lettura.
 */
const runtimeRoot = process.env.APR_ACCEPTANCE_RUNTIME_ROOT
  ?? process.env.APR_REGRESSION_RUNTIME_ROOT
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const runId = process.argv[2];
if (!runId) { process.stderr.write("usage: apr-lot-acceptance-cli.ts <runId>\n"); process.exit(2); }

const readJson = (target: string): Record<string, unknown> | null => {
  try { return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown> : null; }
  catch { return null; }
};
const str = (value: unknown) => typeof value === "string" ? value : null;

const runCheckpoint = readJson(path.join(runtimeRoot, "runs", runId, "checkpoint.json"));
if (!runCheckpoint) { process.stderr.write(`apr_acceptance_run_not_found:${runId}\n`); process.exit(3); }

const results = (runCheckpoint.results as Array<Record<string, unknown>> | undefined) ?? [];
const cases: AprLotCaseInput[] = [];
for (const result of results) {
  const customerKey = str(result.customerKey);
  if (!customerKey) continue;
  const cohortRoot = path.join(runtimeRoot, "cohorts", `apr-pilot-${String(result.cohort)}-global-controller-${customerKey}`);

  const preflight = readJson(path.join(cohortRoot, "crm-local-preflight", "checkpoint.json"));
  const item = ((preflight?.items as Array<Record<string, unknown>> | undefined) ?? [])
    .find((entry) => str(entry.customerKey) === customerKey);
  const disposition = (item?.disposition ?? null) as Record<string, unknown> | null;

  const questions = readJson(path.join(cohortRoot, "operator-questions", "checkpoint.json"));
  const persistedQuestionCount = ((questions?.questions as unknown[] | undefined) ?? []).length;

  cases.push({
    customerKey,
    state: str(result.state) ?? "unknown",
    preflightState: item ? str(item.state) : null,
    dispositionKind: disposition ? str(disposition.kind) : null,
    withdrawalReason: item ? str(item.reason) : null,
    persistedQuestionCount,
  });
}

const summary = summariseAprLotAcceptance(cases);
process.stdout.write(`${JSON.stringify({ runId, ...summary }, null, 2)}\n`);
