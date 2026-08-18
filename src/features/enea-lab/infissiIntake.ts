import type {
  FormClienteData,
  MaterialeInfisso,
  TipoVetro,
} from "@/types/form-cliente";

export type AprInfissiIntakeBlocker =
  | "infissi-product-mismatch"
  | "infissi-product-data-incomplete"
  | "infissi-invoice-missing"
  | "infissi-completed-enea-ground-truth-missing"
  | "infissi-portal-technical-contract-unobserved";

export interface AprInfissiIntakeFields {
  oldMaterial: MaterialeInfisso | "";
  oldGlass: TipoVetro | "";
  newMaterial: MaterialeInfisso | "";
  newGlass: TipoVetro | "";
  hasAccessories: boolean | null;
}

export interface AprInfissiIntakeContext {
  hasInvoice: boolean;
  hasCompletedEneaPdf: boolean;
}

export interface AprInfissiIntake {
  productType: "infissi";
  fields: AprInfissiIntakeFields;
  structuredIntakeComplete: boolean;
  blockers: AprInfissiIntakeBlocker[];
  shadowTechnicalMappingAllowed: false;
  officialSubmissionAllowed: false;
}

const EMPTY_FIELDS: AprInfissiIntakeFields = {
  oldMaterial: "",
  oldGlass: "",
  newMaterial: "",
  newGlass: "",
  hasAccessories: null,
};

/**
 * Primo adapter APR per gli infissi: raccoglie esclusivamente i dati prodotto
 * già strutturati nel CRM e misura ciò che manca per costruire il vero mapping
 * tecnico. Non deduce trasmittanze, superfici, valori ENEA o selettori portale.
 *
 * Finché non esistono ground truth ENEA concluse e contratto tecnico osservato,
 * l'adapter resta deliberatamente intake-only e non può produrre workflow.
 */
export function buildAprInfissiIntake(
  form: FormClienteData,
  context: AprInfissiIntakeContext,
): AprInfissiIntake {
  const product = form.prodotto.tipo === "infissi" ? form.prodotto : null;
  const fields: AprInfissiIntakeFields = product
    ? {
        oldMaterial: product.vecchi_materiale,
        oldGlass: product.vecchi_vetro,
        newMaterial: product.nuovi_materiale,
        newGlass: product.nuovi_vetro,
        hasAccessories: product.zanzariere_tapparelle,
      }
    : { ...EMPTY_FIELDS };

  const structuredIntakeComplete = Boolean(
    product
    && fields.oldMaterial
    && fields.oldGlass
    && fields.newMaterial
    && fields.newGlass
    && fields.hasAccessories !== null,
  );

  const blockers: AprInfissiIntakeBlocker[] = [];
  if (!product) {
    blockers.push("infissi-product-mismatch");
  } else if (!structuredIntakeComplete) {
    blockers.push("infissi-product-data-incomplete");
  }
  if (!context.hasInvoice) blockers.push("infissi-invoice-missing");
  if (!context.hasCompletedEneaPdf) {
    blockers.push("infissi-completed-enea-ground-truth-missing");
  }

  // Hard gate: il percorso 345A è osservato, ma la pagina tecnica specifica
  // degli infissi/serramenti non è ancora congelata come contratto portale.
  blockers.push("infissi-portal-technical-contract-unobserved");

  return {
    productType: "infissi",
    fields,
    structuredIntakeComplete,
    blockers,
    shadowTechnicalMappingAllowed: false,
    officialSubmissionAllowed: false,
  };
}
