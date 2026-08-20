import {
  hasExplicitAprShadowAuthorization,
  type AprGlobalShadowUserAuthorization,
} from "./aprShadowAuthorization";
import type { AprIntakeOnlyProduct } from "./productIntegration";
import {
  evaluateAprProductShadowReadiness,
  type AprProductShadowReadinessEvidence,
  type AprProductShadowReadinessResult,
} from "./productShadowReadiness";

export type AprShadowPreflightBlocker =
  | "global-shadow-user-gate-not-granted"
  | "regression-suite-attestation-missing"
  | "regression-suite-attestation-stale"
  | "screenings-technical-readiness-unverified";

export type AprShadowActivationAction =
  | "refresh-regression-suite-attestation"
  | "verify-screenings-technical-readiness"
  | "await-explicit-user-gate"
  | "start-read-only-shadow";

export type AprProductIntegrationAction =
  | "continue-product-readiness"
  | "all-intake-products-technically-ready";

export interface AprShadowPreflightInput {
  /** Revisione del codice che stiamo valutando, normalmente il commit HEAD. */
  currentCodeRevision: string;
  /** Revisione esatta sulla quale la suite regressiva e risultata verde. */
  regressionSuiteGreenRevision?: string | null;
  /** Unico gate operativo ammesso: source=user + frase canonica. */
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization;
  /** Evidenza separata per le Schermature, gia validate nel percorso dedicato. */
  screeningsTechnicalShadowReady: boolean;
  /** Evidenza tecnica dei tre adapter ancora intake-only. */
  productEvidence: Record<AprIntakeOnlyProduct, AprProductShadowReadinessEvidence>;
}

export interface AprShadowPreflightProductStatus {
  readiness: AprProductShadowReadinessResult;
  /** Include anche la freschezza della suite sul codice corrente. */
  technicalShadowReady: boolean;
  operationalShadowAllowed: boolean;
}

export interface AprShadowPreflightResult {
  globalShadowUserGateGranted: boolean;
  regressionSuiteFresh: boolean;
  screenings: {
    technicalShadowReady: boolean;
    operationalShadowAllowed: boolean;
  };
  products: Record<AprIntakeOnlyProduct, AprShadowPreflightProductStatus>;
  activationBlockers: AprShadowPreflightBlocker[];
  nextActivationAction: AprShadowActivationAction;
  nextProductIntegrationAction: AprProductIntegrationAction;
  officialSubmissionAllowed: false;
}

const INTAKE_ONLY_PRODUCTS: readonly AprIntakeOnlyProduct[] = [
  "infissi",
  "impianto_termico",
  "insufflaggio",
];

/**
 * Accetta SHA Git canonici (SHA-1 o SHA-256) senza whitespace. Il preflight non
 * deve poter considerare "verde" una suite anonima o riferita a un'altra
 * revisione del codice.
 */
function isCanonicalCodeRevision(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(value);
}

function getRegressionAttestationStatus(
  currentCodeRevision: unknown,
  regressionSuiteGreenRevision: unknown,
): "fresh" | "missing" | "stale" {
  if (
    !isCanonicalCodeRevision(currentCodeRevision)
    || !isCanonicalCodeRevision(regressionSuiteGreenRevision)
  ) {
    return "missing";
  }

  return currentCodeRevision.toLowerCase() === regressionSuiteGreenRevision.toLowerCase()
    ? "fresh"
    : "stale";
}

/**
 * Preflight unico per il passaggio APR alla modalita OMBRA.
 *
 * Working backwards dall'attivazione: aggrega gate utente, freschezza della
 * regressione, readiness Schermature e readiness dei tre adapter senza cambiare
 * la semantica dei gate esistenti. Il verde della suite deve appartenere alla
 * stessa revisione che stiamo per usare: un booleano verde stale non basta.
 *
 * Questo preflight non abilita mai l'invio ufficiale e non effettua letture o
 * scritture verso CRM/ENEA; produce soltanto una decisione deterministica.
 */
export function evaluateAprShadowPreflight(
  input: AprShadowPreflightInput,
): AprShadowPreflightResult {
  const globalShadowUserGateGranted = hasExplicitAprShadowAuthorization(
    input.globalShadowAuthorization,
  );
  const regressionAttestationStatus = getRegressionAttestationStatus(
    input.currentCodeRevision,
    input.regressionSuiteGreenRevision,
  );
  const regressionSuiteFresh = regressionAttestationStatus === "fresh";

  const products = {} as Record<AprIntakeOnlyProduct, AprShadowPreflightProductStatus>;
  for (const productType of INTAKE_ONLY_PRODUCTS) {
    const readiness = evaluateAprProductShadowReadiness(productType, {
      ...input.productEvidence[productType],
      // Un solo gate globale: nessun adapter puo trasportare autorizzazioni
      // divergenti o stale dentro la propria evidenza.
      globalShadowAuthorization: input.globalShadowAuthorization,
    });

    products[productType] = {
      readiness,
      technicalShadowReady: readiness.technicalShadowReady && regressionSuiteFresh,
      operationalShadowAllowed: readiness.operationalShadowAllowed && regressionSuiteFresh,
    };
  }

  const activationBlockers: AprShadowPreflightBlocker[] = [];
  if (regressionAttestationStatus === "missing") {
    activationBlockers.push("regression-suite-attestation-missing");
  } else if (regressionAttestationStatus === "stale") {
    activationBlockers.push("regression-suite-attestation-stale");
  }
  if (!input.screeningsTechnicalShadowReady) {
    activationBlockers.push("screenings-technical-readiness-unverified");
  }
  if (!globalShadowUserGateGranted) {
    activationBlockers.push("global-shadow-user-gate-not-granted");
  }

  let nextActivationAction: AprShadowActivationAction;
  if (!regressionSuiteFresh) {
    nextActivationAction = "refresh-regression-suite-attestation";
  } else if (!input.screeningsTechnicalShadowReady) {
    nextActivationAction = "verify-screenings-technical-readiness";
  } else if (!globalShadowUserGateGranted) {
    nextActivationAction = "await-explicit-user-gate";
  } else {
    nextActivationAction = "start-read-only-shadow";
  }

  const allIntakeProductsTechnicallyReady = INTAKE_ONLY_PRODUCTS.every(
    (productType) => products[productType].readiness.technicalShadowReady,
  );

  return {
    globalShadowUserGateGranted,
    regressionSuiteFresh,
    screenings: {
      technicalShadowReady: input.screeningsTechnicalShadowReady && regressionSuiteFresh,
      operationalShadowAllowed: input.screeningsTechnicalShadowReady
        && regressionSuiteFresh
        && globalShadowUserGateGranted,
    },
    products,
    activationBlockers,
    nextActivationAction,
    nextProductIntegrationAction: allIntakeProductsTechnicallyReady
      ? "all-intake-products-technically-ready"
      : "continue-product-readiness",
    officialSubmissionAllowed: false,
  };
}
