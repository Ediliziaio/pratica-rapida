import { readFile } from "node:fs/promises";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";

const textPath = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-2969-global-controller-riccardo-coda/crm-document-analysis/text/riccardo-coda/6c1f76247f7f75167d03bba588551f75d8891f18e47873e15c03e8f679aadedf.txt";
const text = await readFile(textPath, "utf8");
const segments = splitLocalInvoiceText({
  documentKey: "riccardo-current-source",
  text,
  extractionMode: "macos_vision_ocr",
});
const reconciled = reconcileLocalInvoiceSegments(segments);
process.stdout.write(`${JSON.stringify({
  segments: segments.map((segment) => ({
    sourceId: segment.sourceId,
    documentNumber: segment.documentNumber,
    documentDate: segment.documentDate,
    total: segment.total,
    items: segment.items,
    technicalSignature: segment.technicalSignature,
  })),
  technicalSegments: reconciled.technicalSegments.map((segment) => segment.sourceId),
  supersededTechnicalSourceIds: reconciled.supersededTechnicalSourceIds,
  percentageCausalSupersededTechnicalSourceIds: reconciled.percentageCausalSupersededTechnicalSourceIds,
}, null, 2)}\n`);
