import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCohortSeed, type AprCohortSeedManifest } from "../../scripts/enea-shadow-runner/aprCohortSeed";
import { PersistentAprCrmAuthenticatedReadOnly, aprDocumentProcessingDossiers } from "../../scripts/enea-shadow-runner/crmAuthenticatedReadOnly";
import { PersistentAprCrmOriginalDocuments } from "../../scripts/enea-shadow-runner/crmOriginalDocuments";
import { APR_CRM_OMBRA_ORIGIN, PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";
import { PersistentAprEneaWorkerService } from "../../scripts/enea-shadow-runner/aprEneaBrowserWorkerService";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`missing_option:${name}`);
  return value;
}

const runtimeRoot = path.resolve(required("--runtime-root"));
const stateDirectory = path.resolve(required("--state-dir"));
const historyRoot = path.resolve(required("--history-root"));
const sourceRoot = path.resolve(required("--source-root"));
const practiceId = required("--practice-id");
const customerKey = required("--customer-key");
const displayName = required("--display-name");
const authorizationId = required("--authorization-id");
const experimentId = required("--experiment-id");
const productModule = required("--product-module") as "screening" | "infissi";

const candidate = {
  customerKey,
  displayName,
  practiceId,
  expectedStageType: "pronte_da_fare" as const,
  productModule,
};
const manifest: AprCohortSeedManifest = {
  version: "apr-cohort-seed-v1",
  sourceEvidenceId: authorizationId,
  candidates: [candidate],
  authorizedSingleCase: { authorizationId },
  draftGenerationPolicy: { mode: "fresh_generation", experimentId },
  historicalRetest: { authorizationId, preservePriorDrafts: true },
};

const shadowAuth = new PersistentAprCrmOmbraAuth(runtimeRoot);
// This exact read both proves the authenticated shadow session and prevents a
// later snapshot from mistaking a refreshable Keychain session for logged out.
const proofResponse = await shadowAuth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,current_stage_id,pipeline_stages!inner(stage_type)",
  id: `eq.${practiceId}`,
  brand: "eq.enea",
  limit: "2",
}));
if (!proofResponse.ok) throw new Error(`shadow_practice_proof_failed:${proofResponse.status}`);
const proofRows = await proofResponse.json() as Array<{ id?: unknown; cliente_nome?: unknown; cliente_cognome?: unknown; pipeline_stages?: { stage_type?: unknown } }>;
if (proofRows.length !== 1 || proofRows[0].id !== practiceId
  || `${proofRows[0].cliente_nome ?? ""} ${proofRows[0].cliente_cognome ?? ""}`.trim() !== displayName
  || proofRows[0].pipeline_stages?.stage_type !== "pronte_da_fare") {
  throw new Error("shadow_practice_identity_or_stage_mismatch");
}

const seed = new PersistentAprCohortSeed(stateDirectory).seed(manifest, historyRoot);
const transport = {
  sourceOrigin: APR_CRM_OMBRA_ORIGIN,
  snapshot: () => ({ status: shadowAuth.snapshot().authenticated ? "authenticated" : "login_required" }),
  readOnlyGet: shadowAuth.readOnlyGet.bind(shadowAuth),
  readOnlyStorageGet: shadowAuth.readOnlyStorageGet.bind(shadowAuth),
};

const acquisition = new PersistentAprCrmAuthenticatedReadOnly(stateDirectory, transport);
let acquisitionState = acquisition.snapshot();
for (let attempt = 0; attempt < 5 && acquisitionState.status !== "completed"; attempt += 1) {
  await acquisition.tick();
  acquisitionState = acquisition.snapshot();
}
if (acquisitionState.status !== "completed" || acquisitionState.progress.acquired !== 1) {
  throw new Error(`shadow_acquisition_not_completed:${acquisitionState.status}:${acquisitionState.reason}`);
}
const dossierPath = acquisitionState.items[0].dossierPath;
if (!dossierPath) throw new Error("shadow_dossier_missing");
const dossier = JSON.parse(readFileSync(dossierPath, "utf8")) as { source?: { origin?: unknown }; row?: { id?: unknown } };
if (dossier.source?.origin !== APR_CRM_OMBRA_ORIGIN || dossier.row?.id !== practiceId) {
  throw new Error("shadow_dossier_provenance_invalid");
}

const documents = new PersistentAprCrmOriginalDocuments(stateDirectory, transport);
if (documents.snapshot().status === "unprepared") documents.prepare(aprDocumentProcessingDossiers(acquisitionState.items));
let documentState = documents.snapshot();
for (let attempt = 0; attempt < 20 && documentState.status !== "completed"; attempt += 1) {
  await documents.tick();
  documentState = documents.snapshot();
}
if (documentState.status !== "completed") throw new Error(`shadow_documents_not_completed:${documentState.status}:${documentState.reason}`);

const sourceWorker = new PersistentAprEneaWorkerService(sourceRoot).loadConfig();
const worker = new PersistentAprEneaWorkerService(stateDirectory).configure({
  setupEnabled: true,
  operationalEnabled: false,
  chromeExecutable: sourceWorker.chromeExecutable,
  profileDirectory: sourceWorker.profileDirectory,
  remoteDebuggingPort: sourceWorker.remoteDebuggingPort,
  authorizationId,
});

process.stdout.write(`${JSON.stringify({
  status: "prepared_from_shadow",
  sourceOrigin: dossier.source.origin,
  practiceId,
  customerKey,
  candidateFingerprint: seed.candidateFingerprint,
  dossierSha256: createHash("sha256").update(readFileSync(dossierPath)).digest("hex"),
  acquisition: acquisitionState.progress,
  documents: documentState.progress,
  worker: {
    operationalEnabled: worker.operationalEnabled,
    profileDirectory: worker.profileDirectory,
    remoteDebuggingPort: worker.remoteDebuggingPort,
  },
}, null, 2)}\n`);
