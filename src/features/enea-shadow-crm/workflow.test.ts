import { describe, expect, it, vi } from "vitest";
import { IMPORT_CONFIRMATION_PHRASE, prepareSinglePracticeImport } from "./importBridge";
import { addFixtureEmailDraft, addSyntheticAttachment, assignShadowCrm, clearShadowCrmState, EMPTY_SHADOW_CRM_STATE, ENEA_SHADOW_CRM_STORAGE_KEY, INTERNAL_PILOT_PROCEDURE, internalPilotCriteria, loadShadowCrmState, OFFICIAL_PILOT_FIXTURE_IDS, pilotSessionId, prioritizeShadowCrm, removeSyntheticAttachment, saveShadowCrmState, serializeShadowCrmAudit, serializeShadowCrmPractice, transitionShadowCrm } from "./workflow";

describe("workflow CRM ombra", () => {
  it("consente soltanto il percorso ordinato e conserva un audit append-only", () => {
    const times = [0, 1, 2, 3, 4].map((second) => new Date(`2026-08-12T10:00:0${second}.000Z`));
    const actions = ["assign", "start", "review", "draft-email", "complete"] as const;
    const result = actions.reduce((state, action, index) => transitionShadowCrm(state, action, times[index]), EMPTY_SHADOW_CRM_STATE);

    expect(result).toMatchObject({ stage: "completed", assignee: "operatore-demo-anna", emailDrafted: true, outcome: "completed" });
    expect(result.audit.map((event) => event.type)).toEqual(actions);
    expect(transitionShadowCrm(result, "complete")).toBe(result);
  });

  it("ignora transizioni premature e bozze duplicate", () => {
    expect(transitionShadowCrm(EMPTY_SHADOW_CRM_STATE, "start")).toBe(EMPTY_SHADOW_CRM_STATE);
    const review = ["assign", "start", "review", "draft-email"].reduce(
      (state, action) => transitionShadowCrm(state, action as Parameters<typeof transitionShadowCrm>[1]),
      EMPTY_SHADOW_CRM_STATE,
    );
    expect(transitionShadowCrm(review, "draft-email")).toBe(review);
  });

  it("registra assegnazioni e priorità sintetiche senza alterare pratiche concluse", () => {
    const assigned = assignShadowCrm(EMPTY_SHADOW_CRM_STATE, "operatore-demo-luca", new Date("2026-08-12T10:00:00Z"));
    const prioritized = prioritizeShadowCrm(assigned, "high", new Date("2026-08-12T10:00:01Z"));
    expect(prioritized).toMatchObject({ stage: "assigned", assignee: "operatore-demo-luca", priority: "high" });
    expect(prioritized.audit.map((event) => event.type)).toEqual(["assign-luca", "priority-high"]);
  });

  it("ammette al pilot interno soltanto allegati e bozze fixture validati", () => {
    let state = addSyntheticAttachment(EMPTY_SHADOW_CRM_STATE, "invoice", new Date("2026-08-12T10:00:00Z"));
    state = addSyntheticAttachment(state, "bank-transfer", new Date("2026-08-12T10:00:01Z"));
    state = assignShadowCrm(state, "operatore-demo-anna", new Date("2026-08-12T10:00:02Z"));
    state = transitionShadowCrm(state, "start", new Date("2026-08-12T10:00:03Z"));
    state = transitionShadowCrm(state, "review", new Date("2026-08-12T10:00:04Z"));
    state = addFixtureEmailDraft(state, "status-update", "LAB-DEMO-001", new Date("2026-08-12T10:00:05Z"));
    state = addFixtureEmailDraft(state, "status-update", "LAB-DEMO-001", new Date("2026-08-12T10:00:06Z"));
    expect(internalPilotCriteria(state).ready).toBe(true);
    expect(state.attachments.every((item) => item.name.startsWith("DEMO-") && item.size <= 200_000)).toBe(true);
    expect(state.drafts[0].body).toContain("non inviata");
    expect(state.drafts.map((draft) => draft.version)).toEqual([1, 2]);
    expect(serializeShadowCrmAudit("crm-reale-1", state)).toBeNull();
    expect(serializeShadowCrmAudit("lab-demo-1", state)).toContain('"fixture": true');
    expect(serializeShadowCrmPractice("lab-schermature-001", state)).toContain('"pilot"');
  });

  it("rimuove allegati con audit e resetta una sola pratica persistita", () => {
    const withAttachment = addSyntheticAttachment(EMPTY_SHADOW_CRM_STATE, "invoice");
    const removed = removeSyntheticAttachment(withAttachment, withAttachment.attachments[0].id);
    expect(removed.attachments).toEqual([]);
    expect(removed.audit.at(-1)?.type).toBe("attachment-removed");
    const values: Record<string, string> = { [ENEA_SHADOW_CRM_STORAGE_KEY]: JSON.stringify({ "lab-one": withAttachment, "lab-two": EMPTY_SHADOW_CRM_STATE }) };
    const storage = { getItem: vi.fn((key: string) => values[key] ?? null), setItem: vi.fn((key: string, value: string) => { values[key] = value; }), removeItem: vi.fn((key: string) => { delete values[key]; }) };
    expect(clearShadowCrmState(storage, "lab-one")).toBe(true);
    expect(JSON.parse(values[ENEA_SHADOW_CRM_STORAGE_KEY])).toHaveProperty("lab-two");
    expect(JSON.parse(values[ENEA_SHADOW_CRM_STORAGE_KEY])).not.toHaveProperty("lab-one");
  });

  it("mantiene immutabili fixture e procedura ufficiali e usa sessioni stabili", () => {
    expect(Object.isFrozen(OFFICIAL_PILOT_FIXTURE_IDS)).toBe(true);
    expect(Object.isFrozen(INTERNAL_PILOT_PROCEDURE)).toBe(true);
    expect(INTERNAL_PILOT_PROCEDURE.every(Object.isFrozen)).toBe(true);
    expect(pilotSessionId("lab-schermature-001")).toBe("PILOT-CRM-ENEA-V1-LAB-SCHERMATURE-001");
    expect(pilotSessionId("lab-non-ufficiale")).toBeNull();
    expect(serializeShadowCrmPractice("lab-non-ufficiale", EMPTY_SHADOW_CRM_STATE)).toBeNull();
  });

  it("legge e salva esclusivamente identificativi fixture e degrada in sicurezza", () => {
    const storage = { getItem: vi.fn(() => "{corrotto"), setItem: vi.fn() };
    expect(loadShadowCrmState(storage, "crm-reale-1")).toEqual(EMPTY_SHADOW_CRM_STATE);
    expect(loadShadowCrmState(storage, "lab-demo-1")).toEqual(EMPTY_SHADOW_CRM_STATE);
    saveShadowCrmState(storage, "crm-reale-1", EMPTY_SHADOW_CRM_STATE);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("scarta da localStorage allegati e bozze non marcati come sintetici", () => {
    const storage = { getItem: vi.fn(() => JSON.stringify({
      "lab-demo-1": {
        attachments: [{ id: "upload-reale", name: "documento.pdf", mimeType: "application/pdf", size: 10, validation: "valid", checks: [] }],
        drafts: [{ id: "mail-reale", template: "status-update", subject: "Oggetto", body: "testo" }],
      },
    })) };
    const state = loadShadowCrmState(storage, "lab-demo-1");
    expect(state.attachments).toEqual([]);
    expect(state.drafts).toEqual([]);
  });

  it("isola stato, audit, export e reset della pratica importata", () => {
    const importedId = "local-import-61fa6740";
    const fixtureState = assignShadowCrm(EMPTY_SHADOW_CRM_STATE, "operatore-demo-anna");
    const importedState = prioritizeShadowCrm(EMPTY_SHADOW_CRM_STATE, "high");
    const values: Record<string, string> = { [ENEA_SHADOW_CRM_STORAGE_KEY]: JSON.stringify({ "lab-schermature-001": fixtureState }) };
    const storage = { getItem: vi.fn((key: string) => values[key] ?? null), setItem: vi.fn((key: string, value: string) => { values[key] = value; }), removeItem: vi.fn((key: string) => { delete values[key]; }) };
    saveShadowCrmState(storage, importedId, importedState);
    expect(loadShadowCrmState(storage, importedId).priority).toBe("high");
    expect(loadShadowCrmState(storage, "lab-schermature-001").assignee).toBe("operatore-demo-anna");
    expect(serializeShadowCrmAudit(importedId, importedState)).toContain('"localSnapshot": true');
    expect(serializeShadowCrmPractice(importedId, importedState)).toBeNull();
    const prepared = prepareSinglePracticeImport([{ id: "11111111-2222-4333-8444-555555555555", code: "CRM-DEMO-001", prodotto_installato: "Schermature Solari", ricevuta_at: "2026-08-12T10:00:00Z", document_count: 2, form_complete: true }], { confirmationPhrase: IMPORT_CONFIRMATION_PHRASE, singlePracticeConfirmed: true, localOnlyConfirmed: true, communicationsBlockedConfirmed: true });
    if (prepared.ok === false) throw new Error(prepared.reason);
    const exported = serializeShadowCrmPractice(prepared.practice.localId, importedState, { ...prepared.practice, cliente_nome: "Nome reale" } as typeof prepared.practice);
    expect(exported).toContain('"localSnapshot": true');
    expect(exported).not.toContain("Nome reale");
    expect(clearShadowCrmState(storage, importedId)).toBe(true);
    expect(JSON.parse(values[ENEA_SHADOW_CRM_STORAGE_KEY])).toHaveProperty("lab-schermature-001");
    expect(JSON.parse(values[ENEA_SHADOW_CRM_STORAGE_KEY])).not.toHaveProperty(importedId);
  });
});
