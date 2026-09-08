import { readFileSync } from "node:fs";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";
import { extractBankTransferEvidences } from "../../scripts/enea-shadow-runner/bankTransferEvidence";

for (const filePath of process.argv.slice(2)) {
  const segments = splitLocalInvoiceText({ documentKey: "inspect", text: readFileSync(filePath, "utf8"), extractionMode: "macos_vision_ocr" });
  const fiscalSegments = segments.filter((segment) => !extractBankTransferEvidences(segment.sourceId, segment.text).length
    || /\b(?:iva|imponibile|tipo\s+documento|num\.\s*doc\.?|dati\s+generali\s+documento|riepiloghi\s+iva)\b/i.test(segment.text));
  const reconciled = reconcileLocalInvoiceSegments(fiscalSegments);
  process.stdout.write(`${JSON.stringify({ filePath, observed: reconciled.observedFinancialSegments.map((segment) => segment.documentNumber), segments: segments.map((segment) => ({
    index: segment.index, number: segment.documentNumber, date: segment.documentDate, total: segment.total, documentType: segment.result.documentType,
    bankEvidenceCount: extractBankTransferEvidences(segment.sourceId, segment.text).length,
    fiscalMarker: /\b(?:iva|imponibile|tipo\s+documento|num\.\s*doc\.?|dati\s+generali\s+documento|riepiloghi\s+iva)\b/i.test(segment.text),
    prefix: segment.text.slice(0, 120),
  })) }, null, 2)}\n`);
}
