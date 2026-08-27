import { describe, expect, it } from "vitest";
import { assertAprCaseProblemClaim, deriveAprCaseStatusTruth, deriveAprInfissiMappingCaseStatusTruth, reconcileAprCaseTruthWithDraftExecution } from "./caseStatusTruth";
import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";

const item = (patch: Partial<AprCrmLocalPreflightItem>): AprCrmLocalPreflightItem => ({
  customerKey: "giulia-albanese", displayName: "Giulia Albanese", practiceId: "practice-1", dossierPath: "/tmp/dossier.json",
  state: "ready_local_plan", attemptCount: 1, startedAt: null, endedAt: null, reason: "Piano pronto.", disposition: null,
  report: { outcome: "ready_local_plan", blockers: [] } as never,
  ...patch,
});

describe("verita autorevole dello stato pratica APR", () => {
  it("vieta di descrivere come bloccata una pratica pronta senza blocker", () => {
    const truth = deriveAprCaseStatusTruth(item({}));
    expect(truth).toMatchObject({ status: "READY", hasProblem: false, blockerCount: 0, statement: expect.stringContaining("Nessun problema") });
    expect(() => assertAprCaseProblemClaim(truth, "problem")).toThrow("apr_case_false_block_claim");
    expect(assertAprCaseProblemClaim(truth, "no_problem")).toBe(true);
  });

  it("ammette la parola blocco soltanto con blocked_case e blocker coerente", () => {
    const truth = deriveAprCaseStatusTruth(item({ state: "blocked_case", report: { outcome: "blocked_case", blockers: [{ code: "missing_invoice", reason: "Fattura mancante." }] } as never }));
    expect(truth).toMatchObject({ status: "BLOCKED", hasProblem: true, blockerCount: 1, blockerCodes: ["missing_invoice"] });
    expect(assertAprCaseProblemClaim(truth, "problem")).toBe(true);
  });

  it("classifica come intervento operatore un piano locale privo del payload ENEA completo", () => {
    const truth = deriveAprCaseStatusTruth(item({ report: {
      outcome: "ready_local_plan",
      blockers: [],
      eneaPayloadAudit: {
        draftReady: false,
        portalGate: { status: "blocked" },
        blockers: [{ code: "missing-beneficiario.titolo", fieldId: "beneficiario.titolo", message: "Titolo sull'immobile mancante." }],
      },
    } as never }));
    expect(truth).toMatchObject({ status: "BLOCKED", hasProblem: true, blockerCount: 1, blockerCodes: ["missing-beneficiario.titolo"] });
    expect(() => assertAprCaseProblemClaim(truth, "no_problem")).toThrow("apr_case_false_ready_claim");
  });

  it("classifica come incoerente ogni disaccordo tra stato e report", () => {
    const truth = deriveAprCaseStatusTruth(item({ state: "ready_local_plan", report: { outcome: "blocked_case", blockers: [{ code: "x", reason: "x" }] } as never }));
    expect(truth).toMatchObject({ status: "INCONSISTENT", hasProblem: null });
    expect(() => assertAprCaseProblemClaim(truth, "problem")).toThrow("apr_case_claim_not_terminal:INCONSISTENT");
  });

  it("espone come READY un checkpoint Infissi coerente e privo di blocker", () => {
    const truth = deriveAprInfissiMappingCaseStatusTruth({
      item: { customerKey: "cristina-fabbro", displayName: "Cristina Fabbro", caseTruth: "READY", report: { outcome: "ready_local_plan", blockers: [] } },
    } as never);
    expect(truth).toMatchObject({ status: "READY", hasProblem: false, blockerCount: 0, statement: expect.stringContaining("Nessun problema") });
  });

  it("espone BLOCKED/operatore se il preflight è verde ma il solo caso ha un esito tecnico incerto", () => {
    const preflightTruth = deriveAprCaseStatusTruth(item({}));
    const truth = reconcileAprCaseTruthWithDraftExecution(preflightTruth, {
      customerKey: "giulia-albanese",
      state: "operator_intervention",
      reason: "La GET canonica dimostra che anche l'unico recupero non è persistito.",
      uncertainPageSave: { status: "operator_required" },
    } as never);
    expect(truth).toMatchObject({
      status: "BLOCKED",
      hasProblem: true,
      blockerCount: 1,
      blockerCodes: ["execution_case_operator_required"],
      statement: expect.stringContaining("la coda prosegue"),
    });
    expect(assertAprCaseProblemClaim(truth, "problem")).toBe(true);
  });

  it("espone BLOCKED quando la verifica server nega la persistenza della pagina annidata", () => {
    const truth = reconcileAprCaseTruthWithDraftExecution(deriveAprCaseStatusTruth(item({})), {
      customerKey: "giulia-albanese",
      state: "operator_intervention",
      reason: "Errore circoscritto alla pratica: apr_enea_nested_page_not_persisted_after_outer_save:page:Generatore dell'impianto termico",
      uncertainPageSave: null,
      operatorGateBlockers: [],
    } as never);
    expect(truth).toMatchObject({
      status: "BLOCKED",
      sourceState: "blocked_case",
      reportOutcome: "blocked_case",
      blockerCodes: ["execution_case_operator_required"],
    });
  });

  it("espone IN_PROGRESS quando il preflight è pronto e il checkpoint portale sta salvando", () => {
    const truth = reconcileAprCaseTruthWithDraftExecution(deriveAprCaseStatusTruth(item({})), {
      customerKey: "giulia-albanese",
      state: "save_intent_recorded",
      reason: "Intento durevole registrato.",
    } as never);
    expect(truth).toMatchObject({ status: "IN_PROGRESS", hasProblem: null, statement: expect.stringContaining("save_intent_recorded") });
  });

  it("espone INCONSISTENT se il portale lavora mentre il preflight ha un blocker", () => {
    const preflightTruth = deriveAprCaseStatusTruth(item({
      state: "blocked_case",
      report: { outcome: "blocked_case", blockers: [{ code: "missing_invoice", reason: "Fattura mancante." }] } as never,
    }));
    const truth = reconcileAprCaseTruthWithDraftExecution(preflightTruth, {
      customerKey: "giulia-albanese",
      state: "filling",
      reason: "Compilazione in corso.",
    } as never);
    expect(truth).toMatchObject({ status: "INCONSISTENT", hasProblem: null });
  });

  it("mantiene INCONSISTENT se l'intervento operatore non ha evidenza tecnica né blocker business", () => {
    const truth = reconcileAprCaseTruthWithDraftExecution(deriveAprCaseStatusTruth(item({})), {
      customerKey: "giulia-albanese",
      state: "operator_intervention",
      reason: "Richiesta non classificata.",
      uncertainPageSave: null,
    } as never);
    expect(truth).toMatchObject({ status: "INCONSISTENT", hasProblem: null });
  });

  it("mantiene BLOCKED quando report e checkpoint operatore concordano", () => {
    const preflightTruth = deriveAprCaseStatusTruth(item({
      state: "blocked_case",
      report: { outcome: "blocked_case", blockers: [{ code: "missing_invoice", reason: "Fattura mancante." }] } as never,
    }));
    const truth = reconcileAprCaseTruthWithDraftExecution(preflightTruth, {
      customerKey: "giulia-albanese",
      state: "operator_intervention",
    } as never);
    expect(truth).toMatchObject({ status: "BLOCKED", hasProblem: true, blockerCount: 1 });
  });

  it("espone BLOCKED quando il gate data auditato nel checkpoint portale supera un preflight batch precedente", () => {
    const truth = reconcileAprCaseTruthWithDraftExecution(deriveAprCaseStatusTruth(item({})), {
      customerKey: "giulia-albanese",
      state: "operator_intervention",
      reason: "Fine lavori oltre 90 giorni.",
      operatorGateBlockers: [{
        code: "completion_over_90_days_operator_required",
        reason: "Fine lavori 2026-01-09: 226 giorni prima della lavorazione.",
        sourceIds: ["invoice-1"],
        appliedRuleIds: ["user-2026-08-23-completion-over-90-operator-gate"],
      }],
    } as never);
    expect(truth).toMatchObject({
      status: "BLOCKED",
      hasProblem: true,
      blockerCount: 1,
      blockerCodes: ["completion_over_90_days_operator_required"],
      sourceState: "blocked_case",
      reportOutcome: "blocked_case",
    });
  });

  it("espone INCONSISTENT quando la bozza risulta salvata ma il report corrente contiene blocker", () => {
    const preflightTruth = deriveAprCaseStatusTruth(item({
      state: "blocked_case",
      report: { outcome: "blocked_case", blockers: [{ code: "missing_invoice", reason: "Fattura mancante." }] } as never,
    }));
    const truth = reconcileAprCaseTruthWithDraftExecution(preflightTruth, {
      customerKey: "giulia-albanese",
      state: "saved",
      reason: "Bozza completa e salvata.",
    } as never);
    expect(truth).toMatchObject({
      status: "INCONSISTENT",
      hasProblem: null,
      blockerCodes: ["missing_invoice"],
      statement: expect.stringContaining("checkpoint del portale registra una bozza salvata"),
    });
    expect(() => assertAprCaseProblemClaim(truth, "problem")).toThrow("apr_case_claim_not_terminal:INCONSISTENT");
  });
});
