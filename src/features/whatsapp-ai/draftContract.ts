import type { WhatsappAiCategory } from "./routingPolicy";

export interface WhatsappAiDraftInput {
  category: WhatsappAiCategory;
  text: string;
  confidence: number;
  groundingNote: string;
}

export interface WhatsappAiDraft {
  kind: "operator_draft";
  category: WhatsappAiCategory;
  text: string;
  confidence: number;
  groundingNote: string;
  requiresApproval: true;
}

function sanitizeDraftText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 2000);
}

/**
 * Contratto V1 della modalità assist.
 * Produce esclusivamente una bozza destinata all'operatore: non contiene
 * destinatario, template Meta, endpoint, token, action name o flag di invio.
 */
export function buildWhatsappOperatorDraft(input: WhatsappAiDraftInput): WhatsappAiDraft {
  return {
    kind: "operator_draft",
    category: input.category,
    text: sanitizeDraftText(input.text),
    confidence: Math.min(1, Math.max(0, input.confidence)),
    groundingNote: input.groundingNote.trim().slice(0, 300),
    requiresApproval: true,
  };
}
