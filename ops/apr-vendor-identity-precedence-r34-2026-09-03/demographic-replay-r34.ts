import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";

const repositoryArtifact = "ops/apr-vendor-identity-precedence-r34-2026-09-03/demographic-replay-evidence-r34.json";
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const manifest = JSON.parse(readFileSync("ops/apr-wide100-province-lineage-2026-09-02/manifest.json", "utf8"));
const requested = new Set(["riccardo-coda", "caterina-claudia-garbato"]);
const cases = [];

for (const candidate of manifest.cases ?? []) {
  if (!requested.has(candidate.customerKey)) continue;
  const prefix = `apr-pilot-${2920 + candidate.cohort}-global-controller-`;
  const directory = readdirSync(cohortRoot).find((name) => name.startsWith(prefix));
  if (!directory) throw new Error(`cohort_missing:${candidate.customerKey}`);
  const root = `${cohortRoot}/${directory}`;
  const dossierPath = `${root}/crm-acquisition/dossiers/${candidate.customerKey}.json`;
  const analysisPath = `${root}/crm-document-analysis/checkpoint.json`;
  if (!existsSync(dossierPath) || !existsSync(analysisPath)) throw new Error(`evidence_missing:${candidate.customerKey}`);
  const dossier = JSON.parse(readFileSync(dossierPath, "utf8"));
  const report = buildCrmLocalPreflightReport(dossier, candidate.customerKey, JSON.parse(readFileSync(analysisPath, "utf8")), new Date("2026-09-03T14:00:00Z"));
  const fields = report.eneaPayloadAudit.status === "payload_complete"
    ? []
    : [];
  cases.push({
    customerKey: candidate.customerKey,
    practiceId: candidate.practiceId,
    crmBirthDate: dossier.row?.dati_form?.richiedente?.data_nascita ?? null,
    primaryBeneficiaryResolution: report.primaryBeneficiaryResolution,
    warning: report.warnings.find((item) => item.code === "primary_beneficiary_identity_overridden_by_invoice") ?? null,
    payloadStatus: report.eneaPayloadAudit.status,
    externalActionAllowed: report.eneaPayloadAudit.externalActionAllowed,
    fields,
  });
}

if (cases.length !== requested.size) throw new Error(`case_count:${cases.length}`);
const artifact = { schemaVersion: "apr-documentary-demographics-replay-r34-v1", localOnly: true, cases };
writeFileSync(repositoryArtifact, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
