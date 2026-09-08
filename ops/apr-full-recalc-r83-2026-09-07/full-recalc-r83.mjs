import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis.ts";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight.ts";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight.ts";

// Ricalcolo completo, fresh, con il codice corrente aggiornato, di TUTTE le
// pratiche del campione wide100 che risultano bloccate nei checkpoint
// persistiti (non solo il gruppo invoice_332a5af9/screenings_missing). Usa
// gli stessi metodi persistenti gia' usati in passato per Trabucco/Stricelli
// (applyValidationRevision + reconcileAuthoritativeInfissiApplicability),
// non un bypass: i risultati vengono scritti nei checkpoint reali.

const repository = path.resolve(import.meta.dirname, "../..");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");

// --- 0. Confermare che il bundle installato e' davvero quello appena costruito da questo sorgente ---
if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_full_recalc_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "../apr-install-capitanelli-nation-fallback-fix-r83-2026-09-07/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_full_recalc_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);

const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cohortOffset = 2920;
const VALIDATION_REVISION = "apr-full-recalc-r83-2026-09-07";
const now = new Date();

const results = [];

for (const c of manifest.cases) {
  const dirName = `apr-pilot-${cohortOffset + c.cohort}-global-controller-${c.customerKey}`;
  const stateDirectory = path.join(cohortRoot, dirName);
  const commonPath = path.join(stateDirectory, "crm-local-preflight", "checkpoint.json");
  if (!existsSync(commonPath)) {
    results.push({ customerKey: c.customerKey, cohort: c.cohort, module: c.module, touched: false, reason: "common_checkpoint_missing" });
    continue;
  }
  const beforeCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const beforeItem = beforeCp.items.find((item) => item.customerKey === c.customerKey);
  const wasBlocked = beforeItem?.state === "blocked_case";
  if (!wasBlocked) {
    results.push({ customerKey: c.customerKey, cohort: c.cohort, module: c.module, touched: false, reason: "already_not_blocked", stateBefore: beforeItem?.state ?? null });
    continue;
  }

  const documentAnalysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
  const common = new PersistentAprCrmLocalPreflight(stateDirectory, documentAnalysis);
  common.applyValidationRevision(VALIDATION_REVISION, now);

  const infissiPath = path.join(stateDirectory, "infissi-batch-preflight", "checkpoint.json");
  let infissiState = null;
  if (existsSync(infissiPath)) {
    const infissi = new PersistentAprInfissiBatchPreflight(stateDirectory);
    // Alcuni checkpoint Infissi restano fermi a status "working" (mai
    // arrivati a "completed") da prima di stanotte: applyValidationRevision
    // no-opa silenziosamente finche' lo status non e' "completed". Un primo
    // giro di tick() "pulisce" questo stato residuo senza ricalcolare nulla
    // (nessun item resta "queued" da rielaborare), poi la validazione vera
    // puo' essere applicata.
    infissiState = infissi.initialize(now);
    let cleanupGuard = 0;
    while (infissiState.status !== "completed" && cleanupGuard < 50) {
      infissiState = infissi.tick(now);
      cleanupGuard += 1;
    }
    infissiState = infissi.applyValidationRevision(VALIDATION_REVISION, now);
    let guard = 0;
    while (infissiState.status !== "completed" && guard < 200) {
      infissiState = infissi.tick(now);
      guard += 1;
    }
    if (infissiState.status !== "completed") throw new Error(`apr_full_recalc_infissi_stuck:${c.customerKey}`);
    // La riconciliazione autorevole Infissi->comune usa lo stato Infissi
    // appena ricalcolato per correggere i falsi blocker Schermature sulle
    // pratiche Infissi pure (mai su quelle "mixed", per costruzione).
    common.reconcileAuthoritativeInfissiApplicability(infissiState, `${VALIDATION_REVISION}-reconcile`, now);
  }

  const afterCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const afterItem = afterCp.items.find((item) => item.customerKey === c.customerKey);
  results.push({
    customerKey: c.customerKey,
    cohort: c.cohort,
    module: c.module,
    touched: true,
    stateBefore: "blocked_case",
    stateAfter: afterItem?.state ?? null,
    blockerCodesBefore: (beforeItem.report?.blockers ?? []).map((b) => b.code),
    blockerCodesAfter: (afterItem?.report?.blockers ?? []).map((b) => b.code),
    infissiStateAfter: infissiState ? infissiState.items.find((item) => item.customerKey === c.customerKey)?.state ?? null : null,
  });
}

const touched = results.filter((r) => r.touched);
const resolvedNow = touched.filter((r) => r.stateAfter === "ready_local_plan");
const stillBlocked = touched.filter((r) => r.stateAfter === "blocked_case");

const summary = {
  version: "apr-full-recalc-r83-summary-v1",
  ranAt: now.toISOString(),
  installedVersionId,
  validationRevision: VALIDATION_REVISION,
  totalCases: manifest.cases.length,
  touchedCount: touched.length,
  resolvedNowCount: resolvedNow.length,
  stillBlockedCount: stillBlocked.length,
  skippedCount: results.length - touched.length,
};
console.log(JSON.stringify(summary, null, 2));

const outputDirectory = import.meta.dirname;
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "recalc-results.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
