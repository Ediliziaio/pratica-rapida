import type { FormClienteData } from "@/types/form-cliente";

export type AprInsufflaggioIntakeBlocker =
  | "insufflaggio-product-mismatch"
  | "insufflaggio-invoice-missing"
  | "insufflaggio-invoice-technical-parser-unimplemented"
  | "insufflaggio-completed-enea-ground-truth-missing"
  | "insufflaggio-portal-technical-contract-unobserved";

export interface AprInsufflaggioIntakeContext {
  hasInvoice: boolean;
  hasCompletedEneaPdf: boolean;
}

export interface AprInsufflaggioIntake {
  productType: "insufflaggio";
  invoiceSourceAvailable: boolean;
  technicalSourceReadyForParser: boolean;
  invoiceTechnicalExtractionAllowed: false;
  blockers: AprInsufflaggioIntakeBlocker[];
  shadowTechnicalMappingAllowed: false;
  officialSubmissionAllowed: false;
}

/**
 * Adapter APR intake-only per insufflaggio/isolamento.
 * Il form CRM non deve inventare campi prodotto: spessore e conducibilità
 * sono dichiarati come sorgente documentale e verranno estratti solo quando
 * esisterà un parser fattura specifico, coperto da ground truth ENEA conclusa.
 */
export function buildAprInsufflaggioIntake(
  form: FormClienteData,
  context: AprInsufflaggioIntakeContext,
): AprInsufflaggioIntake {
  const productMatches = form.prodotto.tipo === "insufflaggio";
  const invoiceSourceAvailable = productMatches && context.hasInvoice;
  const technicalSourceReadyForParser = invoiceSourceAvailable;

  const blockers: AprInsufflaggioIntakeBlocker[] = [];
  if (!productMatches) blockers.push("insufflaggio-product-mismatch");
  if (!context.hasInvoice) blockers.push("insufflaggio-invoice-missing");

  // Hard gate: la fattura è la fonte prevista per spessore e conducibilità,
  // ma nessun valore tecnico può essere estratto finché non esiste un parser
  // specifico e verificato. La mera presenza del PDF non abilita mapping.
  blockers.push("insufflaggio-invoice-technical-parser-unimplemented");

  if (!context.hasCompletedEneaPdf) {
    blockers.push("insufflaggio-completed-enea-ground-truth-missing");
  }

  // Il percorso 345A è noto, ma la pagina tecnica dell'involucro opaco non è
  // ancora congelata come contratto portale osservato.
  blockers.push("insufflaggio-portal-technical-contract-unobserved");

  return {
    productType: "insufflaggio",
    invoiceSourceAvailable,
    technicalSourceReadyForParser,
    invoiceTechnicalExtractionAllowed: false,
    blockers,
    shadowTechnicalMappingAllowed: false,
    officialSubmissionAllowed: false,
  };
}
