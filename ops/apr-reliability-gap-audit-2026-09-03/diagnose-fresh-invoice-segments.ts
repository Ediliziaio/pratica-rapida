import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";

const auditRoot = import.meta.dirname;
const cases = [
  { cohort: "032", customerKey: "monica-molteni" },
  { cohort: "035", customerKey: "claudia-campagna" },
] as const;

const evidence = [];
for (const item of cases) {
  const analysisRoot = path.join(auditRoot, "fresh-original-state-v2", item.cohort, item.customerKey, "crm-document-analysis");
  const checkpoint = JSON.parse(readFileSync(path.join(analysisRoot, "checkpoint.json"), "utf8")) as {
    items: Array<{ documentKey: string; kind: string; extractionMode: "native_text" | "macos_vision_ocr"; textPath?: string }>;
  };
  const segments = checkpoint.items
    .filter((document) => document.kind === "invoice" && document.textPath)
    .flatMap((document) => splitLocalInvoiceText({
      documentKey: document.documentKey,
      text: readFileSync(document.textPath!, "utf8"),
      extractionMode: document.extractionMode,
    }));
  const reconciled = reconcileLocalInvoiceSegments(segments);
  evidence.push({
    customerKey: item.customerKey,
    segments: segments.map((segment) => ({
      sourceId: segment.sourceId,
      parentDocumentKey: segment.parentDocumentKey,
      extractionMode: segment.extractionMode,
      documentNumber: segment.documentNumber,
      documentDate: segment.documentDate,
      total: segment.total,
      itemCount: segment.items.length,
      technicalSignature: segment.technicalSignature,
      items: segment.items.map((product) => ({ description: product.description, widthMm: product.widthMm, heightMm: product.heightMm, gTot: product.gTot })),
      referencedInvoiceNumbers: segment.referencedInvoiceNumbers,
    })),
    discardedDuplicateSourceIds: reconciled.discardedDuplicateSourceIds,
    uniqueFinancialSegments: reconciled.uniqueFinancialSegments.map((segment) => ({
      sourceId: segment.sourceId,
      extractionMode: segment.extractionMode,
      documentNumber: segment.documentNumber,
      documentDate: segment.documentDate,
      total: segment.total,
    })),
  });
}

const artifact = {
  schemaVersion: "apr-r35-fiscal-copy-diagnostic-v1",
  generatedAt: new Date().toISOString(),
  safety: { localOnly: true, eneaAccessed: false, crmMutated: false },
  cases: evidence,
};
const target = path.join(auditRoot, "fiscal-copy-diagnostic-r35.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, cases: evidence.length }, null, 2)}\n`);
