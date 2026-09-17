import { describe, expect, it } from "vitest";

// @ts-expect-error Operational sequencer guards are intentionally native ESM.
import { isRecoverableTransientPreSave, resolveRecoveryQueuedPreflight, resolveUncertainSaveLifecycle } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs";

const fixture = () => ({
  status: "ready",
  items: [{
    customerKey: "fixture-recovery",
    state: "recovery_queued",
    draftId: "453823",
    serverEvidenceIds: ["server-not-saved-1"],
    uncertainPageSave: {
      pageId: "page:Anagrafica Beneficiario",
      status: "recovery_authorized",
      operatorDecision: null,
      probes: [{ method: "persisted_fields_get", outcome: "not_saved", evidenceId: "server-not-saved-1", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/453823" }],
    },
    pageCheckpoints: [{ pageId: "page:Anagrafica Beneficiario", state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "server-not-saved-1" }],
  }],
});

const terminalNestedScreeningFixture = () => ({
  status: "completed",
  items: [{
    customerKey: "fixture-screening",
    state: "operator_intervention",
    draftId: "460574",
    createAttemptCount: 1,
    saveAttemptCount: 0,
    uncertainPageSave: { pageId: "screening:2", status: "operator_required", operatorDecision: null, probes: [{ method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "probe-1" }] },
    pageCheckpoints: [
      { pageId: "screening:1", state: "staged", saveAttemptCount: 1, recoverySaveAttemptCount: 0, stagedEvidenceId: "staged-1" },
      { pageId: "screening:2", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 },
      { pageId: "screening:3", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
      { pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
    ],
  }],
});

const canonicalAbsenceDriverFixture = () => ({
  pageSaveDiagnostics: [1, 2].map((sequence) => ({
    kind: "screening-summary-readonly-v4",
    customerKey: "fixture-screening",
    draftId: "460574",
    evidenceId: `absence-${sequence}`,
    url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/serramenti/460574",
    allowlistedOrigin: true,
    authenticated: true,
    expectedHeadersPresent: true,
    filtersClear: true,
    loading: false,
    surfaceReady: true,
    emptyMarkerVisible: true,
    rowCount: 0,
    rows: [["Nessun elemento"]],
  })),
});

const recoveryFillingFixture = () => {
  const execution: any = terminalNestedScreeningFixture();
  execution.status = "running";
  execution.currentCustomerKey = "fixture-screening";
  const item = execution.items[0];
  item.state = "filling";
  item.uncertainPageSave.status = "recovery_authorized";
  item.pageCheckpoints[0] = { pageId: "screening:1", state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "absence-2" };
  item.pageCheckpoints[1] = { pageId: "screening:2", state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "absence-2" };
  return execution;
};

describe("gate sequencer recovery_queued con prova server", () => {
  it("accetta una sola prova not_saved sulla stessa bozza con budget residuo pari a uno", () => {
    expect(resolveRecoveryQueuedPreflight(fixture(), "fixture-recovery")).toMatchObject({
      kind: "ready",
      evidenceId: "server-not-saved-1",
      remainingRecoveryBudget: 1,
      ruleId: "system-sequencer-recovery-queued-server-proof-v1",
    });
  });

  it("fallisce chiuso se la prova non e not_saved o il budget residuo non e uno", () => {
    const missingProof = fixture();
    missingProof.items[0].uncertainPageSave.probes[0].outcome = "inconclusive";
    expect(resolveRecoveryQueuedPreflight(missingProof, "fixture-recovery")).toMatchObject({ kind: "invalid" });

    const exhausted = fixture();
    exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveRecoveryQueuedPreflight(exhausted, "fixture-recovery")).toMatchObject({ kind: "invalid" });
  });

  it("mantiene probing e recovery_queued non terminali fino alla ripresa del worker", () => {
    const probing: any = fixture();
    probing.status = "completed";
    probing.items[0].state = "operator_intervention";
    probing.items[0].uncertainPageSave.status = "probing";
    probing.items[0].uncertainPageSave.probes = [];
    probing.items[0].pageCheckpoints[0].state = "save_intent_recorded";
    probing.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = null;
    probing.items[0].serverEvidenceIds = [];
    expect(resolveUncertainSaveLifecycle(probing, "fixture-recovery")).toMatchObject({ kind: "wait_for_probes" });
    expect(resolveUncertainSaveLifecycle(fixture(), "fixture-recovery")).toMatchObject({ kind: "wait_for_worker_resume" });
  });

  it("fallisce chiuso se probing o recovery_queued contraddicono checkpoint e budget", () => {
    const malformedProbe: any = fixture();
    malformedProbe.items[0].state = "operator_intervention";
    malformedProbe.items[0].uncertainPageSave.status = "probing";
    expect(resolveUncertainSaveLifecycle(malformedProbe, "fixture-recovery")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("probing_save_intent_invalid") });

    const malformedRecovery: any = fixture();
    malformedRecovery.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveUncertainSaveLifecycle(malformedRecovery, "fixture-recovery")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("recovery_budget_not_one") });
  });

  it("riapre il worker soltanto con due prove canoniche indipendenti di assenza delle righe", () => {
    expect(resolveUncertainSaveLifecycle(terminalNestedScreeningFixture(), "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({
      kind: "wait_for_worker_resume",
      evidenceIds: ["absence-1", "absence-2"],
      ruleId: "system-sequencer-screening-canonical-absence-resume-v1",
    });
  });

  it("mantiene terminale fail-closed se una prova di assenza non e canonica o il budget e consumato", () => {
    const nonCanonical = canonicalAbsenceDriverFixture();
    nonCanonical.pageSaveDiagnostics[1].authenticated = false;
    expect(resolveUncertainSaveLifecycle(terminalNestedScreeningFixture(), "fixture-screening", nonCanonical)).toMatchObject({ kind: "terminal_operator" });

    const exhausted = terminalNestedScreeningFixture();
    exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveUncertainSaveLifecycle(exhausted, "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({ kind: "terminal_operator" });
  });

  it("mantiene filling recovery_authorized non terminale finche il worker consuma il recupero", () => {
    expect(resolveUncertainSaveLifecycle(recoveryFillingFixture(), "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({
      kind: "wait_for_worker_resume",
      ruleId: "system-sequencer-screening-recovery-filling-lifecycle-v1",
    });
  });

  it("mantiene non terminale il recupero generale dopo claim con la stessa prova server not_saved e budget uno", () => {
    const execution: any = fixture();
    execution.status = "running";
    execution.currentCustomerKey = "fixture-recovery";
    execution.items[0].state = "filling";
    expect(resolveUncertainSaveLifecycle(execution, "fixture-recovery")).toMatchObject({
      kind: "wait_for_worker_resume",
      evidenceIds: ["server-not-saved-1"],
      ruleId: "system-sequencer-single-page-recovery-filling-lifecycle-v1",
    });
  });

  it("mantiene non terminale la finestra prepared tra preparazione e intento dell'unico recupero", () => {
    const execution: any = fixture();
    execution.status = "running";
    execution.currentCustomerKey = "fixture-recovery";
    execution.items[0].state = "filling";
    execution.items[0].pageCheckpoints[0].state = "prepared";
    execution.items[0].pageCheckpoints[0].preparedEvidenceId = "prepared-recovery-1";
    expect(resolveUncertainSaveLifecycle(execution, "fixture-recovery")).toMatchObject({
      kind: "wait_for_worker_resume",
      evidenceIds: ["server-not-saved-1"],
      ruleId: "system-sequencer-recovery-prepared-window-lifecycle-v1",
    });
  });

  it("rifiuta la finestra prepared senza prova di preparazione o con budget consumato", () => {
    const missingPreparedProof: any = fixture();
    missingPreparedProof.status = "running";
    missingPreparedProof.currentCustomerKey = "fixture-recovery";
    missingPreparedProof.items[0].state = "filling";
    missingPreparedProof.items[0].pageCheckpoints[0].state = "prepared";
    expect(resolveUncertainSaveLifecycle(missingPreparedProof, "fixture-recovery")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("recovery_filling_checkpoint_invalid") });

    const exhausted: any = structuredClone(missingPreparedProof);
    exhausted.items[0].pageCheckpoints[0].preparedEvidenceId = "prepared-recovery-1";
    exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveUncertainSaveLifecycle(exhausted, "fixture-recovery")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("recovery_filling_checkpoint_invalid") });
  });

  it("rifiuta il recupero generale dopo claim se prova, pagina o budget non coincidono", () => {
    const wrongEvidence: any = fixture();
    wrongEvidence.status = "running";
    wrongEvidence.currentCustomerKey = "fixture-recovery";
    wrongEvidence.items[0].state = "filling";
    wrongEvidence.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "other-proof";
    expect(resolveUncertainSaveLifecycle(wrongEvidence, "fixture-recovery")).toMatchObject({ kind: "invalid" });

    const exhausted: any = fixture();
    exhausted.status = "running";
    exhausted.currentCustomerKey = "fixture-recovery";
    exhausted.items[0].state = "filling";
    exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveUncertainSaveLifecycle(exhausted, "fixture-recovery")).toMatchObject({ kind: "invalid" });
  });

  it("mantiene non terminale l'unico Salva di recupero finche le sonde read-only non concludono", () => {
    const execution: any = fixture();
    execution.status = "running";
    execution.currentCustomerKey = "fixture-recovery";
    execution.items[0].state = "save_intent_recorded";
    execution.items[0].pageCheckpoints[0].state = "save_intent_recorded";
    execution.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    expect(resolveUncertainSaveLifecycle(execution, "fixture-recovery")).toMatchObject({
      kind: "wait_for_probes",
      ruleId: "system-sequencer-single-page-recovery-save-intent-lifecycle-v1",
    });
  });

  it("rifiuta il Salva di recupero se bozza, prova o contatore non sono quelli autorizzati", () => {
    const execution: any = fixture();
    execution.status = "running";
    execution.currentCustomerKey = "fixture-recovery";
    execution.items[0].state = "save_intent_recorded";
    execution.items[0].pageCheckpoints[0].state = "save_intent_recorded";
    execution.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
    execution.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "different-proof";
    expect(resolveUncertainSaveLifecycle(execution, "fixture-recovery")).toMatchObject({ kind: "invalid" });
  });

  it("riconosce come riprendibile solo un errore CDP precedente a qualunque Salva pendente", () => {
    const entry: any = {
      draftId: "462287",
      reason: "Errore circoscritto alla pratica: apr_cdp_connection_closed",
      pageCheckpoints: [{ pageId: "page:Anagrafica Beneficiario", state: "pending", saveAttemptCount: 0 }],
    };
    expect(isRecoverableTransientPreSave(entry)).toBe(true);
    entry.pageCheckpoints[0].saveAttemptCount = 1;
    expect(isRecoverableTransientPreSave(entry)).toBe(false);
  });

  it("rifiuta filling recovery_authorized se identita, prova o budget non coincidono", () => {
    const mismatch = recoveryFillingFixture();
    mismatch.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "other-proof";
    expect(resolveUncertainSaveLifecycle(mismatch, "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({ kind: "invalid", reason: expect.stringContaining("recovery_filling_checkpoint_invalid") });
  });

  it("accetta il recovery del prefisso parziale solo se prova persistita e audit canonico coincidono", () => {
    const execution: any = recoveryFillingFixture();
    execution.items[0].uncertainPageSave.probes = [{
      method: "persisted_fields_get",
      outcome: "inconclusive",
      evidenceId: "persisted-zero-fields",
      reason: "0/9 campi coincidono: prova non conclusiva.",
    }];
    execution.items[0].serverEvidenceIds = ["persisted-zero-fields"];
    execution.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "persisted-zero-fields";
    execution.items[0].pageCheckpoints[1].recoveryAuthorizedEvidenceId = "persisted-zero-fields";
    execution.audit = [{
      type: "infissi_partial_rows_requeued_after_empty_canonical_summary",
      customerKey: "fixture-screening",
      commandId: "service:resume-partial-infissi-empty-canonical:fixture-screening:460574:screening:2:persisted-zero-fields:v1",
    }];
    expect(resolveUncertainSaveLifecycle(execution, "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({
      kind: "wait_for_worker_resume",
      ruleId: "system-sequencer-screening-recovery-filling-lifecycle-v1",
    });

    delete execution.audit;
    expect(resolveUncertainSaveLifecycle(execution, "fixture-screening", canonicalAbsenceDriverFixture())).toMatchObject({ kind: "invalid" });
  });
});

// Lucia Droghetti, 14/09/2026, coorte 9218: prima pagina salvata e provata
// dalla GET canonica, worker gia' in filling sulla pagina dopo. Il sequencer
// giudicava "state_status_mismatch:filling:resolved_saved" e isolava una
// lavorazione sana. La prova e' la stessa richiesta in recovery_queued.
describe("resolved_saved con la pratica ancora in filling (Droghetti)", () => {
  const droghetti = () => ({
    status: "running",
    currentCustomerKey: "lucia-droghetti",
    items: [{
      customerKey: "lucia-droghetti",
      state: "filling",
      draftId: "494037",
      serverEvidenceIds: ["cdp-server-13-7888883a4b35c43d04d7"],
      completedPageIds: ["page:Anagrafica Beneficiario"],
      uncertainPageSave: {
        pageId: "page:Anagrafica Beneficiario",
        status: "resolved_saved",
        operatorDecision: null,
        probes: [
          { method: "server_redirect", outcome: "inconclusive", evidenceId: "cdp-server-12-x" },
          { method: "persisted_fields_get", outcome: "saved", evidenceId: "cdp-server-13-7888883a4b35c43d04d7", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/494037" },
        ],
      },
      pageCheckpoints: [
        { pageId: "page:Anagrafica Beneficiario", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, savedEvidenceId: "cdp-server-13-7888883a4b35c43d04d7" },
        { pageId: "page:Immobile", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
      ],
    }],
  });

  it("lascia proseguire il worker quando la prova di salvataggio e' completa", () => {
    expect(resolveUncertainSaveLifecycle(droghetti() as never, "lucia-droghetti")).toMatchObject({ kind: "wait_for_worker_resume" });
  });

  // 16/09/2026, coorte 10370: stessa pratica, un passo dopo. Schermature
  // risolta e completata; il worker ha gia' registrato l'intento di Salva su
  // «Calcolo costi». Il sequencer giudicava
  // "state_status_mismatch:save_intent_recorded:resolved_saved".
  it("lascia proseguire il worker anche se ha gia' registrato l'intento di salvataggio della pagina dopo (Droghetti, 16/09)", () => {
    const later: any = droghetti();
    later.items[0].state = "save_intent_recorded";
    later.items[0].pageCheckpoints[1] = { pageId: "page:Immobile", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 };
    expect(resolveUncertainSaveLifecycle(later, "lucia-droghetti")).toMatchObject({ kind: "wait_for_worker_resume" });
  });

  it("con l'intento registrato sulla pagina dopo resta fail-closed se la pagina risolta non e' fra le completate", () => {
    const later: any = droghetti();
    later.items[0].state = "save_intent_recorded";
    later.items[0].completedPageIds = [];
    expect(resolveUncertainSaveLifecycle(later, "lucia-droghetti")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("resolved_saved_proof_invalid") });
  });

  it("resta fail-closed se la prova di salvataggio non e' completa", () => {
    const noProof: any = droghetti();
    noProof.items[0].pageCheckpoints[0].savedEvidenceId = "altra-evidenza";
    expect(resolveUncertainSaveLifecycle(noProof, "lucia-droghetti")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("resolved_saved_proof_invalid") });
    const notCompleted: any = droghetti();
    notCompleted.items[0].completedPageIds = [];
    expect(resolveUncertainSaveLifecycle(notCompleted, "lucia-droghetti")).toMatchObject({ kind: "invalid" });
  });
});
