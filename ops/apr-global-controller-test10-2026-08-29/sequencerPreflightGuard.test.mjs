import assert from "node:assert/strict";
import test from "node:test";

import { isRecoverableTransientPreSave, resolveCommonPreflightBlock, resolveInfissiPreflightDisposition, resolvePersistedPreflightBlock, resolvePreflightTerminalDisposition, resolveRecoveryQueuedPreflight, resolveUncertainSaveLifecycle } from "./sequencerPreflightGuard.mjs";

const blockedPreflight = (code = "draft_payload_mapping_incomplete") => ({ status: "completed", items: [{ customerKey: "elena-berti", state: "blocked_case", reason: "Blocco preflight.", report: { blockers: [{ code, reason: "Dato non risolto." }] } }] });
const reviewed = (state, classification, code = "draft_payload_mapping_incomplete") => ({ status: "completed", revision: 4, items: [{ customerKey: "elena-berti", state, classification, blockerCodes: [code], endedAt: "2026-09-07T12:00:00.000Z", reason: "Classificazione profonda.", nextAction: "Azione tipizzata." }] });

test("non finalizza il preflight mentre la revisione profonda e ancora working", () => {
  const deep = { status: "working", items: [{ customerKey: "elena-berti", state: "reviewing", classification: null, blockerCodes: ["draft_payload_mapping_incomplete"], endedAt: null }] };
  assert.equal(resolvePreflightTerminalDisposition(blockedPreflight(), null, deep, "elena-berti", "screening").kind, "wait");
});

test("classifica terminale soltanto dopo revisione profonda concordante", () => {
  assert.equal(resolvePreflightTerminalDisposition(blockedPreflight(), null, reviewed("technical_repair", "TECHNICAL_REPAIR"), "elena-berti", "screening").kind, "technical_block");
  assert.equal(resolvePreflightTerminalDisposition(blockedPreflight("customer_form_missing"), null, reviewed("operator_required", "OPERATOR_REQUIRED", "customer_form_missing"), "elena-berti", "screening").kind, "operator_required");
});

test("resta fail-closed se preflight e revisione profonda divergono", () => {
  assert.equal(resolvePreflightTerminalDisposition(blockedPreflight(), null, reviewed("operator_required", "OPERATOR_REQUIRED", "customer_form_missing"), "elena-berti", "screening").kind, "inconsistent");
  assert.equal(resolvePreflightTerminalDisposition(blockedPreflight(), null, reviewed("auto_resolved", "AUTO_RESOLVED"), "elena-berti", "screening").kind, "inconsistent");
});

test("mantiene report.blockers tipizzati nella verita terminale preflight", () => {
  const block = resolveCommonPreflightBlock({
    status: "completed",
    items: [{
      customerKey: "barbara-melis",
      state: "blocked_case",
      reason: "2 blocker per-pratica registrati; coda prosegue.",
      report: { blockers: [
        { code: "screenings_missing", reason: "Nessun prodotto fisico riconciliato." },
        { code: "invoice_missing", reason: "Nessuna fattura economica candidata valida." },
      ] },
    }],
  }, "barbara-melis", "screening");

  assert.deepEqual(block.operatorGateBlockers, [
    { code: "screenings_missing", message: "Nessun prodotto fisico riconciliato." },
    { code: "invoice_missing", message: "Nessuna fattura economica candidata valida." },
  ]);
});

test("non blocca Infissi per soli blocker Schermature e attende il gate prodotto", () => {
  const common = {
    status: "completed",
    items: [{
      customerKey: "barbara-melis",
      state: "blocked_case",
      report: { blockers: [
        { code: "screenings_missing", field: "screenings" },
        { code: "invoice_332a5af9", field: "economic_sources", reason: "Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture." },
      ] },
    }],
  };
  assert.equal(resolveCommonPreflightBlock(common, "barbara-melis", "infissi"), null);
  assert.equal(resolveInfissiPreflightDisposition(common, { status: "running", items: [] }, "barbara-melis").kind, "wait");
  assert.equal(resolveInfissiPreflightDisposition(common, { status: "completed", items: [{ customerKey: "barbara-melis", state: "ready_local_plan" }] }, "barbara-melis").kind, "product");
});

test("resta fail-closed per un blocker comune realmente applicabile a Infissi", () => {
  const common = {
    status: "completed",
    items: [{
      customerKey: "sabrina-eustomi",
      state: "blocked_case",
      report: { blockers: [
        { code: "screenings_missing", field: "screenings" },
        { code: "customer_form_missing", field: "form", reason: "Modulo cliente assente." },
      ] },
    }],
  };
  const block = resolveCommonPreflightBlock(common, "sabrina-eustomi", "infissi");
  assert.deepEqual(block.blockerCodes, ["customer_form_missing"]);
  assert.deepEqual(block.operatorGateBlockers, [{ code: "customer_form_missing", message: "Modulo cliente assente." }]);
});

test("persiste gli stessi blocker usati quando un dossier etichettato Infissi e documentato come Schermature", () => {
  const common = {
    status: "completed",
    items: [{
      customerKey: "marco-colombo",
      state: "blocked_case",
      reason: "2 blocker per-pratica registrati; coda prosegue.",
      report: { blockers: [
        { code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato." },
        { code: "screening_primary_measurements_missing", field: "screenings.dimensions", reason: "Misure primarie assenti." },
      ] },
    }],
  };
  const product = { status: "completed", items: [] };
  assert.equal(resolveInfissiPreflightDisposition(common, product, "marco-colombo").kind, "common_block");
  assert.deepEqual(resolvePersistedPreflightBlock(common, product, "marco-colombo", "infissi")?.operatorGateBlockers, [
    { code: "screenings_missing", message: "Nessun prodotto fisico riconciliato." },
    { code: "screening_primary_measurements_missing", message: "Misure primarie assenti." },
  ]);
});

const recoveryQueuedFixture = () => ({
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
      probes: [{
        method: "persisted_fields_get",
        outcome: "not_saved",
        evidenceId: "server-not-saved-1",
        url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/453823",
      }],
    },
    pageCheckpoints: [{
      pageId: "page:Anagrafica Beneficiario",
      state: "pending",
      saveAttemptCount: 1,
      recoverySaveAttemptCount: 0,
      recoveryAuthorizedEvidenceId: "server-not-saved-1",
    }],
  }],
});

test("ammette recovery_queued soltanto con prova server not_saved e budget residuo uno", () => {
  const disposition = resolveRecoveryQueuedPreflight(recoveryQueuedFixture(), "fixture-recovery");
  assert.equal(disposition.kind, "ready");
  assert.equal(disposition.evidenceId, "server-not-saved-1");
  assert.equal(disposition.remainingRecoveryBudget, 1);
});

test("rifiuta fail-closed recovery_queued senza prova not_saved o con budget consumato", () => {
  const missingProof = recoveryQueuedFixture();
  missingProof.items[0].uncertainPageSave.probes[0].outcome = "inconclusive";
  assert.match(resolveRecoveryQueuedPreflight(missingProof, "fixture-recovery").reason, /single_not_saved_server_proof_required/);

  const exhausted = recoveryQueuedFixture();
  exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  assert.match(resolveRecoveryQueuedPreflight(exhausted, "fixture-recovery").reason, /recovery_budget_not_one/);
});

test("mantiene probing e recovery_queued non terminali finche il worker completa la ripresa", () => {
  const probing = recoveryQueuedFixture();
  probing.status = "completed";
  probing.items[0].state = "operator_intervention";
  probing.items[0].uncertainPageSave.status = "probing";
  probing.items[0].uncertainPageSave.probes = [];
  probing.items[0].pageCheckpoints[0].state = "save_intent_recorded";
  probing.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = null;
  probing.items[0].serverEvidenceIds = [];
  assert.equal(resolveUncertainSaveLifecycle(probing, "fixture-recovery").kind, "wait_for_probes");
  assert.equal(resolveUncertainSaveLifecycle(recoveryQueuedFixture(), "fixture-recovery").kind, "wait_for_worker_resume");
});

test("mantiene filling non terminale con la stessa prova server not_saved e budget residuo uno", () => {
  const execution = recoveryQueuedFixture();
  execution.status = "running";
  execution.currentCustomerKey = "fixture-recovery";
  execution.items[0].state = "filling";
  assert.equal(resolveUncertainSaveLifecycle(execution, "fixture-recovery").kind, "wait_for_worker_resume");
  assert.equal(resolveUncertainSaveLifecycle(execution, "fixture-recovery").ruleId, "system-sequencer-single-page-recovery-filling-lifecycle-v1");
});

test("mantiene non terminale la finestra preparata dell'unico recupero", () => {
  const execution = recoveryQueuedFixture();
  execution.status = "running";
  execution.currentCustomerKey = "fixture-recovery";
  execution.items[0].state = "filling";
  execution.items[0].pageCheckpoints[0].state = "prepared";
  execution.items[0].pageCheckpoints[0].preparedEvidenceId = "prepared-recovery-1";
  const lifecycle = resolveUncertainSaveLifecycle(execution, "fixture-recovery");
  assert.equal(lifecycle.kind, "wait_for_worker_resume");
  assert.equal(lifecycle.ruleId, "system-sequencer-recovery-prepared-window-lifecycle-v1");
});

test("rifiuta fail-closed la finestra preparata senza prova o con un recupero gia consumato", () => {
  const missingPreparedProof = recoveryQueuedFixture();
  missingPreparedProof.status = "running";
  missingPreparedProof.currentCustomerKey = "fixture-recovery";
  missingPreparedProof.items[0].state = "filling";
  missingPreparedProof.items[0].pageCheckpoints[0].state = "prepared";
  assert.match(resolveUncertainSaveLifecycle(missingPreparedProof, "fixture-recovery").reason, /recovery_filling_checkpoint_invalid/);

  const exhausted = structuredClone(missingPreparedProof);
  exhausted.items[0].pageCheckpoints[0].preparedEvidenceId = "prepared-recovery-1";
  exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  assert.match(resolveUncertainSaveLifecycle(exhausted, "fixture-recovery").reason, /recovery_filling_checkpoint_invalid/);
});

test("rifiuta filling generale se prova server o budget residuo non coincidono", () => {
  const wrongEvidence = recoveryQueuedFixture();
  wrongEvidence.status = "running";
  wrongEvidence.currentCustomerKey = "fixture-recovery";
  wrongEvidence.items[0].state = "filling";
  wrongEvidence.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "other-proof";
  assert.equal(resolveUncertainSaveLifecycle(wrongEvidence, "fixture-recovery").kind, "invalid");

  const exhausted = recoveryQueuedFixture();
  exhausted.status = "running";
  exhausted.currentCustomerKey = "fixture-recovery";
  exhausted.items[0].state = "filling";
  exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  assert.equal(resolveUncertainSaveLifecycle(exhausted, "fixture-recovery").kind, "invalid");
});

test("mantiene save_intent_recorded del recupero non terminale fino alle sonde", () => {
  const execution = recoveryQueuedFixture();
  execution.status = "running";
  execution.currentCustomerKey = "fixture-recovery";
  execution.items[0].state = "save_intent_recorded";
  execution.items[0].pageCheckpoints[0].state = "save_intent_recorded";
  execution.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  const lifecycle = resolveUncertainSaveLifecycle(execution, "fixture-recovery");
  assert.equal(lifecycle.kind, "wait_for_probes");
  assert.equal(lifecycle.ruleId, "system-sequencer-single-page-recovery-save-intent-lifecycle-v1");
});

test("rifiuta save_intent_recorded del recupero con prova o budget discordanti", () => {
  const execution = recoveryQueuedFixture();
  execution.status = "running";
  execution.currentCustomerKey = "fixture-recovery";
  execution.items[0].state = "save_intent_recorded";
  execution.items[0].pageCheckpoints[0].state = "save_intent_recorded";
  execution.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  execution.items[0].pageCheckpoints[0].recoveryAuthorizedEvidenceId = "different-proof";
  assert.equal(resolveUncertainSaveLifecycle(execution, "fixture-recovery").kind, "invalid");
});

test("deferisce soltanto errori CDP transitori prima di qualunque Salva pendente", () => {
  const entry = {
    draftId: "462287",
    reason: "Errore circoscritto alla pratica: apr_cdp_connection_closed",
    pageCheckpoints: [{ pageId: "page:Anagrafica Beneficiario", state: "pending", saveAttemptCount: 0 }],
  };
  assert.equal(isRecoverableTransientPreSave(entry), true);
  entry.pageCheckpoints[0].saveAttemptCount = 1;
  assert.equal(isRecoverableTransientPreSave(entry), false);
});

test("rifiuta fail-closed stati probing o recovery_queued incoerenti", () => {
  const malformedProbe = recoveryQueuedFixture();
  malformedProbe.items[0].state = "operator_intervention";
  malformedProbe.items[0].uncertainPageSave.status = "probing";
  assert.match(resolveUncertainSaveLifecycle(malformedProbe, "fixture-recovery").reason, /probing_save_intent_invalid/);

  const malformedRecovery = recoveryQueuedFixture();
  malformedRecovery.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  assert.match(resolveUncertainSaveLifecycle(malformedRecovery, "fixture-recovery").reason, /recovery_budget_not_one/);
});

const terminalNestedScreeningFixture = () => ({
  status: "completed",
  items: [{
    customerKey: "fixture-screening",
    state: "operator_intervention",
    draftId: "460574",
    createAttemptCount: 1,
    saveAttemptCount: 0,
    uncertainPageSave: {
      pageId: "screening:2",
      status: "operator_required",
      operatorDecision: null,
      probes: [{ method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "probe-1" }],
    },
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

test("riapre il worker soltanto con due prove canoniche indipendenti di assenza delle righe", () => {
  const lifecycle = resolveUncertainSaveLifecycle(terminalNestedScreeningFixture(), "fixture-screening", canonicalAbsenceDriverFixture());
  assert.equal(lifecycle.kind, "wait_for_worker_resume");
  assert.deepEqual(lifecycle.evidenceIds, ["absence-1", "absence-2"]);
});

test("mantiene terminale fail-closed se una prova di assenza non e canonica o il budget e consumato", () => {
  const nonCanonical = canonicalAbsenceDriverFixture();
  nonCanonical.pageSaveDiagnostics[1].authenticated = false;
  assert.equal(resolveUncertainSaveLifecycle(terminalNestedScreeningFixture(), "fixture-screening", nonCanonical).kind, "terminal_operator");

  const exhausted = terminalNestedScreeningFixture();
  exhausted.items[0].pageCheckpoints[0].recoverySaveAttemptCount = 1;
  assert.equal(resolveUncertainSaveLifecycle(exhausted, "fixture-screening", canonicalAbsenceDriverFixture()).kind, "terminal_operator");
});
