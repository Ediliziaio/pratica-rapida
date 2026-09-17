#!/usr/bin/env vite-node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { disposeAprStoppedCases, type AprStopCaseInput } from "./aprStopDisposition";

/**
 * Per ogni pratica ferma del lotto dice cosa ne e' stato: la domanda da porre
 * all'operatore, oppure il guasto di APR da chiudere. Sola lettura.
 */
const runtimeRoot = process.env.APR_ACCEPTANCE_RUNTIME_ROOT
  ?? process.env.APR_REGRESSION_RUNTIME_ROOT
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const runId = process.argv[2];
if (!runId) { process.stderr.write("usage: apr-stop-disposition-cli.ts <runId>\n"); process.exit(2); }

const readJson = (target: string): Record<string, unknown> | null => {
  try { return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown> : null; }
  catch { return null; }
};
const str = (value: unknown) => typeof value === "string" ? value : null;
const items = (checkpoint: Record<string, unknown> | null) =>
  (checkpoint?.items as Array<Record<string, unknown>> | undefined) ?? [];

const runCheckpoint = readJson(path.join(runtimeRoot, "runs", runId, "checkpoint.json"));
if (!runCheckpoint) { process.stderr.write(`apr_stop_disposition_run_not_found:${runId}\n`); process.exit(3); }

const cases: AprStopCaseInput[] = [];
for (const result of (runCheckpoint.results as Array<Record<string, unknown>> | undefined) ?? []) {
  const customerKey = str(result.customerKey);
  const state = str(result.state) ?? "unknown";
  if (!customerKey || state === "saved") continue;
  const cohortRoot = path.join(runtimeRoot, "cohorts", `apr-pilot-${String(result.cohort)}-global-controller-${customerKey}`);

  const preflightItem = items(readJson(path.join(cohortRoot, "crm-local-preflight", "checkpoint.json")))
    .find((entry) => str(entry.customerKey) === customerKey);
  // Le pratiche ritirate dall'operatore non sono ferme: escono prima.
  if (str(preflightItem?.state) === "deferred_operator") continue;

  const blockerReasons: Record<string, string> = {};
  const blockerCodes = new Set<string>();
  for (const stage of ["crm-local-preflight", "deep-case-review", "infissi-batch-preflight", "enea-draft-execution"]) {
    for (const entry of items(readJson(path.join(cohortRoot, stage, "checkpoint.json")))) {
      if (str(entry.customerKey) !== customerKey) continue;
      for (const code of (entry.blockerCodes as unknown[] | undefined) ?? []) {
        if (typeof code === "string") blockerCodes.add(code);
      }
      const report = entry.report as Record<string, unknown> | undefined;
      for (const blocker of (report?.blockers as Array<Record<string, unknown>> | undefined) ?? []) {
        const code = str(blocker.code);
        if (!code) continue;
        blockerCodes.add(code);
        const reason = str(blocker.reason);
        if (reason && !blockerReasons[code]) blockerReasons[code] = reason;
      }
    }
  }

  const executionItem = items(readJson(path.join(cohortRoot, "enea-draft-execution", "checkpoint.json")))
    .find((entry) => str(entry.customerKey) === customerKey);
  const documentKeys = items(readJson(path.join(cohortRoot, "crm-document-analysis", "checkpoint.json")))
    .filter((entry) => str(entry.customerKey) === customerKey);
  const questions = readJson(path.join(cohortRoot, "operator-questions", "checkpoint.json"));

  cases.push({
    customerKey,
    displayName: str(result.displayName) ?? customerKey,
    state,
    blockerCodes: [...blockerCodes],
    blockerReasons,
    executionState: executionItem ? str(executionItem.state) : null,
    executionReason: executionItem ? str(executionItem.reason) : null,
    persistedQuestionCount: ((questions?.questions as unknown[] | undefined) ?? []).length,
    documentsAcquired: documentKeys.length > 0,
  });
}

process.stdout.write(`${JSON.stringify({ runId, ...disposeAprStoppedCases(cases) }, null, 2)}\n`);
