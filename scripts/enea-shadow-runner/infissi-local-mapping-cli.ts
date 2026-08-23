import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { InfissiArchivedCasePreflightInput, VerifiedInfissiTechnicalPageDimension } from "../../src/features/enea-shadow-crm/infissiOriginalDocumentParser";
import { PersistentAprInfissiLocalMappingPreflight } from "./infissiLocalMappingPreflight";

type SourceConfig = { sourceId: string; textPath: string; expectedTextSha256: string };
type Config = {
  practiceId: string;
  customerKey: string;
  displayName: string;
  invoiceDimensionSource: SourceConfig;
  invoiceFinancialSources: SourceConfig[];
  technicalDocumentSource: SourceConfig;
  verifiedTechnicalPageDimensions: VerifiedInfissiTechnicalPageDimension[];
  form: InfissiArchivedCasePreflightInput["form"];
};

function required(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_option:${name}`);
  return process.argv[index + 1];
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function readSource(source: SourceConfig) {
  const text = readFileSync(path.resolve(source.textPath), "utf8");
  if (hash(text) !== source.expectedTextSha256) throw new Error(`infissi_source_fingerprint_mismatch:${source.sourceId}`);
  return { sourceId: source.sourceId, text };
}

const config = JSON.parse(readFileSync(path.resolve(required("--config")), "utf8")) as Config;
const input: InfissiArchivedCasePreflightInput = {
  practiceId: config.practiceId,
  customerKey: config.customerKey,
  displayName: config.displayName,
  invoiceDimensionSource: readSource(config.invoiceDimensionSource),
  invoiceFinancialSources: config.invoiceFinancialSources.map(readSource),
  technicalDocumentSource: readSource(config.technicalDocumentSource),
  verifiedTechnicalPageDimensions: config.verifiedTechnicalPageDimensions,
  form: config.form,
};
const snapshot = new PersistentAprInfissiLocalMappingPreflight(path.resolve(required("--state-dir"))).run(input);
process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
