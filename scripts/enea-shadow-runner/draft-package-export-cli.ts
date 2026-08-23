#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = option(name)?.trim();
  if (!value) throw new Error(`Opzione obbligatoria mancante: ${name}`);
  return value;
}

const rootDirectory = path.resolve(required("--state-dir"));
const customerKey = required("--customer-key");
if (!/^[a-z0-9-]+$/.test(customerKey)) throw new Error("customer_key_invalid");
const packagesDirectory = path.join(rootDirectory, "enea-draft-execution", "packages");

const analysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
const preflight = new PersistentAprCrmLocalPreflight(rootDirectory, analysis);
const draftPackage = preflight.buildDraftExecutionPackage(customerKey);
const versionedPath = path.join(packagesDirectory, `${customerKey}-${draftPackage.packageFingerprint}.json`);
const outputPath = path.resolve(option("--output") ?? versionedPath);
if (outputPath !== versionedPath) throw new Error("draft_package_output_not_allowlisted");
const contents = `${JSON.stringify(draftPackage, null, 2)}\n`;
mkdirSync(packagesDirectory, { recursive: true, mode: 0o700 });
if (existsSync(outputPath)) {
  if (readFileSync(outputPath, "utf8") !== contents) throw new Error("draft_package_immutable_conflict");
} else {
  const temporary = `${outputPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, outputPath);
  const directory = openSync(packagesDirectory, "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
process.stdout.write(`${JSON.stringify({ customerKey, outputPath, packageFingerprint: draftPackage.packageFingerprint, portalFieldCount: draftPackage.payload.portalFields.length, workflowFingerprint: draftPackage.workflowFingerprint, safety: draftPackage.safety })}\n`);
