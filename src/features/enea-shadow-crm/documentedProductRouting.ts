import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export type AprOperationalProductModule = "screening" | "infissi" | "mixed" | "unresolved";

export interface AprDocumentedProductRouting {
  module: AprOperationalProductModule;
  declaredModule: "screening" | "infissi" | null;
  formDeclaredModule: "screening" | "infissi" | null;
  source: "form_declared" | "original_documents" | "declared_label" | "unresolved";
  screeningEvidence: string[];
  infissiEvidence: string[];
  appliedRuleIds: string[];
}

/**
 * Deriva il modulo dichiarato dalla STRUTTURA del form cliente originario
 * (non dall'etichetta di coda CRM prodotto_installato): la sezione Infissi
 * ha sempre i campi materiale/vetro vecchio e nuovo, la sezione Schermature
 * ha sempre un elenco prodotti. E' una dichiarazione di prima mano del
 * form, non un'etichetta libera: prevale sull'inferenza testuale in fattura.
 */
export function resolveFormDeclaredProductModule(prodotto: unknown): "screening" | "infissi" | null {
  if (!prodotto || typeof prodotto !== "object" || Array.isArray(prodotto)) return null;
  const value = prodotto as Record<string, unknown>;
  if (value.tipo === "infissi") return "infissi";
  if (value.tipo === "schermature") return "screening";
  const hasScreeningItems = Array.isArray(value.items) || Array.isArray(value.schermature);
  const infissiFieldNames = ["vetro_nuovi", "vetro_vecchi", "materiale_nuovi", "materiale_vecchi", "nuovi_vetro", "vecchi_vetro", "nuovi_materiale", "vecchi_materiale"];
  const hasInfissiFields = infissiFieldNames.some((key) => key in value);
  if (hasScreeningItems && !hasInfissiFields) return "screening";
  if (hasInfissiFields && !hasScreeningItems) return "infissi";
  return null;
}

const compact = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function evidence(sourceId: string, value: string) {
  const normalized = compact(value);
  const screening = [
    /fornitura(?:\s+e\s+posa)?(?:\s+in\s+opera)?(?:\s+di)?(?:\s+n[.°º]?\s*\d+)?\s+(?:persian|avvolgibil|tapparell|tend[ae]\s+da\s+sole|zanzarier)\w*/g,
    /scheda\s+ordine\s+(?:persian|avvolgibil|tapparell)\w*/g,
    /\b(?:persian|avvolgibil|tapparell)\w*\s+in\s+alluminio\b/g,
  ].flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => `${sourceId}:${match[0]}`));
  // Regola generale di Giuliano (2026-09-07): il portoncino (blindato o
  // d'ingresso) e' un infisso a tutti gli effetti, non un prodotto a parte o
  // ambiguo.
  const infissi = [
    /fornitura(?:\s+e\s+posa)?(?:\s+in\s+opera)?(?:\s+di)?(?:\s+n[.°º]?\s*\d+)?[:\s]+(?:serrament|infiss|finestre?|portefinestre?|portoncin|porta\s*(?:blindat|d['’]ingress)\w*)\w*/g,
    /(?:serrament|infiss|finestre?|portefinestre?|portoncin)\w*\s+in\s+(?:pvc|legno|alluminio)\b/g,
    /\b(?:serrament|infiss|finestre?|portefinestre?|portoncin)\w*\s+(?:pvc|legno|alluminio)\b/g,
    /dichiarazione\s+di\s+prestazione[^.]{0,160}(?:finestr|serrament|infiss|portoncin)\w*/g,
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
  formDeclaredModule?: "screening" | "infissi" | null;
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
  const formDeclaredModule = input.formDeclaredModule ?? null;
  // L'evidenza documentale reale resta sempre prioritaria e puo' correggere
  // un'etichetta CRM discordante, come gia' garantito. Un'etichetta CRM
  // esplicita ("screening"/"infissi", gia' assegnata a monte) non viene
  // toccata solo perche' le fatture non aggiungono nulla: resta com'era.
  // La struttura del form cliente originario interviene come ultima
  // risorsa, prima di "unresolved", soltanto quando ne' le fatture ne'
  // un'etichetta CRM offrono alcun segnale: evita di lasciare "unresolved"
  // una pratica reale e coerente solo perche' il fornitore non ha usato le
  // parole attese in fattura (es. nome commerciale di profilo senza mai
  // scrivere "finestra"/"serramento") e la pipeline non ha mai valorizzato
  // l'etichetta di coda per quella pratica.
  const module = documented ?? declaredModule ?? formDeclaredModule ?? "unresolved";
  const source = documented ? "original_documents" as const : declaredModule ? "declared_label" as const : formDeclaredModule ? "form_declared" as const : "unresolved" as const;
  return {
    module,
    declaredModule,
    formDeclaredModule,
    source,
    screeningEvidence: [...new Set(screeningEvidence)],
    infissiEvidence: [...new Set(infissiEvidence)],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel,
      ...(source === "form_declared" ? [USER_AUTHORIZED_RULE_IDS.formDeclaredProductModulePriority] : []),
      ...(infissiEvidence.some((item) => /portoncin|porta\s*(?:blindat|d['’]ingress)/iu.test(item)) ? [USER_AUTHORIZED_RULE_IDS.portoncinoRecognizedAsInfisso] : []),
      // Regola generale definitiva di Giuliano (2026-09-08): infissi e
      // chiusura oscurante restano modulo misto anche quando l'evidenza
      // proviene da fonti/fornitori distinti, perche' l'accumulo qui sopra
      // non e' mai ristretto a una singola fonte.
      ...(module === "mixed" ? [USER_AUTHORIZED_RULE_IDS.infissiWithAdditionalScreeningCombinedPractice] : []),
    ],
  };
}
