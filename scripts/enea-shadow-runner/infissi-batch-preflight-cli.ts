#!/usr/bin/env node
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stateDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const validationRevision = option("--validation-revision");
const parserRevision = option("--parser-revision");
const commonValidationRevision = option("--common-validation-revision");
const analysis = new PersistentAprCrmDocumentAnalysis(stateDirectory);
const commonPreflight = new PersistentAprCrmLocalPreflight(stateDirectory, analysis);
const batch = new PersistentAprInfissiBatchPreflight(stateDirectory);
const startedAt = new Date();

if (parserRevision) analysis.applyParserRevision(parserRevision, startedAt);
if (commonValidationRevision) commonPreflight.applyValidationRevision(commonValidationRevision, startedAt);
batch.initialize(startedAt);
if (validationRevision) batch.applyValidationRevision(validationRevision, startedAt);

let state = batch.load(startedAt);
for (let iteration = 0; iteration < 100 && state.status !== "completed"; iteration += 1) {
  state = batch.tick(new Date(startedAt.getTime() + (iteration + 1) * 1_000));
}

if (state.status !== "completed") throw new Error("infissi_batch_preflight_did_not_complete");
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
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
