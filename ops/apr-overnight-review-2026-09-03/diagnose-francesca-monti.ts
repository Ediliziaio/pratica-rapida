import { readFileSync } from "node:fs";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport, resolveOriginalDocumentFiscalCode, resolvePrimaryBeneficiaryFromOriginalInvoices } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { parseLineaSolePotitoPaperForm } from "../../scripts/enea-shadow-runner/lineaSolePotitoPolicy";

const stateDirectory = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-3000-global-controller-francesca-monti";
const customerKey = "francesca-monti";
const dossier = JSON.parse(readFileSync(`${stateDirectory}/crm-acquisition/dossiers/${customerKey}.json`, "utf8"));
const analysis = new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(new Date("2026-09-03T00:00:00Z"));
const textPath = analysis.items.find((item) => item.customerKey === customerKey && item.kind === "invoice")?.textPath;
if (!textPath) throw new Error("invoice text missing");
const parsed = parseLineaSolePotitoPaperForm(readFileSync(textPath, "utf8"), {
  name: dossier.row.cliente_nome,
  surname: dossier.row.cliente_cognome,
  taxCode: dossier.row.cliente_cf,
});
const report = buildCrmLocalPreflightReport(dossier, customerKey, analysis, new Date("2026-09-03T00:00:00Z"));
const requester = parsed?.richiedente ?? null;
const documentCf = resolveOriginalDocumentFiscalCode({ customerKey, requester, analysis });
const crmConfirmedPrimary = resolvePrimaryBeneficiaryFromOriginalInvoices({ customerKey, taxCode: dossier.row.cliente_cf, analysis });
process.stdout.write(`${JSON.stringify({ parsedRequester: requester, metadata: parsed?._lineaSolePotito, documentCf, crmConfirmedPrimary, report: { formAvailable: report.formAvailable, taxCodeStatus: report.taxCodeStatus, resolvedTaxCode: report.resolvedTaxCode, blockers: report.blockers.filter((item) => /tax_code|customer_form/.test(item.code)) } }, null, 2)}\n`);
