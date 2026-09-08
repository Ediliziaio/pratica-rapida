export const PRODUCT_CLASSIFIER_RULE_IDS = {
  classifier: "user-2026-08-31-shared-screening-product-classifier-v1",
  documentedGTot: "user-2026-08-31-documented-gtot-precedence-v1",
  zanzarieraFallback: "user-2026-08-31-zanzariera-missing-gtot-033-v1",
  rigidScreeningFallback: "user-2026-08-31-rigid-screening-missing-gtot-006-v1",
  genericAwningFallback: "user-2026-09-05-generic-awning-missing-gtot-013-v1",
  formDeclaredTypeResolvesClassificationAmbiguity: "user-2026-09-07-form-declared-type-resolves-classification-ambiguity-v1",
  missingGTotOperatorRequired: "user-2026-08-31-unknown-screening-missing-gtot-operator-v1",
} as const;

export type ScreeningProductFamily = "zanzariera" | "pergola" | "persiana" | "tapparella" | "avvolgibile" | "tenda" | "generico";

export interface ScreeningProductClassification {
  family: ScreeningProductFamily;
  confidence: "explicit" | "keyword" | "unknown";
  source: "declared_type" | "description" | "none";
  fallbackAuthorized: boolean;
  ruleId: typeof PRODUCT_CLASSIFIER_RULE_IDS.classifier;
}

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");

function familyFrom(value: string): ScreeningProductFamily | null {
  const normalized = normalize(value);
  if (/zanzarier/.test(normalized)) return "zanzariera";
  if (/persian[ae]/.test(normalized)) return "persiana";
  if (/tapparell/.test(normalized)) return "tapparella";
  if (/avvolgibil/.test(normalized)) return "avvolgibile";
  if (/pergola|pergotenda/.test(normalized)) return "pergola";
  if (/tenda|venezian|cristal/.test(normalized)) return "tenda";
  return null;
}

// Verifica soltanto il valore reale dell'enum del form cliente
// ("tende_da_sole"), non una generica parola "tenda"/"cristal": alcuni
// chiamanti interni (es. userAuthorizedPolicies.ts) passano "tenda" come
// suggerimento di famiglia per la propria logica, non come dichiarazione
// autentica del cliente, e quel suggerimento non deve mai sciogliere
// un'ambiguita' che quella stessa policy vuole restare fail-closed. Questo
// controllo resta isolato al solo caso d'uso "il form scioglie un'ambiguita'
// gia' individuata dalla fattura", non alla classificazione generale.
function declaredTypeIndicatesTenda(declaredType: string): boolean {
  return normalize(declaredType).replace(/_/g, " ").includes("tende da sole");
}

export function classifyScreeningProduct(description: string, declaredType?: string | null): ScreeningProductClassification {
  const normalizedEvidence = normalize(`${description} ${declaredType ?? ""}`);
  const declared = familyFrom(declaredType ?? "");
  const described = familyFrom(description);
  const family = described ?? declared ?? "generico";
  return {
    family,
    confidence: described ? "keyword" : declared ? "explicit" : "unknown",
    source: described ? "description" : declared ? "declared_type" : "none",
    fallbackAuthorized: ["zanzariera", "pergola", "persiana", "tapparella", "avvolgibile", "tenda"].includes(family)
      || (family === "generico" && /schermatur/.test(normalizedEvidence)),
    ruleId: PRODUCT_CLASSIFIER_RULE_IDS.classifier,
  };
}

export type ScreeningGTotResolution = {
  value: number | null;
  source: "invoice_explicit" | "authorized_fallback" | "operator_required";
  ruleId: string;
  classification: ScreeningProductClassification;
};

export function resolveScreeningGTot(
  description: string,
  declaredType: string | null | undefined,
  documentedGTot: number | null | undefined,
): ScreeningGTotResolution {
  const classification = classifyScreeningProduct(description, declaredType);
  const normalizedEvidence = normalize(`${description} ${declaredType ?? ""}`);
  const documented = typeof documentedGTot === "number" && Number.isFinite(documentedGTot) && documentedGTot > 0 && documentedGTot <= 0.35;
  if (documented) return { value: documentedGTot, source: "invoice_explicit", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.documentedGTot, classification };
  if (classification.family === "zanzariera") return { value: 0.33, source: "authorized_fallback", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.zanzarieraFallback, classification };
  if (["pergola", "persiana", "tapparella", "avvolgibile"].includes(classification.family)) {
    return { value: 0.06, source: "authorized_fallback", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.rigidScreeningFallback, classification };
  }
  // Il form, dove il cliente dichiara il tipo di intervento, e' la seconda
  // fonte da consultare prima di fermarsi per operatore: se la fattura usa
  // un sottotipo che da solo non basta a confermare il fallback generico
  // (es. "cristal"), ma il cliente ha dichiarato esplicitamente nel form un
  // tipo di prodotto che si riconduce alla stessa famiglia gia' identificata
  // dalla fattura, quella dichiarazione risolve il dubbio senza inventare
  // nulla. Regola generale per qualunque ambiguita' di classificazione, non
  // solo per il sottotipo "cristal": si ferma per operatore solo se anche il
  // form non aiuta.
  if (classification.family === "tenda" && !/\bcristal\b/.test(normalizedEvidence)) {
    return { value: 0.13, source: "authorized_fallback", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.genericAwningFallback, classification };
  }
  if (classification.family === "tenda" && declaredTypeIndicatesTenda(declaredType ?? "")) {
    return { value: 0.13, source: "authorized_fallback", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.formDeclaredTypeResolvesClassificationAmbiguity, classification };
  }
  if (classification.family === "generico" && /schermatur/.test(normalizedEvidence)) {
    return { value: 0.13, source: "authorized_fallback", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.genericAwningFallback, classification };
  }
  return { value: null, source: "operator_required", ruleId: PRODUCT_CLASSIFIER_RULE_IDS.missingGTotOperatorRequired, classification };
}
