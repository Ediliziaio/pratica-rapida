import { readFileSync, writeFileSync } from "node:fs";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";

const cohorts = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cases = [
  { cohort: "apr-pilot-2962-global-controller-massimiliano-montemorra", customerKey: "massimiliano-montemorra" },
  { cohort: "apr-pilot-3019-global-controller-antonino-formisabo", customerKey: "antonino-formisabo" },
];

const results = cases.map(({ cohort, customerKey }) => {
  const root = `${cohorts}/${cohort}`;
  const dossier = JSON.parse(readFileSync(`${root}/crm-acquisition/dossiers/${customerKey}.json`, "utf8"));
  const analysis = JSON.parse(readFileSync(`${root}/crm-document-analysis/checkpoint.json`, "utf8"));
  const report = buildCrmLocalPreflightReport(dossier, customerKey, analysis, new Date("2026-09-03T15:30:00+02:00"));
  return {
    customerKey,
    crmIdentity: { name: dossier.row.cliente_nome, surname: dossier.row.cliente_cognome, taxCode: dossier.row.cliente_cf },
    supplier: { fornitore: dossier.row.fornitore, company: dossier.row.companies?.ragione_sociale },
    outcome: report.outcome,
    primaryBeneficiaryResolution: report.primaryBeneficiaryResolution,
    blockers: report.blockers,
    productsProcessed: report.products.length,
    financialEvidenceProcessed: report.financial.evidence.length,
    draftReady: report.eneaPayloadAudit.draftReady,
    externalActionAllowed: report.eneaPayloadAudit.externalActionAllowed,
  };
});

const artifact = { schemaVersion: "apr-vendor-identity-replay-r33-v1", localOnly: true, cases: results };
writeFileSync("ops/apr-vendor-identity-precedence-r33-2026-09-03/replay-evidence.json", `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
