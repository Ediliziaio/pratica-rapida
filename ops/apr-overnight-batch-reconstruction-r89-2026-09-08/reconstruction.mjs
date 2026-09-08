import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis.ts";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight.ts";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight.ts";

// Verifica richiesta esplicitamente da Giuliano (2026-09-08): il "lotto di
// stanotte" (32 pratiche, cohort 3500-3531) non ha mai un manifest.json come
// il campione wide100. Nessuno di questi 32 checkpoint e' mai passato prima
// da una ricostruzione completa e mai selettiva come questa: non esiste un
// "prima" pulito con cui confrontare qui dentro. Questo script produce
// percio' lo stato CORRENTE, genuinamente ricostruito da zero su OGNI
// pratica del lotto (non solo le 6 corrette stanotte), con la stessa prova
// di ricostruzione genuina usata su wide100 (revisione applicata verificata
// per ognuna). Confronto testuale con lo stato pre-correzione (osservato a
// mano stanotte per le 6 pratiche toccate) viene fatto a parte.

const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");

if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_overnight_batch_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "../apr-install-overnight-batch-parser-fixes-r89-2026-09-08-2026-09-08/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_overnight_batch_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);
for (const name of Object.keys(installReceipt.installedBundle)) {
  const activePath = path.join(currentPointer, name);
  if (sha256File(activePath) !== installReceipt.installedBundle[name]) throw new Error(`apr_overnight_batch_active_hash_mismatch:${name}`);
}

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const dirs = readdirSync(cohortRoot).filter((d) => /^apr-pilot-35(0[0-9]|1[0-9]|2[0-9]|30|31)-global-controller-/.test(d));
const VALIDATION_REVISION = "apr-overnight-batch-full-reconstruction-r89-2026-09-08";
const now = new Date();
const results = [];

for (const dirName of dirs) {
  const customerKey = dirName.replace(/^apr-pilot-\d+-global-controller-/, "");
  const stateDirectory = path.join(cohortRoot, dirName);
  const commonPath = path.join(stateDirectory, "crm-local-preflight", "checkpoint.json");
  if (!existsSync(commonPath)) { results.push({ customerKey, reconstructed: false, reason: "common_checkpoint_missing" }); continue; }
  const beforeCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const beforeItem = beforeCp.items.find((item) => item.customerKey === customerKey);
  const stateBefore = beforeItem?.state ?? null;
  const blockersBefore = (beforeItem?.report?.blockers ?? []).map((b) => b.code);

  const documentAnalysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
  const common = new PersistentAprCrmLocalPreflight(stateDirectory, documentAnalysis);
  common.applyValidationRevision(VALIDATION_REVISION, now);

  const infissiPath = path.join(stateDirectory, "infissi-batch-preflight", "checkpoint.json");
  if (existsSync(infissiPath)) {
    const infissi = new PersistentAprInfissiBatchPreflight(stateDirectory);
    let infissiState = infissi.initialize(now);
    let guard = 0;
    while (infissiState.status !== "completed" && guard < 50) { infissiState = infissi.tick(now); guard += 1; }
    infissiState = infissi.applyValidationRevision(VALIDATION_REVISION, now);
    guard = 0;
    while (infissiState.status !== "completed" && guard < 200) { infissiState = infissi.tick(now); guard += 1; }
    if (infissiState.status === "completed") common.reconcileAuthoritativeInfissiApplicability(infissiState, `${VALIDATION_REVISION}-reconcile`, now);
  }

  const afterCp = JSON.parse(readFileSync(commonPath, "utf8"));
  const afterItem = afterCp.items.find((item) => item.customerKey === customerKey);
  results.push({
    customerKey,
    reconstructed: true,
    genuinelyReconstructed: (afterCp.validationRevisionsApplied ?? []).includes(VALIDATION_REVISION),
    stateBefore,
    stateAfter: afterItem?.state ?? null,
    flipped: stateBefore !== (afterItem?.state ?? null),
    blockersBefore,
    blockersAfter: (afterItem?.report?.blockers ?? []).map((b) => b.code),
  });
}

const reconstructed = results.filter((r) => r.reconstructed);
const notGenuine = reconstructed.filter((r) => !r.genuinelyReconstructed);
const readyNow = reconstructed.filter((r) => r.stateAfter === "ready_local_plan");
const flippedToBlocked = reconstructed.filter((r) => r.flipped && r.stateAfter === "blocked_case");
const flippedToReady = reconstructed.filter((r) => r.flipped && r.stateAfter === "ready_local_plan");

console.log(JSON.stringify({
  totalCases: results.length,
  reconstructedCount: reconstructed.length,
  notGenuinelyReconstructedCount: notGenuine.length,
  readyNowCount: readyNow.length,
  flippedToReadyCount: flippedToReady.length,
  flippedToBlockedCount: flippedToBlocked.length,
  flippedToReady: flippedToReady.map((r) => r.customerKey),
  flippedToBlocked: flippedToBlocked.map((r) => ({ customerKey: r.customerKey, blockersBefore: r.blockersBefore, blockersAfter: r.blockersAfter })),
}, null, 2));

writeFileSync(path.join(import.meta.dirname, "results.json"), JSON.stringify(results, null, 2));
