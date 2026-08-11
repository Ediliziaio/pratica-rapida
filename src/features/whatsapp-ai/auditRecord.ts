import type { WhatsappAiAction, WhatsappAiCategory, WhatsappAiMode } from "./routingPolicy";

export interface WhatsappAiAuditInput {
  conversationId: string;
  inboundMessageId: string | null;
  mode: WhatsappAiMode;
  category: WhatsappAiCategory;
  action: WhatsappAiAction;
  confidence: number;
  crmGrounded: boolean;
  reason: string;
  [key: string]: unknown;
}

export interface WhatsappAiAuditRecord {
  conversation_id: string;
  inbound_message_id: string | null;
  ai_mode: WhatsappAiMode;
  category: WhatsappAiCategory;
  action: WhatsappAiAction;
  confidence: number;
  crm_grounded: boolean;
  reason: string;
}

/**
 * L'audit conserva la decisione e il perché, non il contenuto della chat o il
 * prompt. Questo rende verificabile l'automazione senza duplicare dati clienti.
 */
export function buildWhatsappAiAuditRecord(input: WhatsappAiAuditInput): WhatsappAiAuditRecord {
  return {
    conversation_id: input.conversationId,
    inbound_message_id: input.inboundMessageId,
    ai_mode: input.mode,
    category: input.category,
    action: input.action,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    crm_grounded: input.crmGrounded,
    reason: input.reason.slice(0, 500),
  };
}
