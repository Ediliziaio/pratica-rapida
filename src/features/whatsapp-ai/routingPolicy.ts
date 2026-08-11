export type WhatsappAiMode = "assist" | "auto" | "paused";

export type WhatsappAiCategory =
  | "practice_status"
  | "missing_documents"
  | "approved_faq"
  | "complaint"
  | "regulatory"
  | "price_or_discount"
  | "exception"
  | "unknown";

export interface WhatsappAiDecisionInput {
  mode: WhatsappAiMode;
  category: WhatsappAiCategory;
  confidence: number;
  crmGrounded: boolean;
  hasSensitiveDataMismatch?: boolean;
}

export type WhatsappAiAction = "human_only" | "draft_only" | "auto_send";

export interface WhatsappAiDecision {
  action: WhatsappAiAction;
  reason: string;
}

const AUTO_SAFE_CATEGORIES = new Set<WhatsappAiCategory>([
  "practice_status",
  "missing_documents",
  "approved_faq",
]);

const HUMAN_REQUIRED_CATEGORIES = new Set<WhatsappAiCategory>([
  "complaint",
  "regulatory",
  "price_or_discount",
  "exception",
  "unknown",
]);

/**
 * Gate deterministico che separa la classificazione AI dall'azione reale.
 * Nessun modello puo' bypassare questo livello: l'autoinvio richiede
 * contemporaneamente modalita' auto, categoria consentita, alta confidenza
 * e dati ancorati al CRM quando la risposta riguarda il cliente/pratica.
 */
export function decideWhatsappAiAction(input: WhatsappAiDecisionInput): WhatsappAiDecision {
  if (input.mode === "paused") {
    return { action: "human_only", reason: "Presa in carico umana attiva" };
  }

  if (input.hasSensitiveDataMismatch) {
    return { action: "human_only", reason: "Dati sensibili o identita non coerenti" };
  }

  if (HUMAN_REQUIRED_CATEGORIES.has(input.category)) {
    return { action: "human_only", reason: "Categoria riservata a operatore umano" };
  }

  if (input.confidence < 0.9) {
    return { action: "draft_only", reason: "Confidenza insufficiente per risposta automatica" };
  }

  if ((input.category === "practice_status" || input.category === "missing_documents") && !input.crmGrounded) {
    return { action: "human_only", reason: "Risposta sulla pratica non ancorata a dati CRM" };
  }

  if (input.mode !== "auto") {
    return { action: "draft_only", reason: "Modalita assist: prepara soltanto una bozza" };
  }

  if (!AUTO_SAFE_CATEGORIES.has(input.category)) {
    return { action: "human_only", reason: "Categoria non autorizzata all'autoinvio" };
  }

  return { action: "auto_send", reason: "Categoria sicura, alta confidenza e policy soddisfatta" };
}
