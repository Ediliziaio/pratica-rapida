import { describe, expect, it } from "vitest";
import { activeResponseForQuestion, aprQuestionDocumentFingerprint, detectRepeatedOperatorQuestions, questionRetirementReason } from "./operatorQuestionLifecycle";
import type { AprOperatorResponseEntry } from "./operatorResponseLedger";

const response = (over: Partial<AprOperatorResponseEntry> = {}): AprOperatorResponseEntry => ({
  responseId: "response:crm-ombra:infissi:caso:chiusure:20260914080000",
  customerKey: "caso",
  displayName: "Caso",
  practiceId: "practice-1",
  receivedAt: "2026-09-14T08:00:00.000Z",
  source: "giuliano_crm_ombra",
  question: "Sono presenti chiusure oscuranti?",
  answer: "Si'",
  payload: { kind: "operator_required", operatorQuestion: "Sono presenti chiusure oscuranti?", missingDocumentType: null, field: "shading_closures", originatingQuestionId: "infissi:caso:chiusure" },
  status: "active",
  supersedesResponseId: null,
  appliedRuleIds: ["user-2026-09-11-operator-response-runtime-consumption-v1"],
  ...over,
});

const question = {
  id: "infissi:caso:chiusure",
  customerKey: "caso",
  practiceId: "practice-1",
  field: "shading_closures",
  prompt: "Sono presenti chiusure oscuranti?",
  status: "open" as const,
  blockerCode: "infissi_shading_closures_form_answer_missing_or_ambiguous",
  requestedAt: "2026-09-14T07:00:00.000Z",
  documentKeys: ["doc-a", "doc-b"],
};

describe("ciclo vita domande operatore", () => {
  it("trova la risposta tipizzata per cliente, pratica, campo e domanda originaria", () => {
    expect(activeResponseForQuestion(question, [response()])?.responseId).toContain("crm-ombra");
    expect(activeResponseForQuestion({ ...question, practiceId: "altra-pratica" }, [response()])).toBeNull();
  });

  it("accetta durante la migrazione screening_products per una domanda di misure", () => {
    const products = response({
      responseId: "response:dimensions:caso:20260914",
      question: "Quali misure?",
      payload: { kind: "screening_products", products: [{ description: "Pergola", quantity: 1, widthMm: 4000, heightMm: 3000 }] },
    });
    expect(activeResponseForQuestion({ ...question, id: "measure:caso:doc", field: "screenings.1.dimensions", prompt: "Mancano le misure?" }, [products])).toBe(products);
  });

  it("non applica una risposta caso-specifica quando manca la practice corrispondente", () => {
    expect(activeResponseForQuestion({ ...question, practiceId: null }, [response()])).toBeNull();
  });

  it("ritira per risposta attiva, pratica salvata o blocker scomparso", () => {
    expect(questionRetirementReason(question, null, [response()])).toMatchObject({ kind: "active_response" });
    expect(questionRetirementReason(question, { customerKey: "caso", state: "saved", blockerCodes: [] }, [])).toMatchObject({ kind: "case_saved" });
    expect(questionRetirementReason(question, { customerKey: "caso", state: "blocked_case", blockerCodes: ["altro"] }, [])).toMatchObject({ kind: "blocker_resolved" });
  });

  it("non ritira se il blocker e' ancora presente e non c'e' risposta", () => {
    expect(questionRetirementReason(question, { customerKey: "caso", state: "blocked_case", blockerCodes: [question.blockerCode] }, [])).toBeNull();
  });

  it("certifica una domanda ripetuta solo con risposta precedente e fascicolo invariato", () => {
    const current = { ...question, id: "infissi:caso:chiusure:nuova", requestedAt: "2026-09-14T09:00:00.000Z" };
    const repeats = detectRepeatedOperatorQuestions([current], [question], [response()]);
    expect(repeats).toHaveLength(1);
    expect(repeats[0]).toMatchObject({ customerKey: "caso", field: "shading_closures" });
    expect(detectRepeatedOperatorQuestions([{ ...current, documentKeys: ["doc-nuovo"] }], [question], [response()])).toEqual([]);
  });

  it("l'impronta dei documenti e' stabile rispetto a ordine e duplicati", () => {
    expect(aprQuestionDocumentFingerprint(["b", "a", "a"])).toBe(aprQuestionDocumentFingerprint(["a", "b"]));
  });
});
