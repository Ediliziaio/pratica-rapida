import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractAprInfissiAutomaticTechnicalEvidence } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";
import { classifyAprInfissiTechnicalDocument } from "../../src/features/enea-shadow-crm/infissiTechnicalDocumentClassifier";

type AnalysisItem = {
  documentKey: string;
  customerKey: string;
  kind: "invoice" | "additional";
  state: string;
  textPath?: string | null;
};

type AnalysisCheckpoint = { items: AnalysisItem[] };

const cases = [
  {
    customerKey: "eugenio-codognato",
    root: "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5305-global-controller-eugenio-codognato",
    expectedParser: "numbered-dop-thermal-column",
    expectedUw: [1.28, 1.22, 1.27, 1.2, 1.28, 1.28, 1.23, 1.27],
  },
  {
    customerKey: "vera-buracchi",
    root: "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5221-global-controller-vera-buracchi",
    expectedParser: "abbreviated-thermal-product-label",
    expectedUw: [1.2, 1.17, 1.18, 1.17],
  },
] as const;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const results = cases.map((fixture) => {
  const checkpointPath = path.join(fixture.root, "crm-document-analysis/checkpoint.json");
  const checkpointText = readFileSync(checkpointPath, "utf8");
  const checkpoint = JSON.parse(checkpointText) as AnalysisCheckpoint;
  const documents = checkpoint.items
    .filter((item) => item.customerKey === fixture.customerKey && item.state === "analyzed" && item.textPath && existsSync(item.textPath))
    .map((item) => {
      const text = readFileSync(item.textPath!, "utf8");
      const classification = classifyAprInfissiTechnicalDocument({ storageKind: item.kind, text });
      return {
        sourceId: item.documentKey,
        text,
        textPath: item.textPath!,
        textSha256: sha256(text),
        classification,
      };
    });
  const extracted = extractAprInfissiAutomaticTechnicalEvidence(documents.map((document) => ({
    sourceId: document.sourceId,
    text: document.text,
    kind: document.classification.verifiedKind,
    certificateScope: document.classification.certificateScope,
  })), { requirePracticeBinding: true });
  const actualUw = extracted.evidence?.rows.flatMap((row) => Array.from({ length: row.quantity }, () => row.thermalTransmittanceWm2K)) ?? [];
  const passed = extracted.status === "ready"
    && extracted.audit.selectedParser === fixture.expectedParser
    && JSON.stringify(actualUw) === JSON.stringify(fixture.expectedUw);
  return {
    customerKey: fixture.customerKey,
    checkpointPath,
    checkpointSha256: sha256(checkpointText),
    documents: documents.map(({ text: _text, ...document }) => document),
    expected: { parser: fixture.expectedParser, thermalTransmittanceWm2K: fixture.expectedUw },
    actual: {
      status: extracted.status,
      blockers: extracted.blockers,
      selectedSourceId: extracted.audit.selectedSourceId,
      selectedParser: extracted.audit.selectedParser,
      selectedSourceBinding: extracted.audit.selectedSourceBinding,
      candidateCounts: extracted.audit.candidateCounts,
      rows: extracted.evidence?.rows ?? [],
      thermalTransmittanceWm2K: actualUw,
    },
    passed,
  };
});

const payload = {
  schemaVersion: "apr-infissi-tabular-abbreviated-uw-real-document-replay-v1",
  generatedAt: new Date().toISOString(),
  mode: "local_read_only_original_document_text_reclassification_and_extraction",
  cases: results,
  summary: { total: results.length, passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length },
};
const body = `${JSON.stringify(payload, null, 2)}\n`;
const outputPath = path.join(process.cwd(), "ops/apr-saved-field-comparison-and-exclusions-2026-09-10/tabular-abbreviated-uw-real-document-replay.json");
const tempPath = `${outputPath}.tmp-${process.pid}`;
writeFileSync(tempPath, body, { encoding: "utf8", mode: 0o600 });
renameSync(tempPath, outputPath);
writeFileSync(`${outputPath}.sha256`, `${sha256(body)}  ${path.basename(outputPath)}\n`, { encoding: "utf8", mode: 0o600 });

if (payload.summary.failed > 0) {
  console.error(JSON.stringify(payload.summary));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ outputPath, ...payload.summary }));
}
