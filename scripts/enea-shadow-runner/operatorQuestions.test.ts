import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprOperatorQuestions } from "./operatorQuestions";

describe("PersistentAprOperatorQuestions", () => {
  it("riconosce il caso documentale Cm 2850/Cm 2800 come domanda e non come conversione automatica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "ordine.txt");
    writeFileSync(source, "PERGOTENDA\nProfondita\nLarghezza totale\nCm 2400\nCm 3150\nCm 2800\nCm 2850\nQta 1");
    const store = new PersistentAprOperatorQuestions(root);
    store.discoverMeasurementUnitAmbiguities({ items: [{ customerKey: "enrica-moretti", displayName: "Enrica Moretti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "enrica-moretti", documentKey: "6139d18e389ad53f46e98b2017b44011", textPath: source }] } as never, new Date("2026-08-16T09:59:00Z"));
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({ openCount: 1, questions: [{ customerKey: "enrica-moretti", status: "open", payload: { rawWidth: 2850, rawHeight: 2800, reportedUnit: "cm" } }] });
    expect(snapshot.questions[0].prompt).toContain("Confermi l'unita' reale?");
  });
  it("persiste domanda, risposta e riaccodamento idempotente attraverso un riavvio", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const first = new PersistentAprOperatorQuestions(root);
    first.requestMeasurementUnit({ id: "unit:enrica-moretti:screenings-1", customerKey: "enrica-moretti", displayName: "Enrica Moretti", field: "screenings.1.dimensions.unit", prompt: "Confermi che 2850 × 2800 sono millimetri?", evidenceText: "Larghezza totale / Profondita; Cm 2850 / Cm 2800", sourceIds: ["source-order-1504dp"], payload: { rawWidth: 2850, rawHeight: 2800, reportedUnit: "cm", description: "Pergotenda S120" } }, new Date("2026-08-16T10:00:00Z"));
    first.answer("unit:enrica-moretti:screenings-1", "millimeters", "Misure in millimetri", "operatore", "answer:enrica:mm:1", new Date("2026-08-16T10:01:00Z"));
    const afterRestart = new PersistentAprOperatorQuestions(root);
    expect(afterRestart.snapshot().pendingApplicationCount).toBe(1);
    afterRestart.markApplied("unit:enrica-moretti:screenings-1", new Date("2026-08-16T10:02:00Z"));
    afterRestart.markApplied("unit:enrica-moretti:screenings-1", new Date("2026-08-16T10:03:00Z"));
    const snapshot = afterRestart.snapshot();
    expect(snapshot.questions[0]).toMatchObject({ status: "applied", answer: { value: "millimeters", note: "Misure in millimetri" } });
    expect(snapshot.audit.filter((event) => event.type === "answer_applied")).toHaveLength(1);
  });

  it("mantiene il caso bloccato quando l'operatore risponde non determinabile", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    store.requestMeasurementUnit({ id: "unit:case-2:screenings-1", customerKey: "case-2", displayName: "Caso 2", field: "screenings.1.dimensions.unit", prompt: "Qual e' l'unita'?", evidenceText: "Dato ambiguo", sourceIds: ["source-2"], payload: { rawWidth: 250, rawHeight: 300, reportedUnit: "cm", description: "Tenda" } });
    store.answer("unit:case-2:screenings-1", "cannot_determine", "Serve il fornitore", "operatore", "answer:case-2:1");
    expect(store.snapshot()).toMatchObject({ openCount: 0, pendingApplicationCount: 0, questions: [{ status: "answered", answer: { value: "cannot_determine" } }] });
    expect(() => store.markApplied("unit:case-2:screenings-1")).toThrow("operator_answer_not_applicable");
  });

  it("regola generale (Giuliano, 2026-09-08): genera una domanda diretta 'mancano le misure, inseriscile' quando nessun candidato numerico esiste in alcun documento (Tosatti/Di Cesare/Kasermann/Mondini)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "fattura.txt");
    writeFileSync(source, "FATTURA nr. 1/2026 del 01/01/2026\nTenda da sole modello Astor senza alcuna misura riportata\nTotale documento 500,00 €");
    const store = new PersistentAprOperatorQuestions(root);
    store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "maria-sofia-tosatti", displayName: "Maria Sofia Tosatti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "maria-sofia-tosatti", documentKey: "abc123def456abc789", textPath: source }] } as never, new Date("2026-09-08T10:00:00Z"));
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({ openCount: 1, questions: [{ customerKey: "maria-sofia-tosatti", status: "open", kind: "missing_measurement" }] });
    expect(snapshot.questions[0].prompt).toContain("Mancano le misure del prodotto");
    expect(snapshot.questions[0].prompt).toContain("Inseriscile");
  });

  it("non genera alcuna domanda di misura mancante quando la pratica ha gia' un prodotto fisico o nessun documento di schermatura", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const store = new PersistentAprOperatorQuestions(root);
    const withProduct = store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "caso-gia-pronto", displayName: "Caso Gia Pronto", state: "blocked_case", report: { products: [{ widthMm: 1000 }], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(withProduct.questions).toHaveLength(0);
    const noDocuments = store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "caso-senza-documenti", displayName: "Caso Senza Documenti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(noDocuments.questions).toHaveLength(0);
  });

  it("un valore operatore digitato per una domanda 'missing_measurement' sovrascrive il payload rawWidth/rawHeight e riaccoda la pratica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const store = new PersistentAprOperatorQuestions(root);
    store.requestMissingMeasurementQuestion({ id: "measure:caso-3:fattura1", customerKey: "caso-3", displayName: "Caso 3", field: "screenings.1.dimensions", prompt: "Mancano le misure del prodotto (la tenda da sole), inseriscile.", evidenceText: "Documenti verificati privi di misura: fattura1.", sourceIds: ["fattura1"], payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "cm", description: "la tenda da sole" } });
    expect(() => store.answer("measure:caso-3:fattura1", "centimeters", "", "operatore", "answer:caso-3:1")).toThrow("operator_answer_measurement_required");
    const answered = store.answer("measure:caso-3:fattura1", "centimeters", "Misurata dal cliente", "operatore", "answer:caso-3:2", new Date("2026-09-08T10:00:00Z"), { rawWidth: 280, rawHeight: 230 });
    expect(answered.questions[0].payload).toMatchObject({ rawWidth: 280, rawHeight: 230 });
    expect(answered.questions[0].status).toBe("answered");
  });

  it("regressione Berneri: rileva la doppia lettura '2400X2500/12300X2000' e chiede all'operatore quale (se una) sia la misura reale, senza sceglierla mai automaticamente", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "fattura.txt");
    writeFileSync(source, "FATTURA nr. 2/2026 del 01/01/2026\nPergotenda misura 2400X2500/12300X2000\nTotale documento 3.000,00 €");
    const store = new PersistentAprOperatorQuestions(root);
    const state = store.discoverAmbiguousDualDimensionQuestions({ items: [{ customerKey: "enrico-berneri", displayName: "Enrico Amos Maria Berneri", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "enrico-berneri", documentKey: "berneri-fattura-1234567890abc", textPath: source }] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].prompt).toContain("2400×2500");
    expect(state.questions[0].prompt).toContain("12300×2000");
    // Nessuna scelta automatica: la domanda resta aperta con il tipo che richiede inserimento esplicito.
    expect(state.questions[0].kind).toBe("missing_measurement");
    expect(state.questions[0].appliedRuleIds).toContain("user-2026-09-08-ambiguous-dual-dimension-reading-operator-question-v1");
  });

  it("non genera la domanda di doppia lettura quando entrambe le letture candidate sono plausibili", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "fattura.txt");
    writeFileSync(source, "FATTURA nr. 3/2026 del 01/01/2026\nPergotenda misura 2400X2500/2600X2450\nTotale documento 3.000,00 €");
    const store = new PersistentAprOperatorQuestions(root);
    const state = store.discoverAmbiguousDualDimensionQuestions({ items: [{ customerKey: "caso-entrambe-plausibili", displayName: "Caso Entrambe Plausibili", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "caso-entrambe-plausibili", documentKey: "doc-entrambe-plausibili-123", textPath: source }] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(state.questions).toHaveLength(0);
  });

  it("casi Maeschi/Munafo: rileva documenti tecnici multi-fornitore (Punto Finestre/Punto Persiane, C3 Systems/Sunroom) e chiede conferma di prodotto e posizione, senza estrazione automatica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "modulo-tecnico.txt");
    writeFileSync(source, "PUNTO FINESTRE S.p.A.\nModulo ordine tecnico\nPUNTO PERSIANE\nPosizione 1");
    const store = new PersistentAprOperatorQuestions(root);
    const state = store.discoverComplexMultiVendorQuestions({ items: [{ customerKey: "marian-maeschi", displayName: "Marian Maeschi", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "marian-maeschi", documentKey: "maeschi-modulo-tecnico-1234", textPath: source }] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].prompt).toContain("piu' documenti tecnici di fornitori/posizioni diversi");
    expect(state.questions[0].appliedRuleIds).toContain("user-2026-09-08-complex-multi-vendor-technical-form-operator-question-v1");
  });
});
