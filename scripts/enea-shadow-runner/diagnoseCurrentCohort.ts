import fs from "node:fs";
import { parseScreeningInvoiceText } from "../../src/features/enea-lab/invoiceParser";
import { buildCrmLocalPreflightReport } from "./crmLocalPreflight";

const root = process.argv[2];
if (!root) throw new Error("cohort_root_required");
const checkpoint = JSON.parse(fs.readFileSync(`${root}/crm-document-analysis/checkpoint.json`, "utf8")) as { items: Array<{ customerKey: string; kind: string; documentKey: string; textPath: string }> };
const preflight = JSON.parse(fs.readFileSync(`${root}/crm-local-preflight/checkpoint.json`, "utf8")) as { items: Array<{ customerKey: string; dossierPath: string }> };
const requested = process.argv.slice(3);
for (const who of requested) {
  const rows = checkpoint.items.filter((item) => item.customerKey === who && item.kind === "invoice").map((item) => {
    const parsed = parseScreeningInvoiceText(fs.readFileSync(item.textPath, "utf8"), item.documentKey);
    return { documentKey: item.documentKey.slice(0, 8), number: parsed.result.documentNumber, date: parsed.result.documentDate, total: parsed.result.total,
      items: parsed.items.map((product) => [product.description, product.widthMm, product.heightMm, product.gTot]) };
  });
  const updatedAnalysis = structuredClone(checkpoint) as typeof checkpoint & Record<string, unknown>;
  for (const item of updatedAnalysis.items as Array<Record<string, unknown> & { kind: string; documentKey: string; textPath: string }>) {
    if (item.kind !== "invoice" || !item.textPath) continue;
    const parsed = parseScreeningInvoiceText(fs.readFileSync(item.textPath, "utf8"), item.documentKey);
    item.invoiceResult = parsed.result; item.screeningItems = parsed.items; item.state = "analyzed";
  }
  const dossierPath = preflight.items.find((item) => item.customerKey === who)?.dossierPath;
  const report = dossierPath ? buildCrmLocalPreflightReport(JSON.parse(fs.readFileSync(dossierPath, "utf8")), who, updatedAnalysis as never, new Date("2026-08-16T19:00:00+02:00")) : null;
  process.stdout.write(`${JSON.stringify({ who, rows, outcome: report?.outcome, products: report?.products.length, total: report?.financial.reconciledTotal,
    buildingUnitCount: report?.buildingUnitCount, buildingQualification: report?.buildingQualification, bankTransfers: report?.financial.bankTransfers, bankTransferReconciliation: report?.financial.bankTransferReconciliation,
    financialEvidence: report?.financial.evidence, financialMethods: report?.financial.methods,
    blockers: report?.blockers.map((item) => item.code) })}\n`);
}
