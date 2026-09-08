import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis.ts";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight.ts";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight.ts";

// Correzione del difetto strutturale diagnosticato l'8/9/2026: gli script di
// ricalcolo usati finora (full-recalc-r75..r85) saltavano ogni pratica gia'
// "ready_local_plan" nel checkpoint persistito ("if (!wasBlocked) continue"),
// fidandosi di un verdetto vecchio invece di ricostruirlo. Il meccanismo di
// fondo (applyValidationRevision, sia sul preflight comune sia sul batch
// Infissi) e' gia' corretto e ricalcola SEMPRE tutti gli item non accantonati
// quando invocato (verificato con test dedicati in crmLocalPreflight.test.ts);
// il difetto era soltanto nello script di orchestrazione esterno. Questo
// script non salta MAI nessuna pratica: applica la validazione a tutte le 100,
// pronte o bloccate che fossero, e registra la revisione del checkpoint prima
// e dopo come prova che ciascuna e' stata davvero ricostruita, non letta da
// cache.

const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");

// --- 0. Confermare che il bundle installato e' davvero quello appena costruito da questo sorgente ---
if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_full_reconstruction_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "../apr-install-never-trust-past-checkpoint-r88-2026-09-08-2026-09-08/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_full_reconstruction_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);
for (const name of Object.keys(installReceipt.installedBundle)) {
  const activePath = path.join(currentPointer, name);
  if (sha256File(activePath) !== installReceipt.installedBundle[name]) throw new Error(`apr_full_reconstruction_active_hash_mismatch:${name}`);
}

const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cohortOffset = 2920;
const VALIDATION_REVISION = "apr-full-reconstruction-r88-2026-09-08";
const now = new Date();

const results = [];

for (const c of manifest.cases) {
  const dirName = `apr-pilot-${cohortOffset + c.cohort}-global-controller-${c.customerKey}`;
  const stateDirectory = path.join(cohortRoot, dirName);
  const commonPath = path.join(stateDirectory, "crm-local-preflight", "checkpoint.json");
  if (!existsSync(commonPath)) {
    results.push({ customerKey: c.customerKey, cohort: c.cohort, module: c.module, reconstructed: false, reason: "common_checkpoint_missing" });
    continue;
  }
  const beforeCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const beforeItem = beforeCp.items.find((item) => item.customerKey === c.customerKey);
  const revisionBefore = beforeCp.revision;
  const stateBefore = beforeItem?.state ?? null;

  // Nessun "if (!wasBlocked) continue": ogni pratica, pronta o bloccata che
  // fosse nel checkpoint persistito, viene ricostruita da zero qui sotto.
  const documentAnalysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
  const common = new PersistentAprCrmLocalPreflight(stateDirectory, documentAnalysis);
  common.applyValidationRevision(VALIDATION_REVISION, now);

  const infissiPath = path.join(stateDirectory, "infissi-batch-preflight", "checkpoint.json");
  let infissiState = null;
  if (existsSync(infissiPath)) {
    const infissi = new PersistentAprInfissiBatchPreflight(stateDirectory);
    // Alcuni checkpoint Infissi restano fermi a status "working" da run
    // precedenti: applyValidationRevision no-opa silenziosamente finche' lo
    // status non e' "completed". Un primo giro di tick() pulisce questo stato
    // residuo senza ricalcolare nulla, poi la validazione vera viene applicata
    // a TUTTI gli item del batch (mai filtrati per stato precedente: il
    // metodo stesso li riaccoda tutti, verificato nel codice sorgente).
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
    if (infissiState.status !== "completed") throw new Error(`apr_full_reconstruction_infissi_stuck:${c.customerKey}`);
    common.reconcileAuthoritativeInfissiApplicability(infissiState, `${VALIDATION_REVISION}-reconcile`, now);
  }

  const afterCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const afterItem = afterCp.items.find((item) => item.customerKey === c.customerKey);
  const revisionAfter = afterCp.revision;
  results.push({
    customerKey: c.customerKey,
    cohort: c.cohort,
    module: c.module,
    reconstructed: true,
    // Prova di ricostruzione reale: la revisione del checkpoint e' avanzata e
    // la nuova validationRevision compare nell'elenco applicato, per OGNI
    // pratica, indipendentemente da come fosse classificata prima.
    revisionBefore,
    revisionAfter,
    revisionAdvanced: revisionAfter > revisionBefore,
    validationRevisionApplied: (afterCp.validationRevisionsApplied ?? []).includes(VALIDATION_REVISION),
    stateBefore,
    stateAfter: afterItem?.state ?? null,
    flipped: stateBefore !== null && stateBefore !== (afterItem?.state ?? null),
    blockerCodesBefore: (beforeItem?.report?.blockers ?? []).map((b) => b.code),
    blockerCodesAfter: (afterItem?.report?.blockers ?? []).map((b) => b.code),
    infissiStateAfter: infissiState ? infissiState.items.find((item) => item.customerKey === c.customerKey)?.state ?? null : null,
  });
}

const reconstructed = results.filter((r) => r.reconstructed);
const missing = results.filter((r) => !r.reconstructed);
const readyNow = reconstructed.filter((r) => r.stateAfter === "ready_local_plan");
const blockedNow = reconstructed.filter((r) => r.stateAfter === "blocked_case");
const flippedToReady = reconstructed.filter((r) => r.flipped && r.stateAfter === "ready_local_plan");
const flippedToBlocked = reconstructed.filter((r) => r.flipped && r.stateAfter === "blocked_case");
const notGenuinelyRebuilt = reconstructed.filter((r) => !r.revisionAdvanced || !r.validationRevisionApplied);

const summary = {
  version: "apr-full-reconstruction-r88-summary-v1",
  ranAt: now.toISOString(),
  installedVersionId,
  validationRevision: VALIDATION_REVISION,
  totalCases: manifest.cases.length,
  reconstructedCount: reconstructed.length,
  missingCount: missing.length,
  readyNowCount: readyNow.length,
  blockedNowCount: blockedNow.length,
  flippedToReadyCount: flippedToReady.length,
  flippedToBlockedCount: flippedToBlocked.length,
  // Deve essere sempre 0: se anche una sola pratica non mostra una revisione
  // avanzata e la nuova validationRevision applicata, la ricostruzione non e'
  // stata genuina per quel caso.
  notGenuinelyRebuiltCount: notGenuinelyRebuilt.length,
};
console.log(JSON.stringify(summary, null, 2));
if (notGenuinelyRebuilt.length > 0) {
  console.error("PRATICHE NON GENUINAMENTE RICOSTRUITE:", JSON.stringify(notGenuinelyRebuilt.map((r) => r.customerKey)));
  process.exitCode = 1;
}
if (flippedToBlocked.length > 0) {
  console.log("PRATICHE PASSATE DA PRONTA A BLOCCATA (verificare singolarmente):", JSON.stringify(flippedToBlocked.map((r) => ({ customerKey: r.customerKey, blockerCodesAfter: r.blockerCodesAfter })), null, 2));
}
if (flippedToReady.length > 0) {
  console.log("PRATICHE PASSATE DA BLOCCATA A PRONTA:", JSON.stringify(flippedToReady.map((r) => r.customerKey)));
}

const outputDirectory = import.meta.dirname;
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "full-reconstruction-results.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
