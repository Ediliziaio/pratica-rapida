import type { FormClienteData } from "@/types/form-cliente";
import {
  hasExplicitAprShadowAuthorization,
  type AprGlobalShadowUserAuthorization,
} from "./aprShadowAuthorization";
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
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization;
}

export interface AprScreeningIntakeRoute {
  productType: "schermature";
  integrationPhase: "screenings-validated";
  existingScreeningFlow: true;
  shadowTechnicalMappingAllowed: boolean;
  officialSubmissionAllowed: false;
}

export type AprProductIntake =
  | AprScreeningIntakeRoute
  | (AprInfissiIntake & { integrationPhase: "intake-only" })
  | (AprImpiantoTermicoIntake & { integrationPhase: "intake-only" })
  | (AprInsufflaggioIntake & { integrationPhase: "intake-only" });

/**
 * Unico punto di ingresso APR multi-prodotto.
 * Le schermature hanno un flusso tecnico già validato, ma la valutazione shadow
 * operativa resta subordinata allo stesso gate esplicito dell'intero APR. Gli
 * altri prodotti restano intake-only finché mancano ground truth e contratto
 * portale specifici. Nessun percorso abilita invii ufficiali.
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
        shadowTechnicalMappingAllowed: hasExplicitAprShadowAuthorization(
          context.globalShadowAuthorization,
        ),
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
