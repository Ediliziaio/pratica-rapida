import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { classifyAprInfissiTechnicalDocument } from "../../src/features/enea-shadow-crm/infissiTechnicalDocumentClassifier";
import { extractAprInfissiAutomaticTechnicalEvidence } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";

const checkpoint = JSON.parse(readFileSync("ops/apr-reliability-gap-audit-2026-09-03/fresh-original-state-v2/068/claudia-sellati/crm-document-analysis/checkpoint.json", "utf8"));
const documentKey = "3934f46c98eeab841c3edf1bcb65e4c742d1b355b90fa4d989e73a0349dc7c4e";
const item = checkpoint.items.find((entry: { documentKey: string }) => entry.documentKey === documentKey);
if (!item) throw new Error("claudia_sellati_dop_missing");
const text = readFileSync(item.textPath, "utf8");
const classification = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text });
const resolution = extractAprInfissiAutomaticTechnicalEvidence([{
  sourceId: documentKey,
  kind: classification.verifiedKind,
  certificateScope: classification.certificateScope,
  text,
}]);
const artifact = {
  originalDocument: { path: item.localPdfPath, sha256: createHash("sha256").update(readFileSync(item.localPdfPath)).digest("hex"), pageCount: item.pageCount },
  visibleOriginalFields: [
    { position: 1, quantity: 1, widthMm: 720, heightMm: 670, uw: 1.2 },
    { position: 2, quantity: 1, widthMm: 1080, heightMm: 1435, uw: 1.3 },
    { position: 3, quantity: 1, widthMm: 600, heightMm: 915, uw: 1.2 },
    { position: 4, quantity: 1, widthMm: 570, heightMm: 915, uw: 1.2 },
    { position: 5, quantity: 1, widthMm: 1480, heightMm: 915, uw: 1.3 },
    { position: 6, quantity: 1, widthMm: 1480, heightMm: 915, uw: 1.3 },
  ],
  classification,
  resolution,
};
const target = process.env.APR_PARENTHESIZED_UW_DIAGNOSTIC ?? "ops/apr-reliability-gap-audit-2026-09-03/parenthesized-uw-before-r38.json";
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, classification: classification.verifiedKind, missingCriteria: classification.missingCriteria, status: resolution.status, rows: resolution.evidence?.rows.length ?? 0 }, null, 2)}\n`);
