import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../scripts/enea-shadow-runner/crmDocumentAnalysis.ts";
import { PersistentAprCrmLocalPreflight } from "../scripts/enea-shadow-runner/crmLocalPreflight.ts";
import { PersistentAprInfissiBatchPreflight } from "../scripts/enea-shadow-runner/infissiBatchPreflight.ts";

// Ricostruzione completa e mai selettiva (r90, 2026-09-08) su TUTTE le
// pratiche del campione wide100, dopo l'installazione del bundle con le
// correzioni Pescatori, Padoani, Monti (veneziana=persiana) e il nuovo
// meccanismo generale domanda-operatore per misura mancante/ambigua/
// multi-fornitore complessa (Tosatti, Di Cesare, Kasermann, Mondini,
// Berneri, Maeschi, Munafo). Stessa metodologia gia' usata per r89: ogni
// pratica viene ricalcolata da zero, mai saltata in base al verdetto
// precedente.

const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");

if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_r90_reconstruction_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "apr-install-product-cardinality-batch-r92-2026-09-08-2026-09-08/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_r90_reconstruction_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);
for (const name of Object.keys(installReceipt.installedBundle)) {
  const activePath = path.join(currentPointer, name);
  if (sha256File(activePath) !== installReceipt.installedBundle[name]) throw new Error(`apr_r90_reconstruction_active_hash_mismatch:${name}`);
}

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const VALIDATION_REVISION = "apr-full-reconstruction-r92-2026-09-08";

function reconstruct(dirName, customerKey) {
  const stateDirectory = path.join(cohortRoot, dirName);
  const commonPath = path.join(stateDirectory, "crm-local-preflight", "checkpoint.json");
  if (!existsSync(commonPath)) return { customerKey, reconstructed: false, reason: "common_checkpoint_missing" };
  const beforeCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const beforeItem = beforeCp.items.find((item) => item.customerKey === customerKey);
  const stateBefore = beforeItem?.state ?? null;
  const blockersBefore = (beforeItem?.report?.blockers ?? []).map((b) => b.code);

  const documentAnalysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
  const common = new PersistentAprCrmLocalPreflight(stateDirectory, documentAnalysis);
  common.applyValidationRevision(VALIDATION_REVISION, new Date());

  const infissiPath = path.join(stateDirectory, "infissi-batch-preflight", "checkpoint.json");
  if (existsSync(infissiPath)) {
    const infissi = new PersistentAprInfissiBatchPreflight(stateDirectory);
    let infissiState = infissi.initialize(new Date());
    let guard = 0;
    while (infissiState.status !== "completed" && guard < 50) { infissiState = infissi.tick(new Date()); guard += 1; }
    infissiState = infissi.applyValidationRevision(VALIDATION_REVISION, new Date());
    guard = 0;
    while (infissiState.status !== "completed" && guard < 200) { infissiState = infissi.tick(new Date()); guard += 1; }
    if (infissiState.status === "completed") common.reconcileAuthoritativeInfissiApplicability(infissiState, `${VALIDATION_REVISION}-reconcile`, new Date());
  }

  const afterCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const afterItem = afterCp.items.find((item) => item.customerKey === customerKey);
  return {
    customerKey, reconstructed: true,
    genuinelyReconstructed: (afterCp.validationRevisionsApplied ?? []).includes(VALIDATION_REVISION),
    stateBefore, stateAfter: afterItem?.state ?? null,
    flipped: stateBefore !== (afterItem?.state ?? null),
    blockersBefore, blockersAfter: (afterItem?.report?.blockers ?? []).map((b) => b.code),
  };
}

const manifestPath = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide100-province-lineage-2026-09-02/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);
const cohortOffset = 2920;

const wide100Results = manifest.cases.map((c) => reconstruct(`apr-pilot-${cohortOffset + c.cohort}-global-controller-${c.customerKey}`, c.customerKey));

import { readdirSync } from "node:fs";
const overnightDirs = readdirSync(cohortRoot).filter((d) => /^apr-pilot-35(0[0-9]|1[0-9]|2[0-9]|30|31)-global-controller-/.test(d));
const overnightResults = overnightDirs.map((dirName) => reconstruct(dirName, dirName.replace(/^apr-pilot-\d+-global-controller-/, "")));

function summarize(label, results) {
  const reconstructed = results.filter((r) => r.reconstructed);
  const notGenuine = reconstructed.filter((r) => !r.genuinelyReconstructed);
  const readyNow = reconstructed.filter((r) => r.stateAfter === "ready_local_plan");
  const flippedToReady = reconstructed.filter((r) => r.flipped && r.stateAfter === "ready_local_plan");
  const flippedToBlocked = reconstructed.filter((r) => r.flipped && r.stateAfter === "blocked_case");
  return {
    label, totalCases: results.length, reconstructedCount: reconstructed.length, notGenuinelyReconstructedCount: notGenuine.length,
    readyNowCount: readyNow.length, flippedToReadyCount: flippedToReady.length, flippedToBlockedCount: flippedToBlocked.length,
    flippedToReady: flippedToReady.map((r) => r.customerKey),
    flippedToBlocked: flippedToBlocked.map((r) => ({ customerKey: r.customerKey, blockersBefore: r.blockersBefore, blockersAfter: r.blockersAfter })),
  };
}

const wide100Summary = summarize("wide100", wide100Results);
const overnightSummary = summarize("overnight-batch-32", overnightResults);

writeFileSync(path.join(import.meta.dirname, "apr-full-reconstruction-r92-2026-09-08-wide100-results.json"), JSON.stringify(wide100Results, null, 2));
writeFileSync(path.join(import.meta.dirname, "apr-full-reconstruction-r92-2026-09-08-overnight-results.json"), JSON.stringify(overnightResults, null, 2));

console.log(JSON.stringify({ installedVersionId, wide100: wide100Summary, overnightBatch32: overnightSummary }, null, 2));
