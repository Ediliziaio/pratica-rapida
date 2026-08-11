import { describe, expect, it } from "vitest";
import { decideWhatsappAiAction } from "./routingPolicy";

describe("WhatsApp AI routing policy", () => {
  it("blocca sempre l'AI quando la chat e' presa in carico", () => {
    expect(decideWhatsappAiAction({
      mode: "paused",
      category: "approved_faq",
      confidence: 1,
      crmGrounded: true,
    }).action).toBe("human_only");
  });

  it("in assist prepara bozze ma non invia", () => {
    expect(decideWhatsappAiAction({
      mode: "assist",
      category: "approved_faq",
      confidence: 0.99,
      crmGrounded: true,
    }).action).toBe("draft_only");
  });

  it("non risponde sullo stato pratica senza grounding CRM", () => {
    expect(decideWhatsappAiAction({
      mode: "auto",
      category: "practice_status",
      confidence: 0.99,
      crmGrounded: false,
    }).action).toBe("human_only");
  });

  it("consente auto-send solo per categoria sicura con alta confidenza", () => {
    expect(decideWhatsappAiAction({
      mode: "auto",
      category: "missing_documents",
      confidence: 0.98,
      crmGrounded: true,
    }).action).toBe("auto_send");
  });

  it.each(["complaint", "regulatory", "price_or_discount", "exception", "unknown"] as const)(
    "manda %s sempre a una persona",
    (category) => {
      expect(decideWhatsappAiAction({
        mode: "auto",
        category,
        confidence: 1,
        crmGrounded: true,
      }).action).toBe("human_only");
    },
  );

  it("degrada a bozza se la confidenza e' sotto soglia", () => {
    expect(decideWhatsappAiAction({
      mode: "auto",
      category: "approved_faq",
      confidence: 0.89,
      crmGrounded: true,
    }).action).toBe("draft_only");
  });

  it("blocca su mismatch sensibile anche in categoria sicura", () => {
    expect(decideWhatsappAiAction({
      mode: "auto",
      category: "practice_status",
      confidence: 1,
      crmGrounded: true,
      hasSensitiveDataMismatch: true,
    }).action).toBe("human_only");
  });
});
