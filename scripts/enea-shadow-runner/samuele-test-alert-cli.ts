#!/usr/bin/env node
import path from "node:path";
import { ENEA_OPERATIONAL_REGISTRY_VERSION, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "../../src/features/enea-shadow-crm/preflightContract";
import { PersistentEneaRunner } from "./runner";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

const PRACTICE_ID = "audit-samuele-colombo";
const root = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
const runner = new PersistentEneaRunner(root);
const before = runner.load();
const samuele = before.queue.find((job) => job.practice.id === PRACTICE_ID);
if (before.runner.currentPracticeId !== PRACTICE_ID || !samuele || samuele.executionState !== "operator_intervention" || samuele.practice.displayName !== "Samuele Colombo") {
  throw new Error("Checkpoint rifiutato: il journal non è fermo esclusivamente su Samuele Colombo.");
}

const invoiceDate = "2026-03-19";
const elapsedDays = Math.floor((Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate()) - Date.parse(`${invoiceDate}T00:00:00Z`)) / 86_400_000);
if (elapsedDays !== 148) throw new Error(`Distanza temporale inattesa: ${elapsedDays} giorni anziché 148.`);
const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
  source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM Samuele Colombo"
    : step === "dates" ? "fattura originaria 48/001 del 19/03/2026 + policy TEST oltre 90 giorni"
      : step === "economic_sources" || step === "gross_reconciliation" ? "fattura originaria 48/001 e copia semantica deduplicata"
        : step === "screenings" || step === "enea_mapping" ? "tre righe schermatura della fattura 48/001 e form originario"
          : "fonti originarie read-only",
  ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
  reason: step === "dates" ? "Fine lavori 19/03/2026; 148 giorni prima della lavorazione. Alert auditato non bloccante per la sola modalità TEST; produzione/reale esclusa."
    : step === "economic_sources" ? "Fattura 48/001 classificata saldo; seconda copia semanticamente identica esclusa dal calcolo."
      : step === "gross_reconciliation" ? "Totale lordo IVA incluso €17.529,60 verificato da imponibile €15.936,00 + IVA €1.593,60 e totale documento; duplicato escluso."
        : step === "screenings" ? "Tre schermature mobili riconciliate: 6200×2470, 4230×2190, 6080×2437 mm; gTot esplicito 0,13; esposizioni sud-est, sud, est; meccanismo Manuale."
          : step === "enea_mapping" ? "Matrice tecnica completa con provenienza: tende da sole esterne, materiale Tessuto e meccanismo Manuale."
            : "Fonte originaria verificata in sola lettura.",
  nextAction: step === "dates" ? "Proseguire alla sola bozza TEST; non propagare l'eccezione a produzione/reale." : "Nessun blocco in questa fase.",
}])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
const run = runEneaPreflight({
  sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
  economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: true,
  financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
}, processingAt);

runner.recordAuthorizedReadOnlyPreflight("samuele-test-alert", PRACTICE_ID, {
  run,
  sources: [{ sourceId: "test-only-deadline-alert-samuele-2026-08-14", kind: "operator_policy", verification: "verified", note: "testMode=true; fine lavori 19/03/2026; elapsedDays=148; alert non bloccante; productionPropagation=forbidden." }],
  appliedRuleIds: [
    USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert, USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
    USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
    "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume",
    "core-form-first", "core-economic-classification", "core-gross-triple-reconciliation", "core-mapping-complete",
    "authorized-05-beneficiario-cf", "authorized-10-intervento-data-fine-lavori", "authorized-15-schermature-superficie-finestrata",
    "authorized-16-schermature-meccanismo", "authorized-22-schermature-materiale", "authorized-23-schermature-esposizione",
  ],
  reason: "Preflight Samuele Colombo interamente verde. Fine lavori 19/03/2026; superamento di 148 giorni registrato come alert non bloccante per la sola modalità TEST. Nessun override caso-specifico; produzione/reale esclusa.",
  nextAction: "Creare, compilare e salvare la sola bozza ENEA completa; fermarsi prima di anteprima e submit.",
}, "audit-samuele-colombo:preflight:test-only-deadline-alert:v1", processingAt);

const resumed = runner.resumeWorkflowAfterTestDeadlineAlert("samuele-test-alert", PRACTICE_ID, elapsedDays, "audit-samuele-colombo:workflow:test-only-deadline-alert:v1", new Date(processingAt.getTime() + 1_000));
process.stdout.write(`${JSON.stringify({ revision: resumed.revision, currentPracticeId: resumed.runner.currentPracticeId, executionState: resumed.queue.find((job) => job.practice.id === PRACTICE_ID)?.executionState, outcome: resumed.queue.find((job) => job.practice.id === PRACTICE_ID)?.preflightRun?.outcome, reason: resumed.runner.reason, nextAction: resumed.runner.nextAction }, null, 2)}\n`);
