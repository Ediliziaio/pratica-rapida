import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCrmEneaDraftPackage } from "../../scripts/enea-shadow-runner/crmEneaPayloadAudit";
import { fingerprintPreparedPractice } from "../../src/features/enea-lab/preparation";

const root = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5201-global-controller-vincenzo-falconi";
const preflight = JSON.parse(readFileSync(path.join(root, "crm-local-preflight/checkpoint.json"), "utf8"));
const analysis = JSON.parse(readFileSync(path.join(root, "crm-document-analysis/checkpoint.json"), "utf8"));
const item = preflight.items.find((candidate: { customerKey: string }) => candidate.customerKey === "vincenzo-falconi");
if (!item?.report) throw new Error("falconi_preflight_report_missing");
const dossierValue = JSON.parse(readFileSync(item.dossierPath, "utf8"));

const base = {
  customerKey: item.customerKey,
  dossierValue,
  resolvedTaxCode: item.report.resolvedTaxCode,
  startDate: item.report.startDate,
  startDateSource: item.report.startDateSource,
  completionDate: item.report.completionDate,
  products: item.report.products,
  financialVerified: item.report.financial.tripleReconciliationVerified,
  reconciledTotal: item.report.financial.reconciledTotal,
  resolvedBuildingUnitCount: item.report.buildingUnitCount,
  resolvedBuildingQualification: item.report.buildingQualification,
  resolvedCoBeneficiaryPresent: item.report.coBeneficiaryResolution.present,
  resolvedCoBeneficiary: item.report.coBeneficiaryResolution.identity
    ? { ...item.report.coBeneficiaryResolution.identity, sourceIds: item.report.coBeneficiaryResolution.sourceIds }
    : null,
  analysis,
};

const legacyWorkerRebuild = buildCrmEneaDraftPackage(base);
const exactPreflightInputs = buildCrmEneaDraftPackage({
  ...base,
  resolvedPrimaryBeneficiary: item.report.primaryBeneficiaryResolution.status === "verified_document"
    ? item.report.primaryBeneficiaryResolution.identity
    : null,
  resolvedPrimaryBeneficiarySourceIds: item.report.primaryBeneficiaryResolution.sourceIds,
  resolvedWorksMunicipality: item.report.worksMunicipalityResolution.status === "verified_document"
    ? item.report.worksMunicipalityResolution.value
    : null,
  resolvedWorksMunicipalitySourceIds: item.report.worksMunicipalityResolution.sourceIds,
});

const summarize = (result: ReturnType<typeof buildCrmEneaDraftPackage>) => {
  if (result.status !== "built") return result;
  const fields = Object.fromEntries(result.mapped.sections.flatMap((section) => section.fields)
    .map((field) => [field.id, { value: field.value, status: field.status, source: field.source }]));
  return {
    mappingFingerprint: fingerprintPreparedPractice(result.mapped, result.issues),
    workflowFingerprint: result.portalGate.status === "ready" ? result.portalGate.fingerprint : null,
    beneficiary: Object.fromEntries(Object.entries(fields).filter(([id]) => id.startsWith("beneficiario."))),
    municipality: Object.fromEntries(Object.entries(fields).filter(([id]) => id.includes("comune") || id.includes("provincia"))),
  };
};

const legacy = summarize(legacyWorkerRebuild);
const exact = summarize(exactPreflightInputs);
process.stdout.write(`${JSON.stringify({
  schemaVersion: "apr-falconi-package-drift-diagnosis-v1",
  generatedAt: new Date().toISOString(),
  sourceCohort: root,
  acceptedPreflight: {
    mappingFingerprint: item.report.eneaPayloadAudit.mappingFingerprint,
    workflowFingerprint: item.report.eneaPayloadAudit.portalGate.workflowFingerprint,
  },
  legacyWorkerRebuild: legacy,
  exactPreflightInputs: exact,
  provenOmissionsInLegacyWorkerRebuild: ["resolvedPrimaryBeneficiary", "resolvedPrimaryBeneficiarySourceIds", "resolvedWorksMunicipality", "resolvedWorksMunicipalitySourceIds"],
  diagnosisSha256: createHash("sha256").update(JSON.stringify({ legacy, exact })).digest("hex"),
}, null, 2)}\n`);
