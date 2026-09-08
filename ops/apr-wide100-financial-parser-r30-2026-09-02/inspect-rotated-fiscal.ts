import { readFileSync } from "node:fs";

import { extractLocalInvoiceFinancialEvidence } from "../../scripts/enea-shadow-runner/localInvoiceFinancialEvidence";
import { splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";

const filePath = process.argv[2];
if (!filePath) throw new Error("file path required");
const segments = splitLocalInvoiceText({
  documentKey: "diagnostic",
  text: readFileSync(filePath, "utf8"),
  extractionMode: "macos_vision_ocr",
});
const result = segments.map((segment) => ({
  documentNumber: segment.documentNumber,
  grossTotal: segment.total,
  evidence: extractLocalInvoiceFinancialEvidence({
    sourceId: segment.sourceId,
    text: segment.text,
    extractionMode: segment.extractionMode,
    documentNumber: segment.documentNumber,
    documentDate: segment.documentDate,
    grossTotal: segment.total,
  }),
  fiscalWindow: segment.text.split(/\r?\n/).map((line, index) => ({ index, line: line.trim() }))
    .filter(({ index }) => index >= 176 && index <= 198),
  fiscalLines: segment.text.split(/\r?\n/).map((line, index) => ({ index, line: line.trim() }))
    .filter(({ line }) => /imponibile|spese\s+bolli|totale\s+iva|totale\s+documento|^[0-9.]+,[0-9]{2}(?:\s+[0-9]{1,2}(?:[,.]00)?)?$|^[0-9]+$/.test(line.toLowerCase())),
}));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
