import { describe, expect, it } from "vitest";
import { emptyFormData } from "@/types/form-cliente";
import { validateDocumenti } from "./validation";
import { validateDynamicStep } from "./dynamicValidation";
import {
  allPracticeAttachmentPaths,
  hydrateDynamicAttachments,
  hydrateHardcodedAttachments,
  normalizePracticeAttachments,
} from "./practiceAttachments";

const invoice = "practice/fattura/fattura.pdf";
const certificate = "practice/documenti/certificato.pdf";

describe("the public form reads practice attachment columns", () => {
  it("shows and accepts an invoice present only in fatture_urls", () => {
    const attachments = normalizePracticeAttachments({ fatture_urls: [invoice] });
    const draft = emptyFormData();
    draft.documenti.finanziamento = "si";
    const displayed = hydrateHardcodedAttachments(draft, attachments);
    expect(displayed.documenti.fattura_url).toBe(invoice);
    expect(draft.documenti.fattura_url).toBeUndefined();
    expect(validateDocumenti(displayed)).not.toHaveProperty("documenti.fattura_url");

    const step = { key: "documenti", label: "Documenti", fields: [{
      key: "fattura_url", label: "Fattura", type: "upload" as const, required: true,
    }] };
    const answerSnapshot = {};
    const dynamic = hydrateDynamicAttachments(answerSnapshot, { steps: [step] }, attachments);
    expect(dynamic.documenti.fattura_url).toBe(invoice);
    expect(answerSnapshot).toEqual({});
    expect(validateDynamicStep(step, dynamic)).toEqual({});
  });

  it("shows an additional document from the columns even without a dati_form reference", () => {
    const attachments = normalizePracticeAttachments({ documenti_aggiuntivi_urls: [certificate] });
    expect(allPracticeAttachmentPaths(attachments)).toEqual([certificate]);
  });

  it("does not trust a stale dati_form upload that is absent from the columns", () => {
    const draft = emptyFormData();
    draft.documenti.fattura_url = invoice;
    draft.documenti.finanziamento = "si";
    const displayed = hydrateHardcodedAttachments(draft, normalizePracticeAttachments({}));
    expect(displayed.documenti.fattura_url).toBe("");
    expect(validateDocumenti(displayed)).toHaveProperty("documenti.fattura_url");
  });

  it("keeps a newly uploaded file visible before the next practice save", () => {
    const draft = emptyFormData();
    draft.documenti.fattura_url = invoice;
    const displayed = hydrateHardcodedAttachments(draft, normalizePracticeAttachments({}), new Set([invoice]));
    expect(displayed.documenti.fattura_url).toBe(invoice);
  });

  it("keeps a remembered technical file only when the canonical column contains it", () => {
    const step = { key: "documenti", label: "Documenti", fields: [{
      key: "certificato_url", label: "Certificato", type: "upload" as const, required: true,
    }] };
    const data = { documenti: { certificato_url: certificate } };
    const present = hydrateDynamicAttachments(data, { steps: [step] },
      normalizePracticeAttachments({ documenti_aggiuntivi_urls: [certificate] }));
    expect(validateDynamicStep(step, present)).toEqual({});
    const missing = hydrateDynamicAttachments(data, { steps: [step] }, normalizePracticeAttachments({}));
    expect(validateDynamicStep(step, missing)).toHaveProperty("documenti.certificato_url");
  });
});
