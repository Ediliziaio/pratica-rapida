import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  applyOperatorResponseDossierOverrides,
  OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID,
  OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID,
  PersistentAprOperatorResponseLedger,
  resolveOperatorResponseLedgerPath,
  type AprOperatorResponseEntry,
  type AprOperatorResponsePayload,
} from "./operatorResponseLedger";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function response(id: string, customerKey: string, payload: AprOperatorResponsePayload, receivedAt = "2026-09-11T08:00:00.000Z"): AprOperatorResponseEntry {
  return {
    responseId: id,
    customerKey,
    displayName: "Cliente Fixture",
    practiceId: "practice-fixture",
    receivedAt,
    source: "giuliano_chat_decision",
    question: "Qual e il valore corretto?",
    answer: "Valore confermato.",
    payload,
    status: "active",
    supersedesResponseId: null,
    appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
  };
}

describe("registro runtime delle risposte operatore", () => {
  it("persiste globalmente la risposta e la rende visibile a una nuova coorte", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-ledger-")); roots.push(base);
    const firstRoot = path.join(base, "cohorts", "cohort-a");
    const secondRoot = path.join(base, "cohorts", "cohort-b");
    mkdirSync(firstRoot, { recursive: true }); mkdirSync(secondRoot, { recursive: true });
    expect(resolveOperatorResponseLedgerPath(firstRoot)).toBe(path.join(base, "state", "operator-responses", "checkpoint.json"));

    new PersistentAprOperatorResponseLedger(firstRoot).importResponses([
      response("response:mondini:dimensions:20260911", "sarah-mondini", {
        kind: "screening_products",
        products: [{ description: "Pergotenda", quantity: 1, widthMm: 5400, heightMm: 4000 }],
      }),
    ]);
    expect(new PersistentAprOperatorResponseLedger(secondRoot).projection("sarah-mondini", "practice-fixture")).toMatchObject({
      screeningProducts: { products: [{ description: "Pergotenda", quantity: 1, widthMm: 5400, heightMm: 4000 }] },
    });
  });

  // Rossella Munafo, 11-14/09/2026: richiesta "dato in attesa" dell'11 e misure
  // del 12 entrambe attive, nessuna marcata superata. Le misure venivano
  // applicate e la richiesta continuava a bloccare la pratica, per tre giri.
  it("vince la risposta piu' recente: una richiesta di dato seguita da una risposta con il dato non blocca piu'", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-ledger-")); roots.push(base);
    const root = path.join(base, "cohorts", "cohort-a"); mkdirSync(root, { recursive: true });
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([
      response("response:munafo:pending:20260911", "rossella-munafo", {
        kind: "operator_required", operatorQuestion: "Indica le misure della bioclimatica riportate nel foglio manoscritto.", missingDocumentType: null,
      }, "2026-09-11T09:37:00.000Z"),
      response("response:munafo:dimensions:20260912", "rossella-munafo", {
        kind: "screening_products", products: [{ description: "Bioclimatica", quantity: 1, widthMm: 4000, heightMm: 3000 }],
      }, "2026-09-12T11:53:00.000Z"),
    ]);
    const projection = ledger.projection("rossella-munafo", "practice-fixture");
    expect(projection.screeningProducts).toMatchObject({ products: [{ widthMm: 4000, heightMm: 3000 }] });
    expect(projection.operatorRequired).toBeNull();
  });

  it("una richiesta di dato resta valida se e' davvero l'ultima cosa detta sulla pratica", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-ledger-")); roots.push(base);
    const root = path.join(base, "cohorts", "cohort-a"); mkdirSync(root, { recursive: true });
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([
      response("response:x:dimensions:20260911", "cliente-x", {
        kind: "screening_products", products: [{ description: "Tenda", quantity: 1, widthMm: 3000, heightMm: 2000 }],
      }, "2026-09-11T09:00:00.000Z"),
      response("response:x:pending:20260912", "cliente-x", {
        kind: "operator_required", operatorQuestion: "Serve ancora il certificato del produttore.", missingDocumentType: "certificato",
      }, "2026-09-12T09:00:00.000Z"),
    ]);
    expect(ledger.projection("cliente-x", "practice-fixture").operatorRequired).toMatchObject({ operatorQuestion: "Serve ancora il certificato del produttore." });
  });

  it("applica soltanto campi strutturati ammessi e conserva immutato il resto del dossier", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-fields-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([
      response("response:maggi:cadastral:20260911", "fixture", { kind: "cadastral_identifiers", sheet: "9", parcel: "6642" }),
      response("response:depalma:old-window:20260911", "fixture", { kind: "old_window_characteristics", material: "metal", glazing: "double", appliesToCount: 5 }),
    ]);
    const original = { row: { id: "practice-fixture", customerSecret: "unchanged", dati_form: { catastali: { foglio: "", mappale: "" }, prodotto: { materiale_vecchi: "", vetro_vecchi: "", materiale_nuovi: "pvc" } } } };
    const applied = applyOperatorResponseDossierOverrides(original, ledger.projection("fixture", "practice-fixture"));
    expect(applied.dossier).toEqual({ row: { id: "practice-fixture", customerSecret: "unchanged", dati_form: { catastali: { foglio: "9", mappale: "6642" }, prodotto: { materiale_vecchi: "metallo", vetro_vecchi: "vetro_doppio", materiale_nuovi: "pvc" } } } });
    expect(original.row.dati_form.catastali.foglio).toBe("");
  });

  it("consuma i cinque campi tipizzati e legacy soltanto quando modificano realmente il dossier", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-five-fields-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root);
    const legacy = (id: string, question: string, answer: string): AprOperatorResponseEntry => ({
      ...response(id, "fixture", { kind: "operator_required", operatorQuestion: question, missingDocumentType: null }),
      question,
      answer,
    });
    ledger.importResponses([
      legacy("response:chat:completion-date:fixture:20260914", "Puoi confermare la data di fine lavori?", "Fine lavori 30/08/2026."),
      legacy("response:chat:infissi-dimensioni-e-numero:fixture:20260914", "Puoi indicare quanti serramenti e la misura di ciascuno?", "3 serramenti: 2,6 m² / 2,4 m² / 3,6 m²"),
      legacy("response:chat:invoice-total:fixture:20260914", "Qual e il totale finale stampato?", "2.587,62 €"),
      legacy("response:chat:shading-closures:fixture:20260914", "Sono presenti chiusure oscuranti?", "Sì, sono presenti."),
      legacy("response:chat:pending-data:fixture:20260914", "Quali sono le misure della bioclimatica?", "Bioclimatica 400 x 300 cm."),
    ]);
    const applied = applyOperatorResponseDossierOverrides({ row: { id: "practice-fixture", dati_form: {} } }, ledger.projection("fixture", "practice-fixture"));
    expect(applied.dossier).toMatchObject({ row: { data_fine_lavori: "2026-08-30", dati_form: {
      economico: { invoice_total: 2587.62 },
      prodotto: {
        zanzariere_tapparelle_persiane: true,
        apr_operator_infissi_surface_rows: [
          { pieceNumber: 1, surfaceM2: 2.6 },
          { pieceNumber: 2, surfaceM2: 2.4 },
          { pieceNumber: 3, surfaceM2: 3.6 },
        ],
        apr_operator_screening_products: [{ widthMm: 4000, heightMm: 3000 }],
      },
    } } });
    expect(applied.infissiSurfaceRows.map((item) => item.surfaceM2)).toEqual([2.6, 2.4, 3.6]);
    expect(applied.appliedResponseIds).toHaveLength(5);
    expect(applied.applications).toHaveLength(5);
    expect(applied.applications.every((item) => item.outcome === "applied")).toBe(true);
  });

  it("registra not_applied quando la risposta non produce alcun dato consumabile", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-not-applied-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      ...response("response:chat:completion-date:fixture:invalid", "fixture", { kind: "operator_required", operatorQuestion: "Qual e la data di fine lavori?", missingDocumentType: null }),
      question: "Qual e la data di fine lavori?",
      answer: "Non lo so.",
    }]);
    const applied = applyOperatorResponseDossierOverrides({ row: { id: "practice-fixture", dati_form: {} } }, ledger.projection("fixture", "practice-fixture"));
    expect(applied.appliedResponseIds).toEqual([]);
    expect(applied.applications).toEqual([expect.objectContaining({ outcome: "not_applied", field: "completionDate" })]);
  });

  it("fallisce chiuso se il registro viene manomesso o una regola generale non esiste", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-fail-closed-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([response("response:valid:20260911", "fixture", { kind: "general_rule_confirmation", ruleIds: [USER_AUTHORIZED_RULE_IDS.cassonettoExcludedFromEneaProducts] })]);
    const state = JSON.parse(readFileSync(ledger.checkpointPath, "utf8"));
    state.responses[0].answer = "manomessa";
    writeFileSync(ledger.checkpointPath, JSON.stringify(state));
    expect(() => ledger.load()).toThrow("apr_operator_response_ledger_invalid");

    const otherRoot = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-rule-")); roots.push(otherRoot);
    expect(() => new PersistentAprOperatorResponseLedger(otherRoot).importResponses([
      response("response:unknown-rule:20260911", "fixture", { kind: "general_rule_confirmation", ruleIds: ["rule-non-esistente"] }),
    ])).toThrow("apr_operator_response_import_invalid");

    const scopeRoot = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-scope-")); roots.push(scopeRoot);
    const scoped = new PersistentAprOperatorResponseLedger(scopeRoot);
    scoped.importResponses([
      response("response:practice-specific:20260911", "fixture", { kind: "cadastral_identifiers", sheet: "9", parcel: "6642" }),
    ]);
    expect(scoped.projection("fixture", null).entries).toEqual([]);
    expect(scoped.projection("fixture", "another-practice").entries).toEqual([]);
    expect(scoped.projection("fixture", "practice-fixture").entries).toHaveLength(1);
  });

  it("attende una contesa transitoria e conserva entrambe le scritture senza perdere risposte", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-lock-wait-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root, { lockWaitTimeoutMs: 2_000, lockPollIntervalMs: 10 });
    ledger.importResponses([response("response:lock-wait:20260912", "fixture", { kind: "physical_product_count", count: 7 })]);
    mkdirSync(ledger.lockPath, { mode: 0o700 });
    const releaser = spawn(process.execPath, ["-e", `setTimeout(() => require("node:fs").rmdirSync(${JSON.stringify(ledger.lockPath)}), 120)`], { stdio: "ignore" });
    const startedAt = Date.now();
    const state = ledger.recordApplications([{
      responseId: "response:lock-wait:20260912",
      customerKey: "fixture",
      practiceId: "practice-fixture",
      runRoot: root,
      sourceFingerprint: "source-fingerprint",
      outcome: "applied",
      evidence: "physicalProductCount=7",
      appliedAt: "2026-09-12T08:00:00.000Z",
    }]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(80);
    expect(state.responses).toHaveLength(1);
    expect(state.applications).toHaveLength(1);
    expect(state.applications[0].appliedRuleIds).toContain(OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID);
    await new Promise<void>((resolve, reject) => { releaser.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`lock_releaser_failed:${code}`))); });
  });

  it("resta fail-closed se la contesa non si risolve entro il budget", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-response-lock-timeout-")); roots.push(root);
    const ledger = new PersistentAprOperatorResponseLedger(root, { lockWaitTimeoutMs: 40, lockPollIntervalMs: 5 });
    mkdirSync(path.dirname(ledger.lockPath), { recursive: true });
    mkdirSync(ledger.lockPath, { mode: 0o700 });
    expect(() => ledger.importResponses([response("response:lock-timeout:20260912", "fixture", { kind: "physical_product_count", count: 7 })])).toThrow("apr_operator_response_ledger_busy");
    expect(ledger.load().revision).toBe(0);
  });
});
