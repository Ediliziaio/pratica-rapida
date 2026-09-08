#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractAprInfissiAutomaticTechnicalEvidence } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stateDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const textRoot = path.join(stateDirectory, "crm-document-analysis", "text");
const analysis = JSON.parse(readFileSync(path.join(stateDirectory, "crm-document-analysis", "checkpoint.json"), "utf8")) as { items?: Array<{ documentKey: string; kind: string }> };
const kindByDocumentKey = new Map((analysis.items ?? []).map((item) => [item.documentKey, item.kind]));
const results = readdirSync(textRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = path.join(textRoot, entry.name);
    const sources = readdirSync(directory)
      .filter((name) => name.endsWith(".txt"))
      .map((name) => {
        const sourceId = name.replace(/\.txt$/u, "");
        return { sourceId, kind: kindByDocumentKey.get(sourceId), practiceCustomerName: entry.name.replace(/-/gu, " "), text: readFileSync(path.join(directory, name), "utf8") };
      });
    const result = extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true });
    return {
      customerKey: entry.name,
      status: result.status,
      selectedSourceId: result.audit.selectedSourceId,
      selectedParser: result.audit.selectedParser,
      physicalProductCount: result.evidence?.rows.reduce((sum, row) => sum + row.quantity, 0) ?? 0,
      blockers: result.blockers,
      candidates: result.audit.candidateCounts,
    };
  });

process.stdout.write(`${JSON.stringify({ stateDirectory, results }, null, 2)}\n`);
