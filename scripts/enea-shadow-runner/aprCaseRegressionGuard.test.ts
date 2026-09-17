import { describe, expect, it } from "vitest";
import { aprCaseDocumentFingerprint, detectAprCaseRegressions, detectAprCasesJudgedWithoutDocuments, type AprCaseOutcomeRecord } from "./aprCaseRegressionGuard";

const record = (over: Partial<AprCaseOutcomeRecord> = {}): AprCaseOutcomeRecord => ({
  customerKey: "eugenio-codognato",
  runId: "lotto-corrente",
  observedAt: "2026-09-13T08:39:00.000Z",
  state: "technical_block",
  documentKeys: ["doc-a", "doc-b", "doc-c"],
  ...over,
});

const salvataPrima = (over: Partial<AprCaseOutcomeRecord> = {}) => record({
  runId: "lotto-precedente", observedAt: "2026-09-08T20:00:00.000Z", state: "saved", ...over,
});

describe("cricchetto: una pratica salvata non puo' essere ribloccata a documenti invariati", () => {
  it("riconosce la regressione quando il fascicolo e' identico", () => {
    const [regressione] = detectAprCaseRegressions([record()], [salvataPrima()]);
    expect(regressione).toMatchObject({
      customerKey: "eugenio-codognato", previousRunId: "lotto-precedente", currentState: "technical_block",
    });
    expect(regressione.reason).toContain("difetto del cancello");
  });

  it("non dichiara regressione se i documenti sono cambiati", () => {
    const conNuovoDocumento = record({ documentKeys: ["doc-a", "doc-b", "doc-c", "doc-nuovo"] });
    expect(detectAprCaseRegressions([conNuovoDocumento], [salvataPrima()])).toEqual([]);
  });

  it("non dichiara regressione se la pratica e' ancora salvata", () => {
    expect(detectAprCaseRegressions([record({ state: "saved" })], [salvataPrima()])).toEqual([]);
  });

  it("non dichiara regressione se non era mai stata salvata", () => {
    expect(detectAprCaseRegressions([record()], [salvataPrima({ state: "operator_required" })])).toEqual([]);
  });

  it("ignora i giri senza documenti acquisiti, che non provano nulla", () => {
    expect(detectAprCaseRegressions([record({ documentKeys: [] })], [salvataPrima()])).toEqual([]);
    expect(detectAprCaseRegressions([record()], [salvataPrima({ documentKeys: [] })])).toEqual([]);
  });

  it("usa il salvataggio piu' recente quando la pratica e' stata salvata piu' volte", () => {
    const storia = [
      salvataPrima({ runId: "vecchio", observedAt: "2026-09-02T10:00:00.000Z" }),
      salvataPrima({ runId: "recente", observedAt: "2026-09-09T22:00:00.000Z" }),
    ];
    expect(detectAprCaseRegressions([record()], storia)[0]).toMatchObject({ previousRunId: "recente" });
  });

  it("l'identita' del fascicolo non dipende dall'ordine dei documenti", () => {
    expect(aprCaseDocumentFingerprint({ documentKeys: ["b", "a"] }))
      .toBe(aprCaseDocumentFingerprint({ documentKeys: ["a", "b", "a"] }));
  });

  it("distingue una pratica giudicata senza fascicolo da una ferma vera", () => {
    const senzaDocumenti = record({ customerKey: "elena-depalma", documentKeys: [] });
    const [caso] = detectAprCasesJudgedWithoutDocuments([senzaDocumenti, record()]);
    expect(caso).toMatchObject({ customerKey: "elena-depalma", state: "technical_block" });
    expect(caso.reason).toContain("va rilavorata");
    expect(detectAprCasesJudgedWithoutDocuments([record({ state: "saved", documentKeys: [] })])).toEqual([]);
  });

  it("non confronta un lotto con se stesso", () => {
    const stesso = salvataPrima({ runId: "lotto-corrente", observedAt: "2026-09-13T07:00:00.000Z" });
    expect(detectAprCaseRegressions([record({ runId: "lotto-corrente" })], [stesso])).toEqual([]);
  });
});
