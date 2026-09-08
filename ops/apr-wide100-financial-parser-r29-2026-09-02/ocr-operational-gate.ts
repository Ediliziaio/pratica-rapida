import { execFileSync } from "node:child_process";
import { splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";
import { extractLocalInvoiceFinancialEvidence } from "../../scripts/enea-shadow-runner/localInvoiceFinancialEvidence";

const executable = process.argv[2];
const documentPath = process.argv[3];
if (!executable || !documentPath) throw new Error("usage: ocr-operational-gate <executable> <document>");

const payload = execFileSync(executable, [documentPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const separator = payload.indexOf("\n");
if (!payload.startsWith("APR_META:") || separator < 0) throw new Error("ocr_metadata_missing");
const text = payload.slice(separator + 1);
const segments = splitLocalInvoiceText({ documentKey: "operational-ocr-gate", text, extractionMode: "macos_vision_ocr" });
const invoices = segments.map((segment) => ({
  segmentIndex: segment.index,
  textPrefix: segment.text.slice(0, 240),
  number: segment.documentNumber,
  date: segment.documentDate,
  total: segment.total,
  evidence: extractLocalInvoiceFinancialEvidence({
    sourceId: segment.sourceId,
    documentNumber: segment.documentNumber,
    documentDate: segment.documentDate,
    grossTotal: segment.total,
    text: segment.text,
    extractionMode: segment.extractionMode,
  }),
  fiscalCandidates: (() => {
    if (segment.total === null) return [];
    const values = [...segment.text.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)]
      .map((match) => Number(match[0].replace(/\./g, "").replace(",", ".")));
    return [...new Set(values.flatMap((left) => values.flatMap((right) => left > right
      && left >= segment.total! * 0.7 && right <= segment.total! * 0.3
      && Math.abs(left + right - segment.total!) <= 0.011 ? [`${left}+${right}`] : [])))];
  })(),
}));
process.stdout.write(`${JSON.stringify({
  orientationMarkers: [...text.matchAll(/APR_OCR_ORIENTATION:(0|90|180|270)/g)].map((match) => Number(match[1])),
  invoiceCount: invoices.length,
  invoices,
}, null, 2)}\n`);
