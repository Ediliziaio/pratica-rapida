const screeningOnly = (blocker) => {
  const code = String(blocker?.code ?? "");
  const field = String(blocker?.field ?? blocker?.fieldId ?? "").toLowerCase();
  const reason = String(blocker?.reason ?? blocker?.message ?? "");
  return /^(?:screenings?|schermature?)(?:\.|$)/.test(field)
    || ["crm-source-not-screening", "screenings_missing", "screening_primary_measurements_missing", "screening-list-empty"].includes(code)
    || /^(?:missing|review)-schermature(?:\.|$)/.test(code)
    || /^(?:screening|persiana|avvolgibile|zanzariera)_/.test(code)
    || (/^invoice_[a-f0-9]{8}$/.test(code) && /nessuna riga di schermatura con dimensioni e gtot/i.test(reason));
};

const normalizedOperatorBlockers = (blockers) => blockers.map((blocker) => typeof blocker === "string"
  ? Object.freeze({ code: blocker })
  : Object.freeze({
    code: String(blocker?.code ?? blocker?.blockId ?? "operator_required"),
    ...(blocker?.reason || blocker?.message ? { message: String(blocker.reason ?? blocker.message) } : {}),
    ...(blocker?.question ? { question: String(blocker.question) } : {}),
  }));

export const SEQUENCER_RECOVERY_QUEUED_SERVER_PROOF_RULE_ID = "system-sequencer-recovery-queued-server-proof-v1";
export const SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID = "system-sequencer-uncertain-save-probe-lifecycle-v1";
export const SEQUENCER_SCREENING_CANONICAL_ABSENCE_RESUME_RULE_ID = "system-sequencer-screening-canonical-absence-resume-v1";
export const SEQUENCER_SCREENING_RECOVERY_FILLING_LIFECYCLE_RULE_ID = "system-sequencer-screening-recovery-filling-lifecycle-v1";
export const SEQUENCER_SINGLE_PAGE_RECOVERY_FILLING_LIFECYCLE_RULE_ID = "system-sequencer-single-page-recovery-filling-lifecycle-v1";
export const SEQUENCER_RECOVERY_PREPARED_WINDOW_LIFECYCLE_RULE_ID = "system-sequencer-recovery-prepared-window-lifecycle-v1";
export const SEQUENCER_SINGLE_PAGE_RECOVERY_SAVE_INTENT_LIFECYCLE_RULE_ID = "system-sequencer-single-page-recovery-save-intent-lifecycle-v1";
export const SEQUENCER_RECOVERABLE_TRANSIENT_PRE_SAVE_OBSERVATION_RULE_ID = "system-sequencer-recoverable-transient-pre-save-observation-v1";
export const SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID = "system-sequencer-deep-review-terminal-gate-v1";

const normalizedPageId = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");

const nestedScreeningRecoveryStructurallyEligible = (item) => {
  if (item?.state !== "operator_intervention" || !String(item?.draftId ?? "").trim() || item?.createAttemptCount !== 1 || item?.saveAttemptCount !== 0) return false;
  const screenings = (item.pageCheckpoints ?? []).filter((checkpoint) => String(checkpoint?.pageId ?? "").startsWith("screening:"));
  if (!screenings.length || screenings.some((checkpoint) => checkpoint?.recoverySaveAttemptCount !== 0)) return false;
  const uncertainScreening = String(item?.uncertainPageSave?.pageId ?? "").startsWith("screening:") ? item.uncertainPageSave.pageId : null;
  const statesValid = screenings.every((checkpoint) => {
    if (checkpoint?.state === "pending") return checkpoint.saveAttemptCount === 0;
    if (checkpoint?.state === "staged") return checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.stagedEvidenceId);
    if (checkpoint?.state === "saved") return checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.savedEvidenceId);
    return checkpoint?.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.pageId === uncertainScreening;
  });
  if (!statesValid || !screenings.some((checkpoint) => checkpoint.saveAttemptCount === 1)) return false;
  const summary = (item.pageCheckpoints ?? []).find((checkpoint) => !String(checkpoint?.pageId ?? "").startsWith("screening:")
    && /schermatur|infiss/.test(normalizedPageId(checkpoint?.pageId)));
  return Boolean(summary?.state === "pending" && summary.saveAttemptCount === 0 && summary.recoverySaveAttemptCount === 0 && uncertainScreening);
};

const conclusiveCanonicalScreeningAbsenceProofs = (driver, item) => {
  const expectedPath = `/pratica/ecobonus/2026/serramenti/${item.draftId}`;
  const proofs = (driver?.pageSaveDiagnostics ?? [])
    .filter((diagnostic) => diagnostic?.kind === "screening-summary-readonly-v4"
      && diagnostic.customerKey === item.customerKey
      && diagnostic.draftId === item.draftId)
    .slice(-2);
  if (proofs.length !== 2 || new Set(proofs.map((proof) => proof?.evidenceId)).size !== 2) return [];
  return proofs.every((proof) => {
    let pathname = "";
    try { pathname = new URL(String(proof?.url ?? "")).pathname; } catch { return false; }
    return pathname === expectedPath
      && Boolean(proof?.evidenceId)
      && proof.allowlistedOrigin === true
      && proof.authenticated === true
      && proof.expectedHeadersPresent === true
      && proof.filtersClear === true
      && proof.loading === false
      && proof.surfaceReady === true
      && proof.emptyMarkerVisible === true
      && proof.rowCount === 0
      && Array.isArray(proof.rows)
      && proof.rows.length === 1
      && Array.isArray(proof.rows[0])
      && proof.rows[0].length === 1
      && proof.rows[0][0] === "Nessun elemento";
  }) ? proofs : [];
};

const nestedScreeningRecoveryFillingEligible = (execution, item, proofs) => {
  if (execution?.status !== "running" || execution?.currentCustomerKey !== item?.customerKey || item?.state !== "filling" || item?.uncertainPageSave?.status !== "recovery_authorized" || !String(item?.uncertainPageSave?.pageId ?? "").startsWith("screening:") || proofs.length !== 2) return false;
  const canonicalRecoveryEvidenceId = proofs[1].evidenceId;
  const partialRecoveryProbe = item.uncertainPageSave.probes?.find((probe) => probe?.method === "persisted_fields_get"
    && probe?.outcome === "inconclusive"
    && /^0\/\d+ campi coincidono: prova non conclusiva\.$/.test(String(probe?.reason ?? "")));
  const partialRecoveryAudit = partialRecoveryProbe && (execution?.audit ?? []).some((entry) => entry?.type === "infissi_partial_rows_requeued_after_empty_canonical_summary"
    && entry?.customerKey === item.customerKey
    && String(entry?.commandId ?? "").includes(`:${item.draftId}:`)
    && String(entry?.commandId ?? "").includes(`:${partialRecoveryProbe.evidenceId}:`)
    && item.serverEvidenceIds?.includes(partialRecoveryProbe.evidenceId));
  const allowedRecoveryEvidenceIds = new Set([
    canonicalRecoveryEvidenceId,
    ...(partialRecoveryAudit ? [partialRecoveryProbe.evidenceId] : []),
  ]);
  const screenings = (item.pageCheckpoints ?? []).filter((checkpoint) => String(checkpoint?.pageId ?? "").startsWith("screening:"));
  if (!screenings.length || screenings.some((checkpoint) => checkpoint?.state !== "pending" || checkpoint?.recoverySaveAttemptCount !== 0)) return false;
  const attempted = screenings.filter((checkpoint) => checkpoint.saveAttemptCount === 1);
  const untouched = screenings.filter((checkpoint) => checkpoint.saveAttemptCount === 0);
  if (!attempted.length
    || new Set(attempted.map((checkpoint) => checkpoint.recoveryAuthorizedEvidenceId)).size !== 1
    || attempted.some((checkpoint) => !allowedRecoveryEvidenceIds.has(checkpoint.recoveryAuthorizedEvidenceId))
    || untouched.some((checkpoint) => checkpoint.recoveryAuthorizedEvidenceId != null)) return false;
  const summary = (item.pageCheckpoints ?? []).find((checkpoint) => !String(checkpoint?.pageId ?? "").startsWith("screening:") && /schermatur|infiss/.test(normalizedPageId(checkpoint?.pageId)));
  return Boolean(summary?.state === "pending" && summary.saveAttemptCount === 0 && summary.recoverySaveAttemptCount === 0);
};

const singlePageRecoveryInFlightEligible = (execution, item) => {
  if (execution?.status !== "running"
    || execution?.currentCustomerKey !== item?.customerKey
    || !["filling", "save_intent_recorded"].includes(item?.state)
    || !String(item?.draftId ?? "").trim()) return false;
  const resolution = item?.uncertainPageSave;
  if (resolution?.status !== "recovery_authorized" || resolution.operatorDecision) return false;
  const serverProofs = (resolution.probes ?? []).filter((probe) => probe?.method === "persisted_fields_get" && probe?.outcome === "not_saved");
  if (serverProofs.length !== 1) return false;
  const serverProof = serverProofs[0];
  const evidenceId = String(serverProof.evidenceId ?? "").trim();
  const canonicalUrl = String(serverProof.url ?? "").split(/[?#]/, 1)[0];
  if (!evidenceId
    || !/^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(canonicalUrl)
    || !canonicalUrl.endsWith(`/${item.draftId}`)
    || !(item.serverEvidenceIds ?? []).includes(evidenceId)) return false;
  const authorizedPages = (item.pageCheckpoints ?? []).filter((checkpoint) => checkpoint?.recoveryAuthorizedEvidenceId);
  if (authorizedPages.length !== 1) return false;
  const checkpoint = authorizedPages[0];
  const expectedCheckpointStates = item.state === "filling" ? new Set(["pending", "prepared"]) : new Set(["save_intent_recorded"]);
  const expectedRecoveryAttemptCount = item.state === "filling" ? 0 : 1;
  return checkpoint.pageId === resolution.pageId
    && expectedCheckpointStates.has(checkpoint.state)
    && (checkpoint.state !== "prepared" || (Boolean(checkpoint.preparedEvidenceId) && !checkpoint.savedEvidenceId))
    && checkpoint.saveAttemptCount === 1
    && checkpoint.recoverySaveAttemptCount === expectedRecoveryAttemptCount
    && checkpoint.recoveryAuthorizedEvidenceId === evidenceId
    && !(item.pageCheckpoints ?? []).some((candidate) => candidate !== checkpoint
      && (candidate.recoverySaveAttemptCount !== 0 || candidate.recoveryAuthorizedEvidenceId != null));
};

export function isRecoverableTransientPreSave(entry) {
  const checkpoints = entry?.pageCheckpoints ?? [];
  return Boolean(entry?.draftId)
    && /apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:(?:Promise was collected|Inspected target navigated or closed))/.test(entry?.reason ?? "")
    && checkpoints.some((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
    && checkpoints.every((checkpoint) => checkpoint.state === "saved"
      || (checkpoint.state === "staged" && checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.stagedEvidenceId))
      || (checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0));
}

export function resolveUncertainSaveLifecycle(execution, customerKey, driver = null) {
  const item = execution?.items?.find((candidate) => candidate.customerKey === customerKey);
  const resolution = item?.uncertainPageSave;
  if (!resolution) return Object.freeze({ kind: "not_applicable" });
  const invalid = (reason) => Object.freeze({
    kind: "invalid",
    reason: `${customerKey}:uncertain_save_lifecycle_invalid:${reason}`,
    ruleId: SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID,
  });
  const page = item.pageCheckpoints?.find((candidate) => candidate.pageId === resolution.pageId);
  if (!String(item.draftId ?? "").trim() || !String(resolution.pageId ?? "").trim() || !page) return invalid("draft_page_checkpoint_missing");
  if (!Array.isArray(resolution.probes) || resolution.probes.length > 3) return invalid("probe_set_invalid");
  if (new Set(resolution.probes.map((probe) => probe?.method)).size !== resolution.probes.length) return invalid("duplicate_probe_method");

  if (item.state === "operator_intervention" && resolution.status === "probing") {
    if (page.state !== "save_intent_recorded" || page.saveAttemptCount !== 1 || page.recoverySaveAttemptCount !== 0) return invalid("probing_save_intent_invalid");
    return Object.freeze({ kind: "wait_for_probes", item, ruleId: SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID });
  }
  if (item.state === "recovery_queued" && resolution.status === "recovery_authorized") {
    const recovery = resolveRecoveryQueuedPreflight(execution, customerKey);
    if (recovery.kind !== "ready") return invalid(recovery.reason ?? "recovery_preflight_invalid");
    return Object.freeze({ kind: "wait_for_worker_resume", item, ruleId: SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID });
  }
  // "resolved_saved" e' legittimo con la pratica in recovery_queued, in
  // filling oppure gia' in save_intent_recorded sulla pagina successiva: e'
  // l'istante in cui la GET canonica ha provato il salvataggio e il worker sta
  // gia' proseguendo. Fino al 14/09/2026 la coppia filling/resolved_saved
  // cadeva nel ramo "state_status_mismatch" e il sequencer isolava una
  // lavorazione sana (Lucia Droghetti, coorte 9218: prima pagina persistita e
  // provata, 1/8). Il 16/09/2026 la stessa pratica (coorte 10370) e' caduta un
  // passo dopo: pagina Schermature risolta e completata, worker gia' con
  // l'intento di salvataggio registrato su «Calcolo costi», coppia
  // save_intent_recorded/resolved_saved. La prova richiesta e' identica: una
  // sola sonda "saved", checkpoint della pagina risolta "saved" con la stessa
  // evidenza, pagina risolta gia' fra le completate.
  if ((item.state === "recovery_queued" || item.state === "filling" || item.state === "save_intent_recorded") && resolution.status === "resolved_saved") {
    const savedProofs = resolution.probes.filter((probe) => probe?.outcome === "saved");
    if (savedProofs.length !== 1 || page.state !== "saved" || page.savedEvidenceId !== savedProofs[0].evidenceId || !item.completedPageIds?.includes(resolution.pageId)) return invalid("resolved_saved_proof_invalid");
    return Object.freeze({ kind: "wait_for_worker_resume", item, ruleId: SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID });
  }
  if (item.state === "filling" && resolution.status === "recovery_authorized") {
    if (singlePageRecoveryInFlightEligible(execution, item)) return Object.freeze({
      kind: "wait_for_worker_resume",
      item,
      evidenceIds: resolution.probes.filter((probe) => probe?.method === "persisted_fields_get" && probe?.outcome === "not_saved").map((probe) => probe.evidenceId),
      ruleId: page.state === "prepared" ? SEQUENCER_RECOVERY_PREPARED_WINDOW_LIFECYCLE_RULE_ID : SEQUENCER_SINGLE_PAGE_RECOVERY_FILLING_LIFECYCLE_RULE_ID,
    });
    const absenceProofs = conclusiveCanonicalScreeningAbsenceProofs(driver, item);
    if (!nestedScreeningRecoveryFillingEligible(execution, item, absenceProofs)) return invalid("recovery_filling_checkpoint_invalid");
    return Object.freeze({
      kind: "wait_for_worker_resume",
      item,
      evidenceIds: absenceProofs.map((proof) => proof.evidenceId),
      ruleId: SEQUENCER_SCREENING_RECOVERY_FILLING_LIFECYCLE_RULE_ID,
    });
  }
  if (item.state === "save_intent_recorded" && resolution.status === "recovery_authorized") {
    if (!singlePageRecoveryInFlightEligible(execution, item)) return invalid("recovery_save_intent_checkpoint_invalid");
    return Object.freeze({
      kind: "wait_for_probes",
      item,
      evidenceIds: resolution.probes.filter((probe) => probe?.method === "persisted_fields_get" && probe?.outcome === "not_saved").map((probe) => probe.evidenceId),
      ruleId: SEQUENCER_SINGLE_PAGE_RECOVERY_SAVE_INTENT_LIFECYCLE_RULE_ID,
    });
  }
  if (item.state === "operator_intervention" && resolution.status === "operator_required") {
    if (!resolution.probes.length && !resolution.operatorDecision) return invalid("operator_required_without_probe_or_decision");
    const absenceProofs = nestedScreeningRecoveryStructurallyEligible(item)
      ? conclusiveCanonicalScreeningAbsenceProofs(driver, item)
      : [];
    if (absenceProofs.length === 2) return Object.freeze({
      kind: "wait_for_worker_resume",
      item,
      evidenceIds: absenceProofs.map((proof) => proof.evidenceId),
      ruleId: SEQUENCER_SCREENING_CANONICAL_ABSENCE_RESUME_RULE_ID,
    });
    return Object.freeze({ kind: "terminal_operator", item, ruleId: SEQUENCER_UNCERTAIN_SAVE_LIFECYCLE_RULE_ID });
  }
  return invalid(`state_status_mismatch:${item.state}:${resolution.status}`);
}

export function resolveRecoveryQueuedPreflight(execution, customerKey) {
  const item = execution?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (item?.state !== "recovery_queued") return Object.freeze({ kind: "not_applicable" });
  if (item.uncertainPageSave?.status === "resolved_saved") return Object.freeze({ kind: "not_applicable" });

  const invalid = (reason) => Object.freeze({
    kind: "invalid",
    reason: `${customerKey}:recovery_queued_preflight_invalid:${reason}`,
    ruleId: SEQUENCER_RECOVERY_QUEUED_SERVER_PROOF_RULE_ID,
  });
  if (execution?.status !== "ready") return invalid("execution_not_ready");
  if (!String(item.draftId ?? "").trim()) return invalid("draft_id_missing");

  const resolution = item.uncertainPageSave;
  if (!resolution || resolution.status !== "recovery_authorized" || resolution.operatorDecision) return invalid("server_recovery_not_authorized");
  const serverProofs = (resolution.probes ?? []).filter((probe) => probe?.method === "persisted_fields_get" && probe?.outcome === "not_saved");
  if (serverProofs.length !== 1) return invalid("single_not_saved_server_proof_required");
  const serverProof = serverProofs[0];
  const evidenceId = String(serverProof.evidenceId ?? "").trim();
  const canonicalUrl = String(serverProof.url ?? "").split(/[?#]/, 1)[0];
  if (!evidenceId || !/^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(canonicalUrl) || !canonicalUrl.endsWith(`/${item.draftId}`)) return invalid("canonical_same_draft_server_proof_required");
  if (!(item.serverEvidenceIds ?? []).includes(evidenceId)) return invalid("server_proof_not_persisted");

  const authorizedPages = (item.pageCheckpoints ?? []).filter((checkpoint) => checkpoint?.recoveryAuthorizedEvidenceId);
  if (authorizedPages.length !== 1) return invalid("single_authorized_page_required");
  const checkpoint = authorizedPages[0];
  if (checkpoint.pageId !== resolution.pageId) return invalid("authorized_page_mismatch");
  if (checkpoint.state !== "pending" || checkpoint.saveAttemptCount !== 1) return invalid("primary_save_intent_not_exhausted");
  if (checkpoint.recoverySaveAttemptCount !== 0) return invalid("recovery_budget_not_one");
  if (checkpoint.recoveryAuthorizedEvidenceId !== evidenceId) return invalid("authorization_evidence_mismatch");
  if ((item.pageCheckpoints ?? []).some((candidate) => candidate !== checkpoint && candidate.recoverySaveAttemptCount !== 0)) return invalid("other_recovery_attempt_present");

  return Object.freeze({
    kind: "ready",
    item,
    evidenceId,
    remainingRecoveryBudget: 1,
    ruleId: SEQUENCER_RECOVERY_QUEUED_SERVER_PROOF_RULE_ID,
  });
}

export function resolveCommonPreflightBlock(checkpoint, customerKey, productModule = "screening") {
  const item = checkpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (item?.state !== "blocked_case") return null;
  const reportBlockers = [...(item.report?.blockers ?? item.blockers ?? [])];
  const auditBlockers = [...(item.report?.eneaPayloadAudit?.blockers ?? [])];
  const applicableReport = productModule === "infissi" ? reportBlockers.filter((blocker) => !screeningOnly(blocker)) : reportBlockers;
  const applicableAudit = productModule === "infissi" ? auditBlockers.filter((blocker) => !screeningOnly(blocker)) : auditBlockers;
  if (productModule === "infissi" && reportBlockers.length + auditBlockers.length > 0 && applicableReport.length + applicableAudit.length === 0) return null;
  const applicable = applicableReport.length ? applicableReport : applicableAudit;
  return Object.freeze({
    customerKey,
    state: "blocked_case",
    reason: item.reason ?? "Preflight comune bloccato senza motivazione leggibile.",
    blockerCodes: Object.freeze([...(applicable.length ? applicable : item.blockerCodes ?? [])].map((blocker) =>
      typeof blocker === "string" ? blocker : blocker?.code,
    ).filter(Boolean)),
    operatorGateBlockers: Object.freeze(normalizedOperatorBlockers(applicableReport)),
  });
}

export function resolveInfissiPreflightDisposition(commonCheckpoint, productCheckpoint, customerKey) {
  const productItem = productCheckpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (productCheckpoint?.status === "completed") {
    if (productItem) return Object.freeze({ kind: "product", item: productItem });
    const documentedNonInfissiBlock = resolveCommonPreflightBlock(commonCheckpoint, customerKey, "screening");
    if (documentedNonInfissiBlock) return Object.freeze({ kind: "common_block", block: documentedNonInfissiBlock });
    return Object.freeze({ kind: "inconsistent", reason: `${customerKey}:product_gate_missing_after_completed_infissi_preflight` });
  }
  const sharedBlock = resolveCommonPreflightBlock(commonCheckpoint, customerKey, "infissi");
  return sharedBlock ? Object.freeze({ kind: "common_block", block: sharedBlock }) : Object.freeze({ kind: "wait" });
}

export function resolvePersistedPreflightBlock(commonCheckpoint, productCheckpoint, customerKey, productModule) {
  const directlyApplicable = resolveCommonPreflightBlock(commonCheckpoint, customerKey, productModule);
  if (directlyApplicable) return directlyApplicable;
  if (productModule === "infissi") {
    const disposition = resolveInfissiPreflightDisposition(commonCheckpoint, productCheckpoint, customerKey);
    if (disposition.kind === "common_block") return disposition.block;
    const productBlock = resolveCommonPreflightBlock(productCheckpoint, customerKey, "screening");
    if (productBlock) return productBlock;
  }
  return null;
}

const sortedUnique = (values) => [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();

// A blocked preflight is only an observation. It becomes terminal only after
// the independent deep review has finished and classified the same blocker
// set. This prevents the sequencer from quiescing the supervisor while the
// review is still queued/reviewing.
export function resolvePreflightTerminalDisposition(commonCheckpoint, productCheckpoint, deepReviewCheckpoint, customerKey, productModule) {
  const block = resolvePersistedPreflightBlock(commonCheckpoint, productCheckpoint, customerKey, productModule);
  if (!block) return Object.freeze({ kind: "not_blocked", ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });

  const review = deepReviewCheckpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (deepReviewCheckpoint?.status !== "completed" || !review || ["queued", "reviewing"].includes(review.state) || !review.endedAt || !review.classification) {
    return Object.freeze({ kind: "wait", block, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
  }

  const blockCodes = sortedUnique(block.blockerCodes ?? []);
  const reviewCodes = sortedUnique(review.blockerCodes ?? []);
  if (JSON.stringify(blockCodes) !== JSON.stringify(reviewCodes)) {
    return Object.freeze({ kind: "inconsistent", block, review, reason: `${customerKey}:preflight_deep_review_blocker_mismatch:${blockCodes.join(",")}:${reviewCodes.join(",")}`, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
  }
  if (review.classification === "TECHNICAL_REPAIR" && review.state === "technical_repair") {
    return Object.freeze({ kind: "technical_block", block, review, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
  }
  if (review.classification === "OPERATOR_REQUIRED" && review.state === "operator_required") {
    return Object.freeze({ kind: "operator_required", block, review, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
  }
  if (review.classification === "BUSINESS_RULE_REQUIRED" && review.state === "business_rule_required") {
    return Object.freeze({ kind: "operator_required", block, review, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
  }
  return Object.freeze({ kind: "inconsistent", block, review, reason: `${customerKey}:preflight_deep_review_terminal_contradiction:${review.state}:${review.classification}`, ruleId: SEQUENCER_DEEP_REVIEW_TERMINAL_GATE_RULE_ID });
}

export function buildPreflightWaitHeartbeat(item, gate, nowIso) {
  return Object.freeze({
    phase: "preflight_wait",
    phaseHeartbeatAt: nowIso,
    nextAction: `Attendere il completamento del gate ${gate} per ${item.displayName}.`,
    detail: Object.freeze({
      customerKey: item.customerKey,
      cohort: item.cohort,
      gate,
      phase: "preflight_wait",
      heartbeatAt: nowIso,
    }),
  });
}
