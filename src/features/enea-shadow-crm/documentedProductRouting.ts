import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export type AprOperationalProductModule = "screening" | "infissi" | "mixed" | "unresolved";

export interface AprDocumentedProductRouting {
  module: AprOperationalProductModule;
  declaredModule: "screening" | "infissi" | null;
  source: "original_documents" | "declared_label" | "unresolved";
  screeningEvidence: string[];
  infissiEvidence: string[];
  appliedRuleIds: string[];
}

const compact = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function evidence(sourceId: string, value: string) {
  const normalized = compact(value);
  const screening = [
    /fornitura(?:\s+e\s+posa)?(?:\s+in\s+opera)?(?:\s+di)?(?:\s+n[.°º]?\s*\d+)?\s+(?:persian|avvolgibil|tapparell|tend[ae]\s+da\s+sole|zanzarier)\w*/g,
    /scheda\s+ordine\s+(?:persian|avvolgibil|tapparell)\w*/g,
    /\b(?:persian|avvolgibil|tapparell)\w*\s+in\s+alluminio\b/g,
  ].flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => `${sourceId}:${match[0]}`));
  const infissi = [
    /fornitura(?:\s+e\s+posa)?(?:\s+in\s+opera)?(?:\s+di)?(?:\s+n[.°º]?\s*\d+)?\s+(?:serrament|infiss|finestre?|portefinestre?)\w*/g,
    /(?:serrament|infiss|finestre?|portefinestre?)\w*\s+in\s+(?:pvc|legno|alluminio)\b/g,
    /\b(?:serrament|infiss|finestre?|portefinestre?)\w*\s+(?:pvc|legno|alluminio)\b/g,
    /dichiarazione\s+di\s+prestazione[^.]{0,160}(?:finestr|serrament|infiss)\w*/g,
  ].flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => `${sourceId}:${match[0]}`));
  return { screening, infissi };
}

/**
 * L'etichetta CRM seleziona soltanto la coorte. Il percorso operativo viene
 * deciso dalle fonti originarie: persiane/avvolgibili/tende/zanzariere usano il
 * modulo Schermature; serramenti/infissi usano Infissi; una fornitura realmente
 * mista conserva entrambe le famiglie e non viene ridotta a una sola etichetta.
 */
export function resolveAprDocumentedProductRouting(input: {
  declaredModule?: "screening" | "infissi" | null;
  sources: readonly { sourceId: string; text: string }[];
}): AprDocumentedProductRouting {
  const screeningEvidence: string[] = [];
  const infissiEvidence: string[] = [];
  for (const source of input.sources) {
    const found = evidence(source.sourceId, source.text);
    screeningEvidence.push(...found.screening);
    infissiEvidence.push(...found.infissi);
  }
  const documented = screeningEvidence.length && infissiEvidence.length ? "mixed"
    : screeningEvidence.length ? "screening"
      : infissiEvidence.length ? "infissi" : null;
  const declaredModule = input.declaredModule ?? null;
  return {
    module: documented ?? declaredModule ?? "unresolved",
    declaredModule,
    source: documented ? "original_documents" : declaredModule ? "declared_label" : "unresolved",
    screeningEvidence: [...new Set(screeningEvidence)],
    infissiEvidence: [...new Set(infissiEvidence)],
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel],
  };
}
