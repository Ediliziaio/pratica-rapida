import { describe, expect, it } from "vitest";
import { buildWhatsappOperatorDraft } from "./draftContract";

describe("WhatsApp AI operator draft contract", () => {
  it("produce sempre una bozza che richiede approvazione", () => {
    expect(buildWhatsappOperatorDraft({
      category: "approved_faq",
      text: "  Testo suggerito  ",
      confidence: 0.97,
      groundingNote: "FAQ approvata",
    })).toEqual({
      kind: "operator_draft",
      category: "approved_faq",
      text: "Testo suggerito",
      confidence: 0.97,
      groundingNote: "FAQ approvata",
      requiresApproval: true,
    });
  });

  it("non espone alcun campo capace di descrivere un invio", () => {
    const draft = buildWhatsappOperatorDraft({
      category: "practice_status",
      text: "La pratica è in lavorazione.",
      confidence: 1,
      groundingNote: "CRM verificato",
    });
    const keys = Object.keys(draft);

    expect(keys).not.toContain("to");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("send");
    expect(keys).not.toContain("endpoint");
    expect(keys).not.toContain("template");
    expect(keys).not.toContain("action");
  });

  it("normalizza limiti di sicurezza della bozza", () => {
    const draft = buildWhatsappOperatorDraft({
      category: "unknown",
      text: `\u0000${"x".repeat(2500)}`,
      confidence: 3,
      groundingNote: "y".repeat(400),
    });

    expect(draft.text).toHaveLength(2000);
    expect(draft.text).not.toContain("\u0000");
    expect(draft.confidence).toBe(1);
    expect(draft.groundingNote).toHaveLength(300);
  });
});
