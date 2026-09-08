import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { extractAprInfissiAutomaticTechnicalEvidence, observeAprInfissiTechnicalCandidates } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";

const checkpointPath = "ops/apr-reliability-gap-audit-2026-09-03/fresh-original-state-v2/085/gemma-minore/crm-document-analysis/checkpoint.json";
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
const sourceItem = checkpoint.items.find((item: any) => item.documentKey === "a75be295c3555dc16c2de327e6e4d129abceacdf20a56e4909b3d9273d63f880");
if (!sourceItem) throw new Error("gemma_original_declaration_missing");
const text = readFileSync(sourceItem.textPath, "utf8");
const source = [{ sourceId: sourceItem.documentKey, kind: sourceItem.semanticKind, certificateScope: sourceItem.documentClassification?.certificateScope ?? null, text }];
const artifact = {
  originalDocument: {
    path: sourceItem.localPdfPath,
    sha256: createHash("sha256").update(readFileSync(sourceItem.localPdfPath)).digest("hex"),
    pageCount: sourceItem.pageCount,
  },
  visibleOriginalFields: { model: "HOME-B2AS", widthMm: 1090, heightMm: 2075, quantity: 1, uw: 1.29 },
  sourceTextExcerpt: text.split("\n").slice(0, 18),
  observation: observeAprInfissiTechnicalCandidates(source),
  resolution: extractAprInfissiAutomaticTechnicalEvidence(source),
};
const target = process.env.APR_SINGLE_DECLARATION_DIAGNOSTIC ?? "ops/apr-reliability-gap-audit-2026-09-03/single-product-declaration-before-r37.json";
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, candidates: artifact.observation.candidates.length, status: artifact.resolution.status, rows: artifact.resolution.evidence?.rows.length ?? 0 }, null, 2)}\n`);
