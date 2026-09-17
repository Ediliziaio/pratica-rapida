import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprOperatorQuestions } from "./operatorQuestions";
import { OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID, PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";

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

  it("regressione Tosatti: le misure manoscritte della finestra protetta generano la domanda decisionale esatta senza essere applicate al prodotto", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "modulo-cartaceo.txt");
    writeFileSync(source, "SCHERMATURA SOLARE\nTenda da sole\nDimensioni finestra protetta\n240 x 180 cm\nFirma cliente");
    const store = new PersistentAprOperatorQuestions(root);
    store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "maria-sofia-tosatti", displayName: "Maria Sofia Tosatti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "maria-sofia-tosatti", documentKey: "tosatti-form-1234567890", textPath: source }] } as never, new Date("2026-09-09T12:00:00Z"));
    const question = store.snapshot().questions[0];
    expect(question).toMatchObject({
      customerKey: "maria-sofia-tosatti",
      classification: "operator_required",
      exactCause: "Misure presenti soltanto nello spazio manoscritto della finestra protetta; serve decidere se coincidono con il prodotto.",
      missingDocumentType: null,
    });
    expect(question.prompt).toBe('Vuoi usare per la tenda da sole le misure scritte a mano nello spazio "Dimensioni finestra protetta" (240 x 180 cm), oppure richiederne di nuove?');
    expect(question.onboardingGap).toContain("larghezza e altezza del prodotto");
    expect(question.payload).toMatchObject({ rawWidth: null, rawHeight: null, reportedUnit: null });
  });

  it("non genera alcuna domanda di misura mancante quando la pratica ha gia' un prodotto fisico o nessun documento di schermatura", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const store = new PersistentAprOperatorQuestions(root);
    const withProduct = store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "caso-gia-pronto", displayName: "Caso Gia Pronto", state: "blocked_case", report: { products: [{ widthMm: 1000 }], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(withProduct.questions).toHaveLength(0);
    const noDocuments = store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "caso-senza-documenti", displayName: "Caso Senza Documenti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [] } as never, new Date("2026-09-08T10:00:00Z"));
    expect(noDocuments.questions).toHaveLength(0);
  });

  it("non genera e ritira domande dimensionali per chiusure della pratica Infissi ma conserva la domanda per una schermatura autonoma", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const closureSource = path.join(root, "fattura-infissi.txt");
    const standaloneSource = path.join(root, "fattura-schermatura.txt");
    writeFileSync(closureSource, "FATTURA\nInfissi con n. 2 persiane\nTotale documento 4.000,00 euro");
    writeFileSync(standaloneSource, "FATTURA\nTenda da sole senza misure\nTotale documento 1.000,00 euro");
    const store = new PersistentAprOperatorQuestions(root);
    const blocked = { items: [
      { customerKey: "caso-infissi", displayName: "Caso Infissi", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } },
      { customerKey: "caso-schermatura", displayName: "Caso Schermatura", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } },
    ] } as never;
    const analyzed = { items: [
      { customerKey: "caso-infissi", documentKey: "fattura-infissi-123456", textPath: closureSource },
      { customerKey: "caso-schermatura", documentKey: "fattura-screening-12345", textPath: standaloneSource },
    ] } as never;
    const infissiContext = { items: [{ customerKey: "caso-infissi", productModule: "mixed" as const }] };

    store.discoverMissingMeasurementQuestions(blocked, analyzed, new Date("2026-09-11T10:00:00Z"), infissiContext);
    expect(store.snapshot().questions.map((question) => question.customerKey)).toEqual(["caso-schermatura"]);

    store.requestMissingMeasurementQuestion({
      id: "measure:caso-infissi:storica",
      customerKey: "caso-infissi",
      displayName: "Caso Infissi",
      field: "screenings.1.dimensions",
      prompt: "Mancano le misure della persiana.",
      evidenceText: "Domanda storica errata.",
      sourceIds: ["fattura-infissi-123456"],
      payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: "la persiana" },
    }, new Date("2026-09-11T10:01:00Z"));
    const retired = store.retireInfissiClosureMeasurementQuestions(infissiContext, new Date("2026-09-11T10:02:00Z"));
    expect(retired.questions.find((question) => question.customerKey === "caso-infissi")).toMatchObject({
      status: "retired",
      appliedRuleIds: expect.arrayContaining(["user-2026-09-11-infissi-closure-measurements-not-applicable-v1"]),
    });
    expect(retired.questions.find((question) => question.customerKey === "caso-schermatura")).toMatchObject({ status: "open" });
    expect(retired.audit.at(-1)).toMatchObject({ type: "question_retired", questionId: "measure:caso-infissi:storica" });
  });

  it("un valore operatore digitato per una domanda 'missing_measurement' sovrascrive il payload rawWidth/rawHeight e riaccoda la pratica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const store = new PersistentAprOperatorQuestions(root);
    store.requestMissingMeasurementQuestion({ id: "measure:caso-3:fattura1", customerKey: "caso-3", displayName: "Caso 3", field: "screenings.1.dimensions", prompt: "Mancano le misure del prodotto (la tenda da sole), inseriscile.", evidenceText: "Documenti verificati privi di misura: fattura1.", sourceIds: ["fattura1"], payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: "la tenda da sole" } });
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

  it("domande operatore: una misura assente persiste valori null e mai il segnaposto 1x1", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "fattura.txt");
    writeFileSync(source, "FATTURA\nTenda da sole priva di dimensioni\nTotale documento 500,00");
    const store = new PersistentAprOperatorQuestions(root);
    const state = store.discoverMissingMeasurementQuestions({ items: [{ customerKey: "misura-assente", displayName: "Misura Assente", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "misura-assente", documentKey: "fattura-misura-assente", textPath: source }] } as never);
    expect(state.questions[0].payload).toEqual(expect.objectContaining({ rawWidth: null, rawHeight: null, reportedUnit: null }));
    expect(JSON.stringify(state.questions[0])).not.toContain('"rawWidth":1');
  });

  it("domande operatore Infissi: persiste la domanda formulata dal blocker Infissi", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    const state = store.discoverInfissiBlockerQuestions({ items: [{
      customerKey: "caso-infissi", displayName: "Caso Infissi", productModule: "infissi", state: "blocked_case",
      report: { blockers: [{ code: "infissi_shading_closures_form_answer_missing_or_ambiguous", field: "shading_closures", sourceIds: ["fattura-1"], classification: "operator_required", operatorQuestion: "Confermi se sono presenti chiusure oscuranti?", exactCause: "Fonti discordanti." }] },
    }] });
    expect(state.questions[0]).toMatchObject({ customerKey: "caso-infissi", kind: "case_decision", prompt: "Confermi se sono presenti chiusure oscuranti?", payload: { rawWidth: null, rawHeight: null, blockerCode: "infissi_shading_closures_form_answer_missing_or_ambiguous" } });
    expect(state.questions[0].appliedRuleIds).toContain("user-2026-09-12-infissi-blocker-question-persistence-v1");
  });

  it("domande operatore Infissi: non inventa una domanda per un technical_block", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    const state = store.discoverInfissiBlockerQuestions({ items: [{ customerKey: "caso-tecnico", displayName: "Caso Tecnico", state: "blocked_case", report: { blockers: [{ code: "infissi_parser_crash", field: "technical", sourceIds: ["doc"], classification: "technical_block" }] } }] });
    expect(state.questions).toHaveLength(0);
  });

  it("persiste immediatamente la domanda derivata da una disposizione terminale non salvata", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    const result = store.persistStoppedCaseDisposition({
      customerKey: "caso-misure-fermo",
      displayName: "Caso Misure Fermo",
      state: "operator_required",
      blockerCodes: ["infissi_dimensions_and_cardinality_missing"],
      blockerReasons: { infissi_dimensions_and_cardinality_missing: "Misure e cardinalita non ricostruite." },
      executionState: null,
      executionReason: null,
      persistedQuestionCount: 0,
      documentsAcquired: true,
      sourceIds: ["fattura-1", "certificato-1"],
    }, new Date("2026-09-13T20:00:00Z"));
    expect(result.disposition).toMatchObject({ kind: "domanda_operatore", alreadyAsked: false });
    expect(result.state.questions).toHaveLength(1);
    expect(result.state.questions[0]).toMatchObject({
      customerKey: "caso-misure-fermo",
      displayName: "Caso Misure Fermo",
      field: "infissi.dimensioni_e_numero",
      status: "open",
      payload: { blockerCode: "infissi_dimensions_and_cardinality_missing" },
    });
    expect(result.state.questions[0].prompt).toMatch(/^Puoi indicare .+\?$/);
  });

  it("non duplica la domanda per la stessa pratica e lo stesso blocker dopo un riavvio", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const input = {
      customerKey: "caso-idempotente",
      displayName: "Caso Idempotente",
      state: "operator_required",
      blockerCodes: ["tax_code_missing_or_invalid"],
      executionState: null,
      executionReason: null,
      persistedQuestionCount: 0,
      documentsAcquired: true,
      sourceIds: ["modulo-cliente"],
    } as const;
    new PersistentAprOperatorQuestions(root).persistStoppedCaseDisposition(input, new Date("2026-09-13T20:01:00Z"));
    const afterRestart = new PersistentAprOperatorQuestions(root).persistStoppedCaseDisposition(input, new Date("2026-09-13T20:02:00Z"));
    expect(afterRestart.disposition.alreadyAsked).toBe(true);
    expect(afterRestart.state.questions).toHaveLength(1);
    expect(afterRestart.state.audit.filter((event) => event.type === "question_opened")).toHaveLength(1);
  });

  it("un guasto APR terminale resta dichiarato ma non genera una domanda operatore", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    const result = store.persistStoppedCaseDisposition({
      customerKey: "caso-timeout",
      displayName: "Caso Timeout",
      state: "technical_block",
      blockerCodes: [],
      executionState: "operator_intervention",
      executionReason: "CRM timeout 504",
      persistedQuestionCount: 0,
      documentsAcquired: true,
      sourceIds: ["dossier-1"],
    });
    expect(result.disposition.kind).toBe("guasto_apr");
    expect(result.state.questions).toHaveLength(0);
  });

  it("non riapre una domanda di misure quando il ledger globale contiene gia' la risposta realmente applicata", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const responseLedger = new PersistentAprOperatorResponseLedger(root);
    responseLedger.importResponses([{
      responseId: "response:dimensions:caso-risposto:20260914",
      customerKey: "caso-risposto",
      displayName: "Caso Risposto",
      practiceId: "practice-risposta",
      receivedAt: "2026-09-14T08:00:00.000Z",
      source: "giuliano_crm_ombra",
      question: "Quali sono le misure?",
      answer: "Una tenda 400 x 300 cm.",
      payload: { kind: "screening_products", products: [{ description: "Tenda", quantity: 1, widthMm: 4000, heightMm: 3000 }] },
      status: "active",
      supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }], new Date("2026-09-14T08:00:00.000Z"));
    responseLedger.recordApplications([{
      responseId: "response:dimensions:caso-risposto:20260914",
      customerKey: "caso-risposto",
      practiceId: "practice-risposta",
      runRoot: root,
      sourceFingerprint: "f".repeat(64),
      outcome: "applied",
      evidence: "report.products=4000x3000",
      appliedAt: "2026-09-14T08:30:00.000Z",
    }], new Date("2026-09-14T08:30:00.000Z"));
    const store = new PersistentAprOperatorQuestions(root);
    const state = store.requestMissingMeasurementQuestion({
      id: "measure:caso-risposto:documento",
      customerKey: "caso-risposto",
      practiceId: "practice-risposta",
      displayName: "Caso Risposto",
      field: "screenings.1.dimensions",
      prompt: "Mancano le misure della tenda, inseriscile.",
      evidenceText: "Nessuna misura automatica.",
      sourceIds: ["documento"],
      payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: "tenda" },
    }, new Date("2026-09-14T09:00:00.000Z"));
    expect(state.questions).toHaveLength(0);
    expect(state.audit.at(-1)?.reason).toContain("esiste gia' la risposta attiva");
  });

  it("ritira una domanda aperta quando il blocker scompare dal caso", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const store = new PersistentAprOperatorQuestions(root);
    store.requestCaseDecisionQuestion({
      id: "infissi:caso-chiuso:chiusure",
      customerKey: "caso-chiuso",
      practiceId: "practice-chiusa",
      displayName: "Caso Chiuso",
      field: "shading_closures",
      prompt: "Sono presenti chiusure oscuranti?",
      evidenceText: "Risposta non disponibile.",
      sourceIds: ["fattura"],
      payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: "chiusure", blockerCode: "infissi_shading_closures_form_answer_missing_or_ambiguous" },
    }, new Date("2026-09-14T08:00:00.000Z"));
    const state = store.retireResolvedQuestions({ items: [{
      customerKey: "caso-chiuso",
      practiceId: "practice-chiusa",
      state: "ready_local_plan",
      report: { blockers: [] },
    }] }, [], new Date("2026-09-14T09:00:00.000Z"));
    expect(state.questions[0]).toMatchObject({ status: "retired", appliedAt: "2026-09-14T09:00:00.000Z" });
    expect(state.audit.at(-1)?.reason).toContain("non e' piu' presente");
  });
});
