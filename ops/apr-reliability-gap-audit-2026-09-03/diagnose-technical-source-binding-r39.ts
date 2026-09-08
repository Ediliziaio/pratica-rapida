import { readFileSync } from "node:fs";
import path from "node:path";
import { extractAprInfissiAutomaticTechnicalEvidence, observeAprInfissiTechnicalCandidates } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";

const cases = [
  { index: "068", customerKey: "claudia-sellati", displayName: "CLAUDIA SELLATI" },
  { index: "085", customerKey: "gemma-minore", displayName: "GEMMA MINORE" },
  { index: "078", customerKey: "flavia-cipriani", displayName: "FLAVIA CIPRIANI" },
] as const;

const root = path.join(import.meta.dirname, "fresh-original-state-v2");
const results = cases.map((entry) => {
  const analysisRoot = path.join(root, entry.index, entry.customerKey, "crm-document-analysis");
  const checkpoint = JSON.parse(readFileSync(path.join(analysisRoot, "checkpoint.json"), "utf8")) as { items: Array<Record<string, unknown>> };
  const sources = checkpoint.items.filter((item) => item.state === "analyzed" && typeof item.textPath === "string").map((item) => {
    const classification = item.documentClassification && typeof item.documentClassification === "object" ? item.documentClassification as Record<string, unknown> : null;
    const scope = classification?.certificateScope;
    return {
      sourceId: String(item.documentKey),
      kind: String(item.semanticKind ?? item.kind),
      certificateScope: scope === "installed_windows" || scope === "removed_windows" ? scope : null,
      practiceCustomerName: entry.displayName,
      text: readFileSync(String(item.textPath), "utf8"),
    };
  });
  const result = extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true });
  const candidates = observeAprInfissiTechnicalCandidates(sources).candidates.map((candidate) => ({
    sourceId: candidate.sourceId,
    sourceKind: candidate.sourceKind,
    parser: candidate.parser,
    signature: candidate.rows.flatMap((row) => Array.from({ length: row.quantity }, () => `${row.widthM}x${row.heightM}`)).sort(),
    binding: candidate.sourceBinding,
  }));
  return {
    ...entry,
    status: result.status,
    blockers: result.blockers,
    selectedSourceId: result.audit.selectedSourceId,
    selectedParser: result.audit.selectedParser,
    selectedSourceBinding: result.audit.selectedSourceBinding,
    physicalRows: result.evidence?.rows.map((row) => ({ quantity: row.quantity, widthM: row.widthM, heightM: row.heightM, thermalTransmittanceWm2K: row.thermalTransmittanceWm2K })) ?? [],
    candidates,
  };
});

process.stdout.write(`${JSON.stringify({ version: "technical-source-binding-diagnostic-r39-v1", generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
