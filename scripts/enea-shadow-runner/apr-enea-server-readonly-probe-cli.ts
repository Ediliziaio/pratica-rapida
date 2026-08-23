import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprCrmLiveProcessing } from "./crmLiveProcessing";
import { validateAprEneaServerReadOnlyProbe } from "./aprEneaServerReadOnlyProbe";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? null : null; }
const stateDirectory = option("--state-dir");
if (!stateDirectory || !process.argv.includes("--record-live-worker-proof")) throw new Error("Uso: --state-dir <percorso> --record-live-worker-proof");
const root = path.resolve(stateDirectory); const workerRoot = path.join(root, "enea-browser-worker"); const now = new Date();
const service = JSON.parse(readFileSync(path.join(workerRoot, "service.json"), "utf8"));
const config = JSON.parse(readFileSync(path.join(workerRoot, "config.json"), "utf8"));
const driver = JSON.parse(readFileSync(path.join(workerRoot, "cdp-driver.json"), "utf8"));
const proof = validateAprEneaServerReadOnlyProbe({ service, config, driver }, now);
const auth = new PersistentAprCrmAuth(root); const workflow = new PersistentAprCrmIntegrationWorkflow(root);
const incoming = new PersistentAprCrmIncomingReadOnly(root, auth, workflow); const runtime = new PersistentAprCrmLiveProcessing(root, incoming, auth);
const attach = runtime.eneaRealReadOnlyAttach.snapshot(now);
if (attach.status !== "completed_readonly_attach" || !attach.evidenceFingerprint) throw new Error("apr_enea_server_probe_attach_not_completed");
runtime.gateOrchestrator.recordReadOnlyAttachCompleted(attach.evidenceFingerprint, now);
const state = runtime.gateOrchestrator.recordServerReadOnlyProbeCompleted(proof.evidenceFingerprint, now);
process.stdout.write(`${JSON.stringify({ status: state.status, revision: state.revision, evidenceFingerprint: proof.evidenceFingerprint, reason: state.reason, nextAction: state.nextAction })}\n`);
