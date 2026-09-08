import { readFileSync } from "node:fs";

import { extractBankTransferEvidences } from "../../scripts/enea-shadow-runner/bankTransferEvidence";
import { splitLocalInvoiceText } from "../../scripts/enea-shadow-runner/localInvoiceSegmentation";

for (const filePath of process.argv.slice(2)) {
  const text = readFileSync(filePath, "utf8");
  const whole = extractBankTransferEvidences(`whole:${filePath}`, text);
  const segments = splitLocalInvoiceText({ documentKey: filePath, text, extractionMode: "macos_vision_ocr" });
  process.stdout.write(`${JSON.stringify({
    filePath,
    whole,
    segments: segments.map((segment) => ({
      documentNumber: segment.documentNumber,
      evidences: extractBankTransferEvidences(segment.sourceId, segment.text),
    })),
  }, null, 2)}\n`);
}
