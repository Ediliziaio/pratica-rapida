import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport, reconcileCommonReportWithAuthoritativeInfissiGate } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

type ManifestCase = {
  cohort: number; practiceId: string; customerKey: string; displayName: string;
  stage: string; stageName: string; module: string; productEvidence: string;
  reseller: string; invoiceCount: number; complexity: string;
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
const currentSourceMode = process.env.APR_LOCAL_REPLAY_CURRENT_SOURCE === "1";
const operationRoot = process.env.APR_LOCAL_REPLAY_OPERATION_ROOT
  ? path.resolve(process.env.APR_LOCAL_REPLAY_OPERATION_ROOT)
  : import.meta.dirname;
const manifestPath = path.join(repoRoot, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const installAttestationPath = path.join(repoRoot, "ops/apr-wide100-financial-parser-r31-2026-09-02/financial-parser-install-attestation-r31.json");
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const expectedManifestSha256 = "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0";
const installedBundleVersion = "5156569e-resolved-non-economic-blocker-r31-20260902";
const expectedBundleVersion = currentSourceMode ? "working-tree-current-source-20260903" : installedBundleVersion;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const dedupe = <T extends { code: string }>(items: T[]) => [...new Map(items.map((item) => [item.code, item])).values()];

function blockerFamily(code: string, field: string) {
  const value = `${code} ${field}`.toLowerCase();
  if (/(invoice|bank_transfer|economic|gross|financial|reconciliation)/.test(value)) return "financial";
  if (/(completion|start_date|date|90_days|proced)/.test(value)) return "dates_procedurability";
  if (/(tax_code|customer_form|identity|birth|beneficiar)/.test(value)) return "identity";
  if (/(screening|technical|dimension|measure|cardinality|window|closure|product|gtot|uw)/.test(value)) return "products_measurements";
  return "other";
}

function documentTaxonomy(code: string, reason: string) {
  const value = `${code} ${reason}`.toLowerCase();
  if (/acconto|caparra/.test(value)) return { documentType: "invoice", documentLabel: "fattura di acconto/caparra" };
  if (/invoice|fattur/.test(value)) return { documentType: "invoice", documentLabel: "fattura o insieme completo delle fatture" };
  if (/bank_transfer|bonific/.test(value)) return { documentType: "bank_transfer_receipt", documentLabel: "ricevuta del bonifico parlante" };
  if (/customer_form|modulo cliente/.test(value)) return { documentType: "signed_customer_form", documentLabel: "modulo cliente firmato" };
  if (/tax_code|codice fiscale|identity/.test(value)) return { documentType: "identity_evidence", documentLabel: "documento/modulo con codice fiscale verificabile" };
  if (/completion|fine lavori/.test(value)) return { documentType: "completion_date_evidence", documentLabel: "documento che prova la data di fine lavori" };
  if (/start_date|inizio lavori/.test(value)) return { documentType: "start_date_evidence", documentLabel: "documento che prova la data di inizio lavori" };
  if (/dimension|measure|misur|cardinality|product|technical|screening|window|gtot|uw/.test(value)) return { documentType: "product_technical_evidence", documentLabel: "scheda tecnica/prodotto con quantità e misure" };
  return { documentType: "supporting_document", documentLabel: "documento probatorio da identificare" };
}

function operatorQuestion(code: string, reason: string, label: string) {
  if (code === "original_invoice_missing_or_unavailable") return `Può inviare ${label}, completa e leggibile, richiamata nella fattura già presente?`;
  if (/bank_transfer/.test(code)) return `Può inviare ${label}, completa e leggibile, riferita alle fatture della pratica?`;
  if (/customer_form/.test(code)) return `Può inviare il modulo cliente completo e firmato?`;
  if (/tax_code|identity/.test(code)) return `Può inviare un documento o modulo leggibile che confermi il codice fiscale del beneficiario?`;
  if (/completion|start_date|date/.test(code)) return `Può inviare ${label}, con la data chiaramente leggibile?`;
  if (/dimension|measure|cardinality|technical|product|screening|window|gtot|uw/.test(code)) return `Può inviare ${label}, indicando chiaramente quantità, larghezza e altezza di ogni elemento?`;
  return `Può inviare o chiarire ${label}? Dettaglio rilevato da APR: ${reason}`;
}

function main() {
  mkdirSync(operationRoot, { recursive: true });
  const manifestBytes = readFileSync(manifestPath);
  const manifestHash = sha256(manifestBytes);
  if (manifestHash !== expectedManifestSha256) throw new Error(`manifest_hash_mismatch:${manifestHash}`);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { cases: ManifestCase[] };
  if (manifest.cases.length !== 100) throw new Error(`manifest_count_mismatch:${manifest.cases.length}`);
  const installAttestation = currentSourceMode ? null : json(installAttestationPath);
  if (!currentSourceMode && (installAttestation?.status !== "installed_and_operationally_verified" || installAttestation.bundle?.versionId !== expectedBundleVersion)) {
    throw new Error("bundle_attestation_mismatch");
  }
  const bundlePath = currentSourceMode ? repoRoot : String(installAttestation?.bundle.currentTarget);
  if (!existsSync(bundlePath) || (!currentSourceMode && path.basename(bundlePath) !== expectedBundleVersion)) throw new Error("bundle_path_missing");
  const bundleHashes = currentSourceMode
    ? Object.fromEntries([
        "scripts/enea-shadow-runner/crmLocalPreflight.ts",
        "scripts/enea-shadow-runner/localInvoiceSegmentation.ts",
        "src/features/enea-lab/invoiceParser.ts",
        "src/features/enea-shadow-crm/operationalRegistry.ts",
        "src/features/enea-shadow-crm/ruleTestMatrix.ts",
      ].map((file) => [file, sha256(readFileSync(path.join(repoRoot, file)))]))
    : installAttestation!.bundle.hashes as Record<string, string>;
  for (const [file, expected] of Object.entries(bundleHashes)) {
    const actual = sha256(readFileSync(path.join(bundlePath, file)));
    if (actual !== expected) throw new Error(`bundle_file_hash_mismatch:${file}:${actual}`);
  }

  const freezePath = path.join(operationRoot, "freeze.json");
  const businessTime = existsSync(freezePath) ? String(json(freezePath).businessTime) : new Date().toISOString();
  const freeze = {
    schemaVersion: "apr-wide100-local-replay-freeze-v1",
    businessTime,
    manifest: { path: manifestPath, sha256: manifestHash, count: manifest.cases.length },
    bundle: { versionId: expectedBundleVersion, path: bundlePath, hashes: bundleHashes, currentSourceMode },
    safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
  writeFileSync(freezePath, `${JSON.stringify(freeze, null, 2)}\n`, { mode: 0o600 });
  const now = new Date(businessTime);
  const cohortNames = readdirSync(cohortRoot);
  const scratchRoot = mkdtempSync(path.join(tmpdir(), currentSourceMode ? "apr-wide100-local-replay-current-" : "apr-wide100-local-replay-r31-"));

  try {
    const cases = manifest.cases.map((entry) => {
      const operationalCohort = 2920 + entry.cohort;
      const prefix = `apr-pilot-${operationalCohort}-global-controller-`;
      const matches = cohortNames.filter((name) => name.startsWith(prefix));
      if (matches.length !== 1) throw new Error(`cohort_state_count:${entry.customerKey}:${matches.length}`);
      const stateDir = path.join(cohortRoot, matches[0]);
      const current = resolveCurrentCohortManifestCase(stateDir, entry.customerKey);
      if (current.practiceId !== entry.practiceId) throw new Error(`practice_mismatch:${entry.customerKey}`);
      const analysis = new PersistentAprCrmDocumentAnalysis(stateDir).snapshot(now);
      const dossier = json(current.evidence.dossierPath);
      const commonOriginal = buildCrmLocalPreflightReport(dossier, entry.customerKey, analysis, now);

      const scratch = path.join(scratchRoot, String(entry.cohort).padStart(3, "0"));
      mkdirSync(scratch, { recursive: true, mode: 0o700 });
      symlinkSync(path.join(stateDir, "crm-acquisition"), path.join(scratch, "crm-acquisition"), "dir");
      symlinkSync(path.join(stateDir, "crm-document-analysis"), path.join(scratch, "crm-document-analysis"), "dir");
      mkdirSync(path.join(scratch, "crm-local-preflight"), { recursive: true, mode: 0o700 });
      const commonCheckpoint = {
        version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "local-replay-r31",
        currentCustomerKey: null,
        items: [{ customerKey: entry.customerKey, displayName: entry.displayName, practiceId: entry.practiceId, dossierPath: current.evidence.dossierPath, state: commonOriginal.outcome, attemptCount: 1, startedAt: businessTime, endedAt: businessTime, report: commonOriginal, reason: "Replay locale r31" }],
        externalActionAllowed: false, reason: "Replay locale r31", nextAction: "Nessuna azione esterna.", validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [],
        audit: [{ revision: 1, at: businessTime, type: "completed", customerKey: null, reason: "Replay locale r31", appliedRuleIds: ["system-single-active-practice"] }],
      };
      writeFileSync(path.join(scratch, "crm-local-preflight/checkpoint.json"), `${JSON.stringify(commonCheckpoint, null, 2)}\n`, { mode: 0o600 });
      const infissi = new PersistentAprInfissiBatchPreflight(scratch);
      let infissiState = infissi.tick(now);
      for (let guard = 0; infissiState.status !== "completed" && guard < 5; guard += 1) infissiState = infissi.tick(now);
      if (infissiState.status !== "completed") throw new Error(`infissi_replay_incomplete:${entry.customerKey}`);
      const infissiItem = infissiState.items.find((item) => item.customerKey === entry.customerKey) ?? null;
      const common = infissiItem ? reconcileCommonReportWithAuthoritativeInfissiGate(commonOriginal) : commonOriginal;
      const commonBlockers = common.blockers.map((blocker) => ({ ...blocker, origin: "common" as const }));
      const productBlockers = (infissiItem?.report?.blockers ?? []).map((blocker) => ({
        ...blocker, reason: `Gate Infissi autorevole: ${blocker.code}.`, appliedRuleIds: infissiItem?.report?.appliedRuleIds ?? [], origin: "infissi" as const,
      }));
      const blockers = dedupe([...commonBlockers, ...productBlockers]).map((blocker) => {
        const family = blockerFamily(blocker.code, blocker.field);
        const taxonomy = documentTaxonomy(blocker.code, blocker.reason);
        return {
          ...blocker, family, ...taxonomy,
          missingElements: [blocker.reason],
          requirementStatus: null,
          verificationStatus: "pending_manual",
          responsibleParty: "to_be_verified",
          operatorQuestion: operatorQuestion(blocker.code, blocker.reason, taxonomy.documentLabel),
          onboardingGap: null,
          onboardingRecommendation: null,
          technicalEligibilityImpact: "pending_manual_classification",
        };
      });
      const outcome = blockers.length === 0 ? "READY_LOCAL" : "OPERATOR_REQUIRED_LOCAL";
      return {
        ...entry, operationalCohort, stateDirectory: stateDir, sourceSha256: current.evidence.sourceSha256,
        outcome, blockerCount: blockers.length, blockerFamilies: [...new Set(blockers.map((blocker) => blocker.family))], blockers,
        eligibilityStatus: outcome === "READY_LOCAL" ? "eligible" : "eligibility_pending",
        productGate: infissiItem ? { routed: true, outcome: infissiItem.report?.outcome, physicalProductCount: infissiItem.report?.physicalProductCount ?? 0 } : { routed: false, outcome: null, physicalProductCount: 0 },
        safety: { localOnly: true, externalActionAllowed: false },
      };
    });

    const countsByOutcome = Object.fromEntries([...new Set(cases.map((item) => item.outcome))].map((key) => [key, cases.filter((item) => item.outcome === key).length]));
    const countsByFamily = Object.fromEntries(["financial", "products_measurements", "dates_procedurability", "identity", "other"].map((family) => [family, cases.filter((item) => item.blockers.some((blocker) => blocker.family === family)).length]));
    const report = {
      schemaVersion: "apr-wide100-local-replay-r31-v1", generatedAt: new Date().toISOString(), businessTime,
      freezeSha256: sha256(readFileSync(freezePath)), manifestSha256: manifestHash, bundleVersion: expectedBundleVersion,
      safety: freeze.safety,
      summary: { total: cases.length, countsByOutcome, countsByFamily, eligible: cases.filter((item) => item.eligibilityStatus === "eligible").length, eligibilityPending: cases.filter((item) => item.eligibilityStatus === "eligibility_pending").length },
      metricPolicy: { numerator: "APR-ready among document-complete and procedurally eligible cases", denominator: "all document-complete and procedurally eligible cases", trueMissingDocumentsExcluded: true, aprPresentNotDetectedExcluded: false, pendingExcluded: false },
      cases,
    };
    const reportBase = currentSourceMode ? "local-replay-current-source" : "local-replay-r31";
    const reportPath = path.join(operationRoot, `${reportBase}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    const canonical = JSON.stringify({ ...report, generatedAt: null });
    writeFileSync(path.join(operationRoot, `${reportBase}.sha256`), `${sha256(canonical)}  ${reportBase}.json (generatedAt excluded)\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ reportPath, summary: report.summary, canonicalSha256: sha256(canonical) }, null, 2)}\n`);
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

main();
