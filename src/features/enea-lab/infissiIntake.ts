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
  technicalPortalContractObserved?: boolean;
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

function runtimeInfissiFields(value: unknown): AprInfissiIntakeFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = value as Record<string, unknown>;
  const legacyShape = [
    "materiale_vecchi",
    "vetro_vecchi",
    "materiale_nuovi",
    "vetro_nuovi",
  ].some((key) => key in product);
  if (product.tipo !== "infissi" && !legacyShape) return null;

  const material = (canonical: string, legacy: string): MaterialeInfisso | "" => {
    const candidate = product[canonical] ?? product[legacy];
    return candidate === "legno" || candidate === "pvc" || candidate === "metallo"
      ? candidate
      : "";
  };
  const glass = (canonical: string, legacy: string): TipoVetro | "" => {
    const candidate = product[canonical] ?? product[legacy];
    return candidate === "singolo" || candidate === "doppio" || candidate === "triplo"
      ? candidate
      : "";
  };
  const accessories = product.zanzariere_tapparelle
    ?? product.zanzariere_tapparelle_persiane;

  return {
    oldMaterial: material("vecchi_materiale", "materiale_vecchi"),
    oldGlass: glass("vecchi_vetro", "vetro_vecchi"),
    newMaterial: material("nuovi_materiale", "materiale_nuovi"),
    newGlass: glass("nuovi_vetro", "vetro_nuovi"),
    hasAccessories: typeof accessories === "boolean" ? accessories : null,
  };
}

/**
 * Intake APR Infissi: raccoglie esclusivamente dati già strutturati nel CRM.
 * Non deduce trasmittanze, superfici, valori ENEA o selettori portale.
 *
 * L'assenza del contratto tecnico resta un blocker finché il probe read-only
 * non ha osservato la pagina 2026. Anche quando il blocker viene rimosso,
 * questo adapter da solo non abilita il mapping tecnico: serve il gate completo.
 */
export function buildAprInfissiIntake(
  form: FormClienteData,
  context: AprInfissiIntakeContext,
): AprInfissiIntake {
  const product = runtimeInfissiFields(form.prodotto as unknown);
  const fields = product ?? { ...EMPTY_FIELDS };

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
  if (context.technicalPortalContractObserved !== true) {
    blockers.push("infissi-portal-technical-contract-unobserved");
  }

  return {
    productType: "infissi",
    fields,
    structuredIntakeComplete,
    blockers,
    shadowTechnicalMappingAllowed: false,
    officialSubmissionAllowed: false,
  };
}
