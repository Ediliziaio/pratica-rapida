import { readFileSync } from "node:fs";
import path from "node:path";
import { disposeAprStoppedCase } from "../../scripts/enea-shadow-runner/aprStopDisposition";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { applyOperatorResponseDossierOverrides, PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const observedAt = new Date("2026-09-14T11:30:00Z");
const cases = [
  { directory: "apr-pilot-9010-global-controller-stefania-venturi", customerKey: "stefania-venturi" },
  { directory: "apr-pilot-9011-global-controller-eugenio-codognato", customerKey: "eugenio-codognato" },
  { directory: "apr-pilot-9013-global-controller-patrizia-muzzi", customerKey: "patrizia-muzzi" },
] as const;

const results = cases.map(({ directory, customerKey }) => {
  const root = path.join(cohortsRoot, directory);
  const dossier = JSON.parse(readFileSync(path.join(root, "crm-acquisition/dossiers", `${customerKey}.json`), "utf8"));
  const analysis = JSON.parse(readFileSync(path.join(root, "crm-document-analysis/checkpoint.json"), "utf8"));
  const practiceId = dossier.row.id as string;
  const responses = new PersistentAprOperatorResponseLedger(root).projection(customerKey, practiceId, observedAt);
  const prepared = applyOperatorResponseDossierOverrides(dossier, responses);
  const report = buildCrmLocalPreflightReport(prepared.dossier, customerKey, analysis, observedAt, undefined, responses);
  const blockerCodes = report.blockers.map((blocker) => blocker.code);
  const totalMappingBlockers = report.blockers.filter((blocker) => blocker.code === "draft_payload_mapping_incomplete"
    && /totale.*(?:non (?:e |è )?stato riconosciuto|non riconosciuto)/i.test(blocker.reason));
  const requiredSections = report.blockers.find((blocker) => blocker.code === "customer_form_required_sections_missing");
  return {
    customerKey,
    outcome: report.outcome,
    invoiceTotal: report.financial.invoiceTotal,
    blockerCodes,
    totalMappingBlockers: totalMappingBlockers.map((blocker) => ({ reason: blocker.reason, exactCause: blocker.exactCause })),
    requiredSections: requiredSections ? {
      classification: disposeAprStoppedCase({
        customerKey,
        state: report.outcome,
        blockerCodes: [requiredSections.code],
        blockerReasons: { [requiredSections.code]: requiredSections.reason },
        executionState: null,
        executionReason: null,
        persistedQuestionCount: 0,
        documentsAcquired: true,
      }).kind,
      exactCause: requiredSections.exactCause,
      operatorQuestion: requiredSections.operatorQuestion,
    } : null,
  };
});

process.stdout.write(`${JSON.stringify({ mode: "read_only", observedAt: observedAt.toISOString(), cases: results }, null, 2)}\n`);
