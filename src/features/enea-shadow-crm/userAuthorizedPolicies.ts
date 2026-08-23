import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

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
 * Per la pergola un gTot esplicito in una fonte originaria prevale sul fallback 0,08.
 */
export function resolveUserAuthorizedScreeningRow(description: string, documentedGTot?: number | null): UserAuthorizedScreeningResolution | null {
  const normalized = normalizeDescription(description);
  if (normalized.includes("pergola")) {
    const hasDocumentedGTot = typeof documentedGTot === "number" && Number.isFinite(documentedGTot) && documentedGTot > 0;
    return {
      classification: "solar_screening",
      product: "pergola",
      gTot: hasDocumentedGTot ? documentedGTot : 0.08,
      ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening,
      provenance: hasDocumentedGTot ? "original_practice_source" : "user_confirmed_operational_policy",
      gTotSource: hasDocumentedGTot ? "original_practice_source" : "fallback",
      priority: 300,
    };
  }
  if (normalized.includes("cristal")) {
    const hasDocumentedGTot = typeof documentedGTot === "number" && Number.isFinite(documentedGTot) && documentedGTot > 0;
    return {
      classification: "solar_screening",
      product: "cristal",
      gTot: hasDocumentedGTot ? documentedGTot : 0.33,
      ruleId: USER_AUTHORIZED_RULE_IDS.cristalScreening,
      provenance: hasDocumentedGTot ? "original_practice_source" : "user_confirmed_operational_policy",
      gTotSource: hasDocumentedGTot ? "original_practice_source" : "fallback",
      priority: 200,
    };
  }
  return null;
}
