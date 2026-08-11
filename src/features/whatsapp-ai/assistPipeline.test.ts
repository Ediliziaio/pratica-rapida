import { describe, expect, it } from "vitest";
import { runWhatsappAssistPipeline } from "./assistPipeline";

const grounded = {
  conversationPracticeId: "practice-1",
  conversationPhone: "+39 333 1234567",
  practiceId: "practice-1",
  practiceCustomerPhone: "3331234567",
};

describe("WhatsApp Assist pipeline", () => {
  it("in assist produce una bozza approvabile e audit, senza invio", () => {
    const result = runWhatsappAssistPipeline({
      conversationId: "conv-1",
      inboundMessageId: "msg-1",
      mode: "assist",
      category: "practice_status",
      confidence: 0.98,
      grounding: grounded,
      suggestedText: "La pratica è in lavorazione.",
      groundingNote: "Stato letto dal CRM",
    });

    expect(result.action).toBe("draft_only");
    expect(result.grounding.grounded).toBe(true);
    expect(result.draft).toEqual(expect.objectContaining({
      kind: "operator_draft",
      requiresApproval: true,
    }));
    expect(result.audit).toEqual(expect.objectContaining({
      action: "draft_only",
      crm_grounded: true,
    }));
  });

  it("resta fail-closed se il telefono non coincide", () => {
    const result = runWhatsappAssistPipeline({
      conversationId: "conv-1",
      inboundMessageId: "msg-1",
      mode: "assist",
      category: "practice_status",
      confidence: 1,
      grounding: {
        ...grounded,
        practiceCustomerPhone: "3337654321",
      },
      suggestedText: "Testo che non deve essere proposto.",
      groundingNote: "Mismatch",
    });

    expect(result.action).toBe("human_only");
    expect(result.grounding.grounded).toBe(false);
    expect(result.draft).toBeNull();
    expect(result.audit.crm_grounded).toBe(false);
  });

  it("reclami restano umani anche con identità e confidenza perfette", () => {
    const result = runWhatsappAssistPipeline({
      conversationId: "conv-1",
      inboundMessageId: "msg-1",
      mode: "assist",
      category: "complaint",
      confidence: 1,
      grounding: grounded,
      suggestedText: "Risposta al reclamo",
      groundingNote: "CRM verificato",
    });

    expect(result.action).toBe("human_only");
    expect(result.draft).toBeNull();
  });

  it("anche una decisione policy auto_send non contiene alcun effetto di invio", () => {
    const result = runWhatsappAssistPipeline({
      conversationId: "conv-1",
      inboundMessageId: "msg-1",
      mode: "auto",
      category: "missing_documents",
      confidence: 0.99,
      grounding: grounded,
      suggestedText: "Manca il bonifico parlante.",
      groundingNote: "Elenco documenti dal CRM",
    });

    expect(result.action).toBe("auto_send");
    expect(result.draft?.requiresApproval).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("endpoint");
    expect(serialized).not.toContain("access_token");
  });
});
