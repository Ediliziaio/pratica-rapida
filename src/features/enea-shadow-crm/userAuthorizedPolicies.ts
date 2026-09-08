import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import { resolveScreeningGTot } from "./productClassifier";

export interface UserAuthorizedScreeningResolution {
  classification: "solar_screening";
  product: "pergola" | "cristal";
  gTot: number;
  ruleId: typeof USER_AUTHORIZED_RULE_IDS[keyof typeof USER_AUTHORIZED_RULE_IDS];
  provenance: "original_practice_source" | "user_confirmed_operational_policy";
  gTotSource: "original_practice_source" | "fallback";
  priority: number;
}

function normalizeDescription(description: string) {
  return description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Applica soltanto le due classificazioni esplicitamente autorizzate dall'utente.
 * La dicitura pergola ha precedenza sulla dicitura Cristal nella stessa riga.
 * Un valore documentato prevale sempre; l'unico fallback pergola ammesso è 0,06.
 * Cristal/tenda senza valore documentato resta fail-closed.
 */
export function resolveUserAuthorizedScreeningRow(description: string, documentedGTot?: number | null): UserAuthorizedScreeningResolution | null {
  const normalized = normalizeDescription(description);
  if (normalized.includes("pergola")) {
    const resolution = resolveScreeningGTot(description, "pergola", documentedGTot);
    if (resolution.value === null) return null;
    return {
      classification: "solar_screening",
      product: "pergola",
      gTot: resolution.value,
      ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening,
      provenance: resolution.source === "invoice_explicit" ? "original_practice_source" : "user_confirmed_operational_policy",
      gTotSource: resolution.source === "invoice_explicit" ? "original_practice_source" : "fallback",
      priority: 300,
    };
  }
  if (normalized.includes("cristal")) {
    const resolution = resolveScreeningGTot(description, "tenda", documentedGTot);
    if (resolution.value === null) return null;
    return {
      classification: "solar_screening",
      product: "cristal",
      gTot: resolution.value,
      ruleId: USER_AUTHORIZED_RULE_IDS.cristalScreening,
      provenance: "original_practice_source",
      gTotSource: "original_practice_source",
      priority: 200,
    };
  }
  return null;
}
