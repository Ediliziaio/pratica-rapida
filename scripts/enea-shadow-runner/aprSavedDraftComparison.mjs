#!/usr/bin/env node
import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERSION = "apr-saved-draft-crm-comparison-v1";
const RULE_IDS = Object.freeze([
  "core-mapping-complete",
  "system-readonly-adapter-contract",
  "system-atomic-checkpoint-resume",
]);
const EXCLUDED_FIELDS = Object.freeze([
  "dati impianto termico",
  "risparmio energetico stimato",
  "finestre protette",
  "data fine lavori (TEST)",
]);

function json(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function atomicWrite(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, filePath);
}

function discrepancy(field, reason, expected, observed) {
  return { field, reason, expected, observed };
}

export function buildSavedDraftComparison(rootDirectory, now = new Date()) {
  const preflightPath = path.join(rootDirectory, "crm-local-preflight", "checkpoint.json");
  const executionPath = path.join(rootDirectory, "enea-draft-execution", "checkpoint.json");
  const acquisitionPath = path.join(rootDirectory, "crm-acquisition", "checkpoint.json");
  for (const required of [preflightPath, executionPath, acquisitionPath]) {
    if (!existsSync(required)) throw new Error(`apr_comparison_checkpoint_missing:${required}`);
  }

  const preflight = json(preflightPath);
  const execution = json(executionPath);
  const acquisition = json(acquisitionPath);
  if (preflight.status !== "completed" || execution.status !== "completed" || acquisition.status !== "completed") {
    throw new Error("apr_comparison_sources_not_terminal");
  }

  const preflightByKey = new Map(preflight.items.map((item) => [item.customerKey, item]));
  const acquisitionByKey = new Map(acquisition.items.map((item) => [item.customerKey, item]));
  const saved = execution.items.filter((item) => item.state === "saved");
  const cases = saved.map((draft) => {
    const local = preflightByKey.get(draft.customerKey);
    const dossier = acquisitionByKey.get(draft.customerKey);
    const discrepancies = [];
    if (!local) discrepancies.push(discrepancy("customerKey", "preflight_missing", draft.customerKey, null));
    if (!dossier) discrepancies.push(discrepancy("customerKey", "crm_dossier_missing", draft.customerKey, null));
    if (local && local.practiceId !== draft.practiceId) discrepancies.push(discrepancy("practiceId", "crm_practice_identity_mismatch", local.practiceId, draft.practiceId));
    if (dossier && dossier.practiceId !== draft.practiceId) discrepancies.push(discrepancy("practiceId", "acquisition_identity_mismatch", dossier.practiceId, draft.practiceId));
    if (local?.report?.eneaPayloadAudit?.mappingFingerprint !== draft.mappingFingerprint) discrepancies.push(discrepancy("mappingFingerprint", "mapped_payload_mismatch", local?.report?.eneaPayloadAudit?.mappingFingerprint ?? null, draft.mappingFingerprint));
    if (local?.report?.eneaPayloadAudit?.status !== "payload_complete") discrepancies.push(discrepancy("payload", "crm_payload_not_complete", "payload_complete", local?.report?.eneaPayloadAudit?.status ?? null));
    const completed = new Set(draft.completedPageIds);
    const missingPages = draft.expectedPageIds.filter((pageId) => !completed.has(pageId));
    if (missingPages.length) discrepancies.push(discrepancy("pages", "saved_pages_missing", draft.expectedPageIds, draft.completedPageIds));
    const pageEvidence = draft.pageCheckpoints.filter((item) => item.state === "saved" && item.savedEvidenceId).map((item) => item.savedEvidenceId);
    if (pageEvidence.length !== draft.expectedPageIds.length) discrepancies.push(discrepancy("serverEvidence", "saved_page_evidence_incomplete", draft.expectedPageIds.length, pageEvidence.length));
    if (new Set(pageEvidence).size !== pageEvidence.length) discrepancies.push(discrepancy("serverEvidence", "duplicate_server_evidence", pageEvidence.length, new Set(pageEvidence).size));
    if (!dossier?.responseSha256) discrepancies.push(discrepancy("crmResponse", "crm_server_fingerprint_missing", "sha256", null));

    return {
      customerKey: draft.customerKey,
      displayName: draft.displayName,
      practiceId: draft.practiceId,
      draftId: draft.draftId,
      savedAt: draft.savedAt,
      crmResponseSha256: dossier?.responseSha256 ?? null,
      mappingFingerprint: draft.mappingFingerprint,
      requiredPortalFieldCount: local?.report?.eneaPayloadAudit?.requiredPortalFieldCount ?? 0,
      comparedPages: draft.expectedPageIds.length,
      serverEvidenceCount: pageEvidence.length,
      sourceIds: local?.report?.sourceIds ?? [],
      sourceConsistencyDiscrepancies: discrepancies,
      sourceConsistencyStatus: discrepancies.length ? "differences_found" : "coherent",
    };
  });

  const nonSaved = execution.items.filter((item) => item.state !== "saved").map((item) => ({
    customerKey: item.customerKey,
    displayName: item.displayName,
    state: item.state,
    reason: item.reason,
  }));
  const preflightBlocked = preflight.items.filter((item) => item.state === "blocked_case").map((item) => ({
    customerKey: item.customerKey,
    displayName: item.displayName,
    state: item.state,
    blockers: item.report?.blockers ?? [],
  }));
  const sourceDiscrepancyCount = cases.reduce((sum, item) => sum + item.sourceConsistencyDiscrepancies.length, 0);
  const sourceFingerprint = sha256({
    preflight: preflight.sourceFingerprint,
    acquisition: acquisition.candidateFingerprint,
    executionRevision: execution.revision,
    cases: cases.map((item) => ({ practiceId: item.practiceId, draftId: item.draftId, mappingFingerprint: item.mappingFingerprint })),
  });
  const at = now.toISOString();
  return {
    version: VERSION,
    revision: 1,
    status: "completed_source_consistency_historical_benchmark_pending",
    executorIdentity: "APR/read-only-comparator",
    externalMutationAllowed: false,
    startedAt: at,
    endedAt: at,
    sourceFingerprint,
    scope: {
      compared: "bozza ENEA salvata vs dossier CRM acquisito read-only, fonti originarie e mapping APR verificato lato server",
      excludedFields: EXCLUDED_FIELDS,
      forbiddenSourcesConsulted: [],
    },
    summary: {
      cohortTotal: preflight.items.length,
      savedDraftsCompared: cases.length,
      sourceConsistencyDiscrepancies: sourceDiscrepancyCount,
      preflightOperatorCases: preflightBlocked.length,
      portalOperatorCases: nonSaved.length,
    },
    cases,
    preflightBlocked,
    nonSaved,
    manualOperatorBenchmark: {
      status: "available_via_post_draft_readonly_gate",
      reason: "Il dossier CRM ordinario non espone campi strutturati dell'output ENEA dell'operatore. Il registro autorizza pero', dopo la bozza TEST salvata, la lettura separata del PDF ENEA storico come benchmark isolato; non e' richiesta la presenza di un CPID nella bozza APR.",
      nextAction: "Eseguire apr-historical-benchmark-cli sulla stessa coorte. I valori storici restano esclusi da mapper, regole e correzioni della bozza.",
    },
    audit: [{
      revision: 1,
      at,
      type: "saved_draft_crm_readonly_comparison_completed",
      appliedRuleIds: RULE_IDS,
      reason: `${cases.length} bozze salvate confrontate con checkpoint CRM/fonti originarie: ${sourceDiscrepancyCount} discrepanze verificabili; benchmark umano non dichiarato senza fonte strutturata.`,
    }],
  };
}

export function runSavedDraftComparison(rootDirectory, now = new Date()) {
  const report = buildSavedDraftComparison(path.resolve(rootDirectory), now);
  const outputPath = path.join(path.resolve(rootDirectory), "crm-manual-comparison", "checkpoint.json");
  atomicWrite(outputPath, report);
  return { outputPath, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDirectory = process.argv[2];
  if (!rootDirectory) throw new Error("Uso: aprSavedDraftComparison.mjs <state-directory>");
  const result = runSavedDraftComparison(rootDirectory);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
