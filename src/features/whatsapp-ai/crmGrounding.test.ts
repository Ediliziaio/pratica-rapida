import { describe, expect, it } from "vitest";
import { evaluateWhatsappCrmGrounding } from "./crmGrounding";

describe("WhatsApp CRM grounding", () => {
  it("rifiuta conversazioni non collegate a una pratica", () => {
    expect(evaluateWhatsappCrmGrounding({
      conversationPracticeId: null,
      conversationPhone: "+39 333 1234567",
      practiceId: "practice-1",
      practiceCustomerPhone: "+39 333 1234567",
    }).grounded).toBe(false);
  });

  it("rifiuta una pratica diversa da quella collegata", () => {
    expect(evaluateWhatsappCrmGrounding({
      conversationPracticeId: "practice-1",
      conversationPhone: "+39 333 1234567",
      practiceId: "practice-2",
      practiceCustomerPhone: "+39 333 1234567",
    }).grounded).toBe(false);
  });

  it("rifiuta mismatch del telefono per evitare leak tra clienti", () => {
    expect(evaluateWhatsappCrmGrounding({
      conversationPracticeId: "practice-1",
      conversationPhone: "+39 333 1234567",
      practiceId: "practice-1",
      practiceCustomerPhone: "+39 333 7654321",
    }).grounded).toBe(false);
  });

  it("accetta prefissi formattati diversamente se la parte significativa coincide", () => {
    expect(evaluateWhatsappCrmGrounding({
      conversationPracticeId: "practice-1",
      conversationPhone: "+39 333 123 4567",
      practiceId: "practice-1",
      practiceCustomerPhone: "3331234567",
    })).toEqual({
      grounded: true,
      reason: "Pratica collegata e telefono cliente coerente",
    });
  });

  it("resta fail-closed se manca un telefono verificabile", () => {
    expect(evaluateWhatsappCrmGrounding({
      conversationPracticeId: "practice-1",
      conversationPhone: "+39 333 1234567",
      practiceId: "practice-1",
      practiceCustomerPhone: null,
    }).grounded).toBe(false);
  });
});
