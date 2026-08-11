import { buildWhatsappAiAuditRecord, type WhatsappAiAuditRecord } from "./auditRecord";
import { buildWhatsappOperatorDraft, type WhatsappAiDraft } from "./draftContract";
import { evaluateWhatsappCrmGrounding, type WhatsappCrmGroundingInput } from "./crmGrounding";
import { decideWhatsappAiAction, type WhatsappAiCategory, type WhatsappAiMode } from "./routingPolicy";

export interface WhatsappAssistPipelineInput {
  conversationId: string;
  inboundMessageId: string | null;
  mode: WhatsappAiMode;
  category: WhatsappAiCategory;
  confidence: number;
  grounding: WhatsappCrmGroundingInput;
  suggestedText: string;
  groundingNote: string;
  hasSensitiveDataMismatch?: boolean;
}

export interface WhatsappAssistPipelineResult {
  action: "human_only" | "draft_only" | "auto_send";
  reason: string;
  grounding: ReturnType<typeof evaluateWhatsappCrmGrounding>;
  draft: WhatsappAiDraft | null;
  audit: WhatsappAiAuditRecord;
}

/**
 * Pipeline pura e provider-independent. Riceve una classificazione e un testo
 * già proposto, applica i gate deterministici e produce al massimo una bozza.
 * Non contiene alcuna chiamata a WhatsApp/Meta né alcun effetto collaterale.
 */
export function runWhatsappAssistPipeline(
  input: WhatsappAssistPipelineInput,
): WhatsappAssistPipelineResult {
  const grounding = evaluateWhatsappCrmGrounding(input.grounding);
  const decision = decideWhatsappAiAction({
    mode: input.mode,
    category: input.category,
    confidence: input.confidence,
    crmGrounded: grounding.grounded,
    hasSensitiveDataMismatch: input.hasSensitiveDataMismatch,
  });

  // Nella V1 laboratorio anche una futura decisione auto_send viene resa come
  // bozza: l'integrazione reale di invio non esiste in questo modulo.
  const canDraft = decision.action !== "human_only";
  const draft = canDraft
    ? buildWhatsappOperatorDraft({
        category: input.category,
        text: input.suggestedText,
        confidence: input.confidence,
        groundingNote: input.groundingNote,
      })
    : null;

  const audit = buildWhatsappAiAuditRecord({
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    mode: input.mode,
    category: input.category,
    action: decision.action,
    confidence: input.confidence,
    crmGrounded: grounding.grounded,
    reason: decision.reason,
  });

  return {
    action: decision.action,
    reason: decision.reason,
    grounding,
    draft,
    audit,
  };
}
