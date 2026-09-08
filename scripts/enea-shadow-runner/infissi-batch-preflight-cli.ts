#!/usr/bin/env node
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { convergeRequiredInfissiValidationRevisions } from "./infissiExecutionGate";
import { reconcileInfissiCommonApplicability } from "./infissiCommonApplicabilityBridge";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stateDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const validationRevision = option("--validation-revision");
const parserRevision = option("--parser-revision");
const commonValidationRevision = option("--common-validation-revision");
const applyRequiredRevisions = process.argv.includes("--apply-required-revisions");
const reconcileCommonApplicability = process.argv.includes("--reconcile-common-applicability");
const operatorPracticeBindingResolution = process.argv.includes("--apply-operator-practice-binding-resolution");
const analysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
const commonPreflight = new PersistentAprCrmLocalPreflight(stateDirectory, analysis);
const batch = new PersistentAprInfissiBatchPreflight(stateDirectory);
const startedAt = new Date();

if (parserRevision) analysis.applyParserRevision(parserRevision, startedAt);
if (commonValidationRevision) commonPreflight.applyValidationRevision(commonValidationRevision, startedAt);
batch.initialize(startedAt);
if (operatorPracticeBindingResolution) batch.applyOperatorPracticeBindingResolution({
  practiceId: option("--practice-id") ?? "",
  customerKey: option("--customer-key") ?? "",
  operatorId: option("--operator-id") ?? "",
  commandId: option("--command-id") ?? "",
  answeredAt: option("--answered-at") ?? startedAt.toISOString(),
  note: option("--note") ?? "",
}, startedAt);
if (validationRevision) batch.applyValidationRevision(validationRevision, startedAt);
if (applyRequiredRevisions) convergeRequiredInfissiValidationRevisions(
  () => batch.load(startedAt),
  (revision) => {
    batch.applyValidationRevision(revision, startedAt);
    let revisionState = batch.load(startedAt);
    for (let iteration = 0; iteration < 100 && revisionState.status !== "completed"; iteration += 1) {
      revisionState = batch.tick(new Date(startedAt.getTime() + (iteration + 1) * 1_000));
    }
    if (revisionState.status !== "completed") throw new Error(`infissi_required_validation_revision_did_not_complete:${revision}`);
  },
);

let state = batch.load(startedAt);
for (let iteration = 0; iteration < 100 && state.status !== "completed"; iteration += 1) {
  state = batch.tick(new Date(startedAt.getTime() + (iteration + 1) * 1_000));
}

if (state.status !== "completed") throw new Error("infissi_batch_preflight_did_not_complete");
if (reconcileCommonApplicability) reconcileInfissiCommonApplicability(commonPreflight, state, startedAt);
const output = process.argv.includes("--full") ? state : {
  version: state.version,
  revision: state.revision,
  status: state.status,
  sourceFingerprint: state.sourceFingerprint,
  progress: state.progress,
  items: state.items.map((item) => ({
    customerKey: item.customerKey,
    displayName: item.displayName,
    state: item.state,
    physicalProductCount: item.report?.physicalProductCount ?? null,
    invoiceGrossTotal: item.report?.invoiceGrossTotal ?? null,
    blockers: item.report?.blockers ?? [],
    eneaDraftPayloadReady: item.report?.eneaDraftPayload !== null && item.report?.eneaDraftPayload !== undefined,
  })),
  parserRevision,
  commonValidationRevision,
  validationRevision,
  applyRequiredRevisions,
  reconcileCommonApplicability,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
