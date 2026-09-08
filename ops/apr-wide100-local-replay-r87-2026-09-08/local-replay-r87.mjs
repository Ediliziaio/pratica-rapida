import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envelopeImmutableArtifact, verifyImmutableArtifactEnvelope } from "../../scripts/enea-shadow-runner/aprMonotonicArtifacts.ts";

// Replay locale wide100 POST-ricostruzione completa (r87): legge lo STATO
// REALE gia' scritto nei checkpoint dalla ricostruzione forzata e mai
// selettiva (full-reconstruction-r87.mjs, che applica applyValidationRevision
// a TUTTE le 100 pratiche senza mai saltarne una in base al verdetto
// precedente — difetto strutturale diagnosticato e corretto l'8/9/2026). A
// differenza dei replay precedenti, questo verifica ANCHE per ogni singola
// pratica che la revisione di validazione r87 risulti davvero applicata nel
// checkpoint: non basta leggere lo stato persistito, bisogna dimostrare che
// non e' un verdetto vecchio mai ricalcolato.

const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const EXPECTED_VALIDATION_REVISION = "apr-full-reconstruction-r87-2026-09-08";

// --- 1. Confermare che il bundle installato e' davvero quello costruito da questo sorgente (r87) ---
if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_r87_replay_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "../apr-install-bank-transfer-triple-fix-r87-2026-09-08-2026-09-08/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_r87_replay_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);
for (const name of Object.keys(installReceipt.installedBundle)) {
  const activePath = path.join(currentPointer, name);
  if (sha256File(activePath) !== installReceipt.installedBundle[name]) throw new Error(`apr_r87_replay_active_hash_mismatch:${name}`);
}

// --- 2. Leggere lo stato PERSISTITO (post-ricostruzione) delle 100 pratiche del manifest originale ---
const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cohortOffset = 2920;
const replayAt = new Date();

const results = manifest.cases.map((c) => {
  const dirName = `apr-pilot-${cohortOffset + c.cohort}-global-controller-${c.customerKey}`;
  const commonPath = path.join(cohortRoot, dirName, "crm-local-preflight", "checkpoint.json");
  if (!existsSync(commonPath)) return { customerKey: c.customerKey, displayName: c.displayName, cohort: c.cohort, module: c.module, outcome: "case_not_found", blockerCodes: [], warningCodes: [], genuinelyReconstructed: false };
  const cp = JSON.parse(readFileSync(commonPath, "utf8"));
  const item = cp.items.find((entry) => entry.customerKey === c.customerKey);
  if (!item) return { customerKey: c.customerKey, displayName: c.displayName, cohort: c.cohort, module: c.module, outcome: "case_not_found", blockerCodes: [], warningCodes: [], genuinelyReconstructed: false };
  const genuinelyReconstructed = (cp.validationRevisionsApplied ?? []).includes(EXPECTED_VALIDATION_REVISION);
  return {
    customerKey: c.customerKey,
    displayName: c.displayName,
    cohort: c.cohort,
    module: c.module,
    outcome: item.state,
    blockerCodes: (item.report?.blockers ?? []).map((b) => b.code),
    blockerReasons: (item.report?.blockers ?? []).map((b) => b.reason ?? null),
    warningCodes: (item.report?.warnings ?? []).map((w) => w.code),
    checkpointRevision: cp.revision,
    genuinelyReconstructed,
  };
});

const ready = results.filter((r) => r.outcome === "ready_local_plan");
const blocked = results.filter((r) => r.outcome === "blocked_case");
const notFound = results.filter((r) => r.outcome === "case_not_found");
const errored = results.filter((r) => r.outcome !== "ready_local_plan" && r.outcome !== "blocked_case" && r.outcome !== "case_not_found");
const notGenuinelyReconstructed = results.filter((r) => !r.genuinelyReconstructed);
// Prova di ricostruzione reale, non di lettura di un vecchio checkpoint: se
// anche una sola pratica non porta la revisione r87 tra quelle applicate, il
// replay si rifiuta di firmare un numero che potrebbe essere basato su una
// cache stantia.
if (notGenuinelyReconstructed.length > 0) throw new Error(`apr_r87_replay_not_genuinely_reconstructed:${JSON.stringify(notGenuinelyReconstructed.map((r) => r.customerKey))}`);

const blockerFrequency = {};
for (const r of blocked) for (const code of r.blockerCodes) blockerFrequency[code] = (blockerFrequency[code] ?? 0) + 1;

const payload = {
  version: "apr-wide100-local-replay-r87-v1",
  replayAt: replayAt.toISOString(),
  installedVersionId,
  installReceiptVersionId: installReceipt.versionId,
  manifestPath: "ops/apr-wide100-province-lineage-2026-09-02/manifest.json",
  manifestSha256,
  source: "persisted_checkpoint_state_post_full_reconstruction_no_skip",
  expectedValidationRevision: EXPECTED_VALIDATION_REVISION,
  totalCases: manifest.cases.length,
  readyCount: ready.length,
  blockedCount: blocked.length,
  caseNotFoundCount: notFound.length,
  errorCount: errored.length,
  notGenuinelyReconstructedCount: notGenuinelyReconstructed.length,
  blockerFrequency,
  results: results.sort((a, b) => a.customerKey.localeCompare(b.customerKey)),
};

const envelope = envelopeImmutableArtifact(payload);
if (!verifyImmutableArtifactEnvelope(envelope)) throw new Error("apr_r87_replay_envelope_self_check_failed");

const outputDirectory = import.meta.dirname;
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

const reportMd = `# Replay locale wide100 — r87 (post-ricostruzione completa mai selettiva, stato persistito, hash-verificato)

- Data replay: ${payload.replayAt}
- Bundle installato: ${installedVersionId}
- Manifest: ${payload.manifestPath} (sha256 ${manifestSha256})
- Artifact ID (firma): ${envelope.artifactId}
- Fonte: stato persistito nei checkpoint dopo la ricostruzione forzata e mai selettiva di TUTTE le 100 pratiche (full-reconstruction-r87.mjs); ogni pratica verificata portare la revisione ${EXPECTED_VALIDATION_REVISION} tra quelle applicate, prova che non e' un verdetto vecchio mai ricalcolato.
- Correzione inclusa in questo giro: un segmento fattura con conferma di bonifico accodata nello stesso allegato viene escluso dal calcolo economico soltanto se la sua terna fiscale (numero, data, totale) non si risolve gia' dal testo che precede l'intestazione bancaria (regressione Ronconi, corretta alla radice l'8/9/2026).

## Risultato

- Pratiche totali: ${payload.totalCases}
- **Procedibili (ready_local_plan): ${payload.readyCount}**
- Bloccate: ${payload.blockedCount}
- Non trovate: ${payload.caseNotFoundCount}
- Errori: ${payload.errorCount}
- Non genuinamente ricostruite (deve essere 0): ${payload.notGenuinelyReconstructedCount}

## Frequenza blocker (tra le pratiche bloccate)

${Object.entries(blockerFrequency).sort((a, b) => b[1] - a[1]).map(([code, count]) => `- ${code}: ${count}`).join("\n")}

## Pratiche procedibili

${ready.map((r) => `- ${r.customerKey} (${r.displayName}, ${r.module})`).join("\n")}
`;
writeFileSync(path.join(outputDirectory, "report.md"), reportMd, "utf8");

process.stdout.write(`${JSON.stringify({ readyCount: payload.readyCount, blockedCount: payload.blockedCount, caseNotFoundCount: payload.caseNotFoundCount, errorCount: payload.errorCount, notGenuinelyReconstructedCount: payload.notGenuinelyReconstructedCount, artifactId: envelope.artifactId }, null, 2)}\n`);
