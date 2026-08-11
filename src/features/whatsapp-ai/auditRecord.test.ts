import { describe, expect, it } from "vitest";
import { buildWhatsappAiAuditRecord } from "./auditRecord";

describe("WhatsApp AI audit record", () => {
  it("conserva solo metadati decisionali e scarta contenuto/prompt anche se presenti nell'input", () => {
    const record = buildWhatsappAiAuditRecord({
      conversationId: "conv-1",
      inboundMessageId: "msg-1",
      mode: "assist",
      category: "practice_status",
      action: "draft_only",
      confidence: 0.96,
      crmGrounded: true,
      reason: "Modalità assist",
      body: "Messaggio privato del cliente",
      prompt: "Prompt completo con dati sensibili",
      codiceFiscale: "RSSMRA00A00H501X",
    });

    expect(record).toEqual({
      conversation_id: "conv-1",
      inbound_message_id: "msg-1",
      ai_mode: "assist",
      category: "practice_status",
      action: "draft_only",
      confidence: 0.96,
      crm_grounded: true,
      reason: "Modalità assist",
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("Messaggio privato");
    expect(serialized).not.toContain("Prompt completo");
    expect(serialized).not.toContain("RSSMRA");
  });

  it("normalizza confidenza e limita il motivo", () => {
    expect(buildWhatsappAiAuditRecord({
      conversationId: "conv-1",
      inboundMessageId: null,
      mode: "paused",
      category: "unknown",
      action: "human_only",
      confidence: 2,
      crmGrounded: false,
      reason: "x".repeat(600),
    })).toEqual(expect.objectContaining({
      confidence: 1,
      reason: "x".repeat(500),
    }));
  });
});
