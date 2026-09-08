import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = import.meta.dirname;
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const batchPath = path.join(root, "dates-batch-01/blind-documents/batch-manifest.json");
const outputPath = path.join(root, "dates-batch-01/persisted-ocr-date-candidates.json");
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const cohortNames = readdirSync(cohortRoot);
const datePattern = /(?:\b\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b|\b(?:20\d{2})[./-]\d{1,2}[./-]\d{1,2}\b)/g;

const cases = batch.cases.map((entry: any) => {
  const prefix = `apr-pilot-${entry.cohort}-global-controller-`;
  const matches = cohortNames.filter((name) => name.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`cohort_state_count:${entry.displayName}:${matches.length}`);
  const stateDirectory = path.join(cohortRoot, matches[0]);
  const checkpointPath = path.join(stateDirectory, "crm-document-analysis/checkpoint.json");
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  const documents = checkpoint.items.map((item: any) => {
    const text = readFileSync(item.textPath, "utf8");
    const lines = text.split(/\r?\n/);
    const candidates = lines.flatMap((line: string, index: number) => {
      const dates = [...line.matchAll(datePattern)].map((match) => match[0]);
      if (!dates.length) return [];
      return [{
        lineNumber: index + 1,
        dates,
        context: lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)),
      }];
    });
    return {
      documentKey: item.documentKey,
      kind: item.kind,
      semanticKind: item.semanticKind,
      sourceSha256: item.sourceSha256,
      pageCount: item.pageCount,
      extractionMode: item.extractionMode,
      textSha256: item.textSha256,
      candidates,
    };
  });
  return { caseId: entry.caseId, displayName: entry.displayName, cohort: entry.cohort, stateDirectory, documents };
});

const artifact = {
  schemaVersion: "apr-persisted-ocr-date-candidates-v1",
  generatedAt: new Date().toISOString(),
  source: "APR persisted OCR only; no portal access and no verdict assignment",
  cases,
};
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
const hash = createHash("sha256").update(readFileSync(outputPath)).digest("hex");
process.stdout.write(`${JSON.stringify({ outputPath, sha256: hash, cases: cases.length, candidates: cases.reduce((sum: number, entry: any) => sum + entry.documents.reduce((inner: number, document: any) => inner + document.candidates.length, 0), 0) }, null, 2)}\n`);
