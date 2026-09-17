import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS,
  APR_CRM_OMBRA_EMAIL,
  APR_CRM_OMBRA_KEYCHAIN_SERVICE,
  APR_CRM_OMBRA_ORIGIN,
  type AprCrmOmbraAuthSnapshot,
  type AprCrmOmbraPatch,
} from "./crmOmbraAuth";
import {
  AprCrmOmbraAdapter,
  parseAprCrmOmbraQuestion,
  type AprCrmOmbraDataTransport,
  type AprCrmOmbraPractice,
  type AprCrmOmbraStage,
} from "./crmOmbraAdapter";
import { PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_PRACTICE_ID = "11111111-1111-4111-8111-111111111112";
const RESELLER_ID = "22222222-2222-4222-8222-222222222222";
const STAGES = {
  ready: "33333333-3333-4333-8333-333333333331",
  operator: "33333333-3333-4333-8333-333333333332",
  send: "33333333-3333-4333-8333-333333333333",
  archived: "33333333-3333-4333-8333-333333333334",
};

const snapshot = (): AprCrmOmbraAuthSnapshot => ({
  transport: "dedicated_shadow_supabase_user_session",
  supabaseOrigin: APR_CRM_OMBRA_ORIGIN,
  email: APR_CRM_OMBRA_EMAIL,
  keychainService: APR_CRM_OMBRA_KEYCHAIN_SERVICE,
  configured: true,
  authenticated: true,
  publishableKeyFingerprint: "fingerprint",
  tokenExpiresAt: "2026-09-16T23:00:00.000Z",
  productionWriteAllowed: false,
  externalCommunicationsAllowed: false,
  allowedWriteFields: APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS,
});

const stageRows: AprCrmOmbraStage[] = [
  { id: STAGES.ready, reseller_id: null, brand: "enea", stage_type: "pronte_da_fare", name: "Pronte da fare" },
  { id: STAGES.operator, reseller_id: null, brand: "enea", stage_type: "intervento_operatore", name: "Richiesto intervento operatore" },
  { id: STAGES.send, reseller_id: null, brand: "enea", stage_type: "da_inviare", name: "Da inviare" },
  { id: STAGES.archived, reseller_id: null, brand: "enea", stage_type: "archiviate", name: "Archiviate" },
];

const practice = (id = PRACTICE_ID): AprCrmOmbraPractice => ({
  id,
  reseller_id: RESELLER_ID,
  brand: "enea",
  current_stage_id: STAGES.ready,
  cliente_nome: id === PRACTICE_ID ? "Federico" : "Secondo",
  cliente_cognome: id === PRACTICE_ID ? "Marino" : "Cliente",
  prodotto_installato: "bioclimatica",
  fornitore: "Brianza Serramenti",
  note_documenti_mancanti: null,
  documenti_mancanti: [],
  note_interne: "Nota preesistente",
});

class FakeShadowTransport implements AprCrmOmbraDataTransport {
  readonly practices = new Map<string, AprCrmOmbraPractice>();
  readonly patches: Array<{ practiceId: string; expectedStageId: string; patch: AprCrmOmbraPatch }> = [];

  constructor(...rows: AprCrmOmbraPractice[]) { for (const row of rows) this.practices.set(row.id, structuredClone(row)); }
  snapshot() { return snapshot(); }
  async readPractice(practiceId: string) { return structuredClone(this.practices.get(practiceId) ?? null); }
  async readStages() { return structuredClone(stageRows); }
  async patchPractice(practiceId: string, expectedStageId: string, patchValue: AprCrmOmbraPatch) {
    const row = this.practices.get(practiceId);
    if (!row || row.current_stage_id !== expectedStageId) throw new Error("fake_compare_and_swap_failed");
    const keys = Object.keys(patchValue);
    if (keys.some((key) => !APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS.includes(key as never))) throw new Error("fake_forbidden_write");
    this.patches.push({ practiceId, expectedStageId, patch: structuredClone(patchValue) });
    Object.assign(row, patchValue);
    return structuredClone(row);
  }
}

const roots: string[] = [];
function harness(...practices: AprCrmOmbraPractice[]) {
  const root = mkdtempSync(path.join(tmpdir(), "apr-crm-ombra-adapter-"));
  roots.push(root);
  const transport = new FakeShadowTransport(...practices);
  const ledger = new PersistentAprOperatorResponseLedger(root);
  const adapter = new AprCrmOmbraAdapter(transport, ledger, root);
  return { root, transport, ledger, adapter };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("AprCrmOmbraAdapter", () => {
  it("sposta ogni arresto in intervento operatore con una domanda italiana e il documento preciso", async () => {
    const { adapter, transport } = harness(practice());
    const result = await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-001",
      question: "Puoi caricare la fattura di saldo mancante?",
      field: "economic.invoiceTotal",
      missingDocumentType: "fattura di saldo",
      now: new Date("2026-09-16T18:00:00.000Z"),
    });
    expect(result.status).toBe("question_published");
    const stored = transport.practices.get(PRACTICE_ID)!;
    expect(stored.current_stage_id).toBe(STAGES.operator);
    expect(stored.documenti_mancanti).toEqual(["fattura di saldo"]);
    expect(stored.note_documenti_mancanti).toContain("Puoi caricare la fattura di saldo mancante?");
    expect(stored.note_documenti_mancanti).toContain("Risposta operatore:");
  });

  it("tratta Potito, Ideal e RM come domande manuali, non come uscite silenziose", async () => {
    for (const supplier of ["Linea Sole Potito", "Ideal Sistem", "RM Legno"]) {
      const row = practice();
      row.fornitore = supplier;
      const { adapter, transport } = harness(row);
      await adapter.publishOperatorQuestion({
        practiceId: PRACTICE_ID,
        questionId: `manual-${supplier.replace(/\s/g, "-")}`,
        question: "I documenti sono manoscritti e APR non compila la pratica: confermi che va fatta a mano?",
        field: "operator.pendingData",
      });
      expect(transport.practices.get(PRACTICE_ID)!.current_stage_id).toBe(STAGES.operator);
    }
  });

  it("chiude una bozza salvata in da_inviare e accoda la nota senza marcare la bozza ENEA", async () => {
    const { adapter, transport } = harness(practice());
    const result = await adapter.recordSavedDraft({
      practiceId: PRACTICE_ID,
      draftId: "462287",
      draftUrl: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/462287",
      savedAt: new Date("2026-09-16T18:30:00.000Z"),
    });
    expect(transport.practices.get(PRACTICE_ID)!.current_stage_id).toBe(STAGES.send);
    expect(transport.practices.get(PRACTICE_ID)!.note_interne).toBe(
      "Nota preesistente\nBozza ENEA n. 462287, creata da APR il 2026-09-16T18:30:00.000Z, https://bonusfiscali.enea.it/pratica/ecobonus/2026/462287",
    );
    expect(result.note).not.toContain("marcatore");
  });

  it("importa la risposta nel ledger, chiude la domanda e rimette la pratica in pronte_da_fare", async () => {
    const { adapter, transport, ledger } = harness(practice());
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-002",
      question: "Qual è la data di fine lavori?",
      field: "completionDate",
    });
    const stored = transport.practices.get(PRACTICE_ID)!;
    stored.note_documenti_mancanti = `${stored.note_documenti_mancanti}2026-08-30`;
    const result = await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:00:00.000Z"));
    expect(result.status).toBe("response_imported");
    expect(stored.current_stage_id).toBe(STAGES.ready);
    expect(stored.note_documenti_mancanti).toBeNull();
    expect(ledger.projection("federico-marino", PRACTICE_ID).caseDecisions).toEqual([
      expect.objectContaining({ field: "completionDate", value: "2026-08-30" }),
    ]);
  });

  it("salva la risposta con la stessa customerKey nominale usata dal preflight", async () => {
    const { adapter, transport, ledger } = harness(practice());
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-customer-key-001",
      question: "Qual è la data di fine lavori?",
      field: "completionDate",
    });
    transport.practices.get(PRACTICE_ID)!.note_documenti_mancanti += "30/08/2026";
    await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:09:00.000Z"));
    expect(ledger.projection("federico-marino", PRACTICE_ID).caseDecisions).toEqual([
      expect.objectContaining({ field: "completionDate", value: "30/08/2026" }),
    ]);
  });

  it("archivia soltanto dopo una risposta umana non lavorabile con motivazione", async () => {
    const { adapter, transport, ledger } = harness(practice());
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-003",
      question: "Confermi che questa pratica va lavorata a mano?",
      field: "operator.pendingData",
    });
    const stored = transport.practices.get(PRACTICE_ID)!;
    stored.note_documenti_mancanti = `${stored.note_documenti_mancanti}NON LAVORABILE: documenti cartacei illeggibili`;
    const result = await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:05:00.000Z"));
    expect(result.status).toBe("archived_not_workable");
    expect(stored.current_stage_id).toBe(STAGES.archived);
    expect(stored.note_interne).toContain("documenti cartacei illeggibili");
    expect(ledger.projection("federico-marino", PRACTICE_ID).caseDisposition).toEqual(expect.objectContaining({ disposition: "not_workable" }));
  });

  it("riconosce una conferma naturale di lavorazione manuale", async () => {
    const { adapter, transport, ledger } = harness(practice());
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-manuale-001",
      question: "Confermi che questa pratica va fatta a mano?",
      field: "operator.manualDisposition",
    });
    const stored = transport.practices.get(PRACTICE_ID)!;
    stored.note_documenti_mancanti = `${stored.note_documenti_mancanti}corretto`;
    const result = await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:06:00.000Z"));
    expect(result.status).toBe("archived_not_workable");
    expect(stored.current_stage_id).toBe(STAGES.archived);
    expect(ledger.projection("federico-marino", PRACTICE_ID).caseDisposition).toEqual(expect.objectContaining({ disposition: "not_workable" }));
  });

  it("collega data completa e misure prodotto ai cinque payload runtime", async () => {
    const dateCase = practice();
    const measuresCase = practice(SECOND_PRACTICE_ID);
    const { adapter, transport, ledger } = harness(dateCase, measuresCase);
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-date-001",
      question: "Qual è la data corretta di fine lavori?",
      field: "completionDate.portalYear",
    });
    transport.practices.get(PRACTICE_ID)!.note_documenti_mancanti += "fine lavori corretta 11/07/2026";
    await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:07:00.000Z"));
    await adapter.publishOperatorQuestion({
      practiceId: SECOND_PRACTICE_ID,
      questionId: "question-measures-001",
      question: "Quali sono quantità e misure dei prodotti?",
      field: "screenings.dimensions",
    });
    transport.practices.get(SECOND_PRACTICE_ID)!.note_documenti_mancanti += "10 schermature 110 x 140 cm";
    await adapter.consumeOperatorResponse(SECOND_PRACTICE_ID, new Date("2026-09-16T19:08:00.000Z"));
    expect(ledger.projection("federico-marino", PRACTICE_ID).caseDecisions).toEqual([
      expect.objectContaining({ field: "completionDate", value: "fine lavori corretta 11/07/2026" }),
    ]);
    expect(ledger.projection("secondo-cliente", SECOND_PRACTICE_ID).caseDecisions).toEqual([
      expect.objectContaining({ field: "operator.pendingData", value: "10 schermature 110 x 140 cm" }),
    ]);
  });

  it("riusa una correzione generale sullo stesso rivenditore/tipo senza ripetere la domanda", async () => {
    const first = practice();
    const second = practice(SECOND_PRACTICE_ID);
    const { adapter, transport, ledger } = harness(first, second);
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-004",
      question: "Le chiusure oscuranti sono presenti?",
      field: "shading_closures",
    });
    const stored = transport.practices.get(PRACTICE_ID)!;
    stored.note_documenti_mancanti = `${stored.note_documenti_mancanti}CORREZIONE: sì`;
    await adapter.consumeOperatorResponse(PRACTICE_ID, new Date("2026-09-16T19:10:00.000Z"));
    const patchCount = transport.patches.length;
    const result = await adapter.publishOperatorQuestion({
      practiceId: SECOND_PRACTICE_ID,
      questionId: "question-secondo-001",
      question: "Le chiusure oscuranti sono presenti?",
      field: "shading_closures",
      now: new Date("2026-09-16T19:11:00.000Z"),
    });
    expect(result.status).toBe("learned_correction_applied");
    expect(transport.patches).toHaveLength(patchCount);
    expect(ledger.projection("secondo-cliente", SECOND_PRACTICE_ID).caseDecisions).toEqual([
      expect.objectContaining({ field: "shading_closures", value: "sì" }),
    ]);
  });

  it("non scrive mai campi, documenti o comunicazioni fuori dalla allowlist", async () => {
    const { adapter, transport } = harness(practice());
    await adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-005",
      question: "Quale documento fiscale manca?",
      field: "operator.pendingData",
    });
    await expect(adapter.recordSavedDraft({ practiceId: PRACTICE_ID, draftId: "1", draftUrl: "https://example.com/1" }))
      .rejects.toThrow("crm_ombra_draft_url_invalid");
    expect(transport.patches.flatMap((item) => Object.keys(item.patch)).every((key) => APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS.includes(key as never))).toBe(true);
  });

  it("rifiuta domande generiche o non interrogative", async () => {
    const { adapter } = harness(practice());
    await expect(adapter.publishOperatorQuestion({
      practiceId: PRACTICE_ID,
      questionId: "question-federico-006",
      question: "Manca qualcosa",
      field: "operator.pendingData",
    })).rejects.toThrow("crm_ombra_operator_question_not_direct");
  });

  it("ricostruisce domanda e risposta dal solo campo visibile della scheda", () => {
    expect(parseAprCrmOmbraQuestion("Domanda APR [q-12345678]\nQual è il totale?\nDato richiesto: economic.invoiceTotal\nRisposta operatore: 2.587,62 euro"))
      .toEqual({ questionId: "q-12345678", question: "Qual è il totale?", field: "economic.invoiceTotal", missingDocumentType: null, answer: "2.587,62 euro" });
  });

  it("dimostra che discoverExistingDraft crea una generazione propria e non adotta bozze preesistenti", () => {
    const worker = readFileSync(path.resolve("scripts/enea-shadow-runner/aprEneaBrowserWorker.ts"), "utf8");
    const driver = readFileSync(path.resolve("scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts"), "utf8");
    expect(worker).toContain('current.requiresFreshDraft ? "pending_create_only" : "resume_generation"');
    expect(driver).toContain("!state.pendingCreate!.beforeDraftIds.includes(id)");
    expect(driver).toContain("!alreadyMappedDraftIds.has(id)");
    expect(driver).toContain("!siblingOwnedDraftIds.has(id)");
    expect(driver).toContain("const beforeDraftIds = [...new Set([");
  });
});
