import type { FormClienteData } from "@/types/form-cliente";
import { buildAprInfissiIntake, type AprInfissiIntake } from "./infissiIntake";
import {
  buildAprImpiantoTermicoIntake,
  type AprImpiantoTermicoIntake,
} from "./impiantoTermicoIntake";
import {
  buildAprInsufflaggioIntake,
  type AprInsufflaggioIntake,
} from "./insufflaggioIntake";

export interface AprProductIntakeContext {
  hasInvoice: boolean;
  hasCompletedEneaPdf: boolean;
}

export interface AprScreeningIntakeRoute {
  productType: "schermature";
  integrationPhase: "screenings-validated";
  existingScreeningFlow: true;
  shadowTechnicalMappingAllowed: true;
  officialSubmissionAllowed: false;
}

export type AprProductIntake =
  | AprScreeningIntakeRoute
  | (AprInfissiIntake & { integrationPhase: "intake-only" })
  | (AprImpiantoTermicoIntake & { integrationPhase: "intake-only" })
  | (AprInsufflaggioIntake & { integrationPhase: "intake-only" });

/**
 * Unico punto di ingresso APR multi-prodotto.
 * Le schermature restano sul flusso shadow già validato; gli altri prodotti
 * vengono instradati verso adapter intake-only che non possono produrre invii
 * o mapping tecnici finché mancano ground truth e contratto portale specifici.
 */
export function buildAprProductIntake(
  form: FormClienteData,
  context: AprProductIntakeContext,
): AprProductIntake {
  switch (form.prodotto.tipo) {
    case "schermature":
      return {
        productType: "schermature",
        integrationPhase: "screenings-validated",
        existingScreeningFlow: true,
        shadowTechnicalMappingAllowed: true,
        officialSubmissionAllowed: false,
      };
    case "infissi":
      return {
        ...buildAprInfissiIntake(form, context),
        integrationPhase: "intake-only",
      };
    case "impianto_termico":
      return {
        ...buildAprImpiantoTermicoIntake(form, context),
        integrationPhase: "intake-only",
      };
    case "insufflaggio":
      return {
        ...buildAprInsufflaggioIntake(form, context),
        integrationPhase: "intake-only",
      };
  }
}
