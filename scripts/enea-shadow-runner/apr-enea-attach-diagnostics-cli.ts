import path from "node:path";
import { readFileSync } from "node:fs";
import { validateAprEneaAttachLiveEvidence } from "./aprEneaAttachLiveEvidence";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprCrmLiveProcessing } from "./crmLiveProcessing";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? null : null; }
const stateDirectory = option("--state-dir");
if (!stateDirectory) throw new Error("Uso: --state-dir <percorso> --record-controller-transport-block|--record-connected-tabs-missing|--record-transport-unstable-after-attach|--record-completed-readonly-attach --evidence-file <percorso>");
const transportBlocked = process.argv.includes("--record-controller-transport-block");
const tabsMissing = process.argv.includes("--record-connected-tabs-missing");
const transportUnstable = process.argv.includes("--record-transport-unstable-after-attach");
const attachCompleted = process.argv.includes("--record-completed-readonly-attach");
if ([transportBlocked, tabsMissing, transportUnstable, attachCompleted].filter(Boolean).length !== 1) throw new Error("diagnostic_action_not_allowed");
const evidenceFile = option("--evidence-file");
const liveEvidence = attachCompleted
  ? validateAprEneaAttachLiveEvidence(JSON.parse(readFileSync(path.resolve(evidenceFile ?? ""), "utf8")), new Date())
  : null;

const root = path.resolve(stateDirectory);
const auth = new PersistentAprCrmAuth(root);
const workflow = new PersistentAprCrmIntegrationWorkflow(root);
const incoming = new PersistentAprCrmIncomingReadOnly(root, auth, workflow);
const runtime = new PersistentAprCrmLiveProcessing(root, incoming, auth);
const now = new Date();
const state = runtime.eneaRealReadOnlyAttach.recordDiagnostics({
  observedAt: liveEvidence?.observedAt ?? now.toISOString(), browserFamily: "chrome", selectedProfile: "Default", chromeRunning: true,
  extensionInstalled: true, extensionEnabled: true, nativeHostCorrect: true, controllerConnected: tabsMissing || attachCompleted, retryCount: 1,
  newWindowCreated: tabsMissing || transportUnstable, newTabCreated: false, navigationPerformed: false, networkRequestPerformed: false,
  crmTabFound: attachCompleted ? true : tabsMissing ? false : null,
  eneaTabFound: attachCompleted ? true : tabsMissing ? false : null,
  crmDomVerified: attachCompleted ? true : tabsMissing ? false : null,
  eneaDomVerified: attachCompleted ? true : tabsMissing ? false : null,
  errorCode: attachCompleted ? null : tabsMissing ? "required_tabs_not_visible" : transportUnstable ? "chrome_extension_transport_unstable_after_attach" : "chrome_extension_transport_unavailable",
}, now);
process.stdout.write(`${JSON.stringify({ status: state.status, phase: state.phase, revision: state.revision, evidenceFingerprint: state.evidenceFingerprint, reason: state.reason, nextAction: state.nextAction })}\n`);
