import { readFileSync, writeFileSync } from "node:fs";
import { extractAprInfissiAutomaticTechnicalEvidence, observeAprInfissiTechnicalCandidates } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";

const text = readFileSync("ops/apr-reliability-gap-audit-2026-09-03/fresh-original-state-v2/050/massimo-cappello/crm-document-analysis/text/massimo-cappello/13da996b375059d53acb67c37c67cb4ebe482ddfdade5cf24543f293aea93de4.txt", "utf8");
const source = [{ sourceId: "massimo-original-producer-declaration", kind: "invoice", text }];
const artifact = { observation: observeAprInfissiTechnicalCandidates(source), resolution: extractAprInfissiAutomaticTechnicalEvidence(source) };
const target = "ops/apr-reliability-gap-audit-2026-09-03/producer-position-diagnostic-r36.json";
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, rows: artifact.resolution.evidence?.rows.length ?? 0, status: artifact.resolution.status }, null, 2)}\n`);
