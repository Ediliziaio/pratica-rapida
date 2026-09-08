import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractLocalInvoiceFinancialEvidence } from "../../scripts/enea-shadow-runner/localInvoiceFinancialEvidence";
import { reconcileFinancialEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { aprAutomationExclusion, APR_FUTURE_TEST_EXCLUSIONS_VERSION } from "../../scripts/enea-shadow-runner/aprFutureTestExclusions";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const manifestPath = path.join(root, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: Array<{ cohort: number; customerKey: string; displayName: string; reseller: string }> };
const rinaldiCases = manifest.cases.filter((item) => /rinaldi/i.test(item.reseller));

const results = rinaldiCases.map((entry) => {
  const checkpointPath = path.join(ops, "fresh-original-state-v2", String(entry.cohort).padStart(3, "0"), entry.customerKey, "crm-document-analysis/checkpoint.json");
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as { items: Array<Record<string, any>> };
  const preflightPath = path.join(ops, "fresh-original-state-v2", String(entry.cohort).padStart(3, "0"), entry.customerKey, "product-gate-r39/crm-local-preflight/checkpoint.json");
  const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as { items: Array<Record<string, any>> };
  const authoritativeEvidence = preflight.items[0]?.report?.financial?.evidence ?? [];
  const evidence = authoritativeEvidence.map((financial: Record<string, any>) => {
    const documentKey = String(financial.sourceId).split(":invoice:")[0];
    const item = checkpoint.items.find((candidate) => candidate.documentKey === documentKey);
    const extracted = item ? extractLocalInvoiceFinancialEvidence({
      sourceId: financial.sourceId,
      text: readFileSync(item.textPath, "utf8"),
      extractionMode: item.extractionMode,
      documentNumber: item.invoiceResult?.documentNumber,
      documentDate: item.invoiceResult?.documentDate,
      grossTotal: financial.grossTotal,
    }) : null;
    return {
      ...financial,
      supplierId: "rinaldi",
      supplierName: "Rinaldi",
      documentNumber: extracted?.documentNumber ?? "",
      documentDate: extracted?.documentDate ?? "",
      kind: financial.kind ?? "invoice",
      explicitDeductibleLines: extracted?.explicitDeductibleLines ?? [],
    };
  });
  const financial = reconcileFinancialEvidence(evidence, { mode: "test", scheme: "ecobonus" });
  const explicitLines = evidence.flatMap((item) => (item.explicitDeductibleLines ?? []).map((line) => ({ sourceId: item.sourceId, ...line })));
  return {
    customerKey: entry.customerKey,
    displayName: entry.displayName,
    invoiceEvidenceCount: evidence.length,
    explicitDeductibleLines: explicitLines,
    result: { usable: financial.usable, total: financial.total, blockers: financial.blockers, appliedRuleIds: financial.appliedRuleIds, auditNotes: financial.auditNotes },
  };
});

const internalExact = aprAutomationExclusion({ displayName: "PROVA RIVENDITORE 1 30/04" });
const internalNearMisses = ["PROVA RIVENDITORE 1 30/05", "RIVENDITORE 1 30/04"].map((displayName) => ({ displayName, exclusion: aprAutomationExclusion({ displayName }) }));
if (rinaldiCases.length !== 11) throw new Error(`rinaldi_case_count:${rinaldiCases.length}`);
const campagna = results.find((item) => item.customerKey === "claudia-campagna");
if (!campagna || !campagna.result.usable || campagna.result.total !== 2276.06 || campagna.explicitDeductibleLines.length < 1) throw new Error(`campagna_rinaldi_rule_not_proved:${JSON.stringify(campagna)}`);
if (!internalExact || internalExact.canonicalKey !== "prova-rivenditore-1-30-04" || internalNearMisses.some((item) => item.exclusion !== null)) throw new Error("internal_exclusion_not_exact");

const artifact = {
  version: "apr-rinaldi-internal-exclusion-diagnostic-r40-v1",
  generatedAt: new Date().toISOString(),
  manifestSha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"),
  safety: { localOnly: true, originalExtractedTextsOnly: true, eneaAccessed: false, externalActionAllowed: false },
  rinaldi: { caseCount: results.length, cases: results },
  permanentInternalExclusion: { version: APR_FUTURE_TEST_EXCLUSIONS_VERSION, exact: internalExact, nearMisses: internalNearMisses },
};
const target = path.join(ops, "rinaldi-internal-exclusion-diagnostic-r40.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, rinaldiCaseCount: results.length, campagna: campagna.result, exclusion: internalExact }, null, 2)}\n`);
