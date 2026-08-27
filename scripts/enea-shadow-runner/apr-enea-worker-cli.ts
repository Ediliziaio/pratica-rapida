#!/usr/bin/env node
import path from "node:path";
import { readFileSync } from "node:fs";
import { PersistentAprEneaBrowserWorker, type AprEneaDraftPackage, type AprEneaPageSaveProbeEvidence } from "./aprEneaBrowserWorker";
import { CdpEneaBrowserDriver, classifyPersistedPageFieldsReadOnly, eneaGeneratorActivationLabels, matchingScreeningRowIndexes, portalNumberValue } from "./cdpEneaBrowserDriver";
import { PersistentAprChromeRuntime } from "./cdpClient";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprCohortSeed } from "./aprCohortSeed";
import { isTransientCdpReadOnlyFailure, nestedPageAbsenceRecoveryCandidate, PersistentAprEneaDraftExecution, savedPayloadPostCompletionVerificationEligible, type AprNestedPageAbsenceEvidence } from "./eneaDraftExecution";
import { aprEneaKeepaliveInterval, isAprEneaKeepaliveDue, PersistentAprEneaWorkerService, shouldHoldAprEneaKeepaliveState } from "./aprEneaBrowserWorkerService";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { nestedUncertainPageSaveProbeAllowed } from "./infissiUncertainSavePolicy";
import { APR_REQUIRED_INFISSI_VALIDATION_REVISIONS, dateGateReleaseReadyCustomerKeys, infissiExecutionGateReady } from "./infissiExecutionGate";
import { PersistentAprEneaOperationalBridge } from "./aprEneaOperationalBridge";
import type { AprEneaMappingArtifact } from "./aprEneaPureMapper";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const mode = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const intervalMs = Number(option("--interval-ms") ?? "2000");
const service = new PersistentAprEneaWorkerService(rootDirectory);
const instanceId = `apr-enea-worker-service-${process.pid}-${crypto.randomUUID()}`;

function fieldVerificationRecoveryRevision(reason: string) {
  if (/co_beneficiary_trusted_input_not_verified/.test(reason)) return "co-beneficiary-modal-scoped-fields-v55";
  if (/id-comune(?:_nascita|_residenza)?/.test(reason)) return "municipality-authoritative-istat-code-selection-v68";
  if (/id-costo(?:,|$)/.test(reason)) return "locale-numeric-cost-v58";
  return "foreign-place-free-text-v56";
}

function print(value: unknown) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function loadLegacyDraftPackage(customerKey: string): AprEneaDraftPackage {
  const infissi = new PersistentAprInfissiBatchPreflight(rootDirectory);
  const infissiItem = infissi.snapshot().items.find((item) => item.customerKey === customerKey);
  if (infissiItem?.state === "ready_local_plan") return infissi.buildDraftExecutionPackage(customerKey);
  const analysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
  return new PersistentAprCrmLocalPreflight(rootDirectory, analysis).buildDraftExecutionPackage(customerKey);
}
function loadDraftPackage(customerKey: string): AprEneaDraftPackage {
  return new PersistentAprEneaOperationalBridge(rootDirectory).apply(loadLegacyDraftPackage(customerKey));
}
async function advanceRepeatDeletionGate(driver: CdpEneaBrowserDriver) {
  const seedStore = new PersistentAprCohortSeed(rootDirectory);
  const seed = seedStore.load();
  if (!seed?.repeatTest || seed.repeatTest.deletionProofRequired === false || seed.status === "deletion_verified") return seed;
  const proof = await driver.verifyDraftIdsAbsentReadOnly(seed.repeatTest.priorDrafts.map((item) => item.draftId));
  return seedStore.recordRepeatDeletionObservation(proof.presentDraftIds, proof.evidenceId);
}
async function serve() {
  if (!Number.isInteger(intervalMs) || intervalMs < 500) throw new Error("apr_enea_worker_interval_invalid");
  let running = true;
  let runtime: PersistentAprChromeRuntime | null = null;
  let runtimeKey: string | null = null;
  const stop = () => {
    running = false;
    runtime?.closeAllPageClients();
    if (runtime) service.recordCdpConnections(runtime.connectionStats());
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  while (running) {
    const config = service.loadConfig();
    if (!config.setupEnabled) {
      runtime?.closeAllPageClients(); runtime = null; runtimeKey = null;
      service.record({ instanceId, processPid: process.pid, status: "disabled", type: "heartbeat_disabled", reason: "Servizio attivo ma setup browser disabilitato: nessuna finestra e nessuna azione ENEA.", nextAction: "Abilitare il setup soltanto dopo collaudo locale verde." });
      await new Promise((resolve) => setTimeout(resolve, intervalMs)); continue;
    }
    const nextRuntimeKey = JSON.stringify([config.chromeExecutable, config.profileDirectory, config.remoteDebuggingPort, config.dashboardUrl]);
    if (!runtime || runtimeKey !== nextRuntimeKey) {
      runtime?.closeAllPageClients();
      runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
      runtimeKey = nextRuntimeKey;
    }
    const activeRuntime = runtime;
    try {
      if (!["starting_browser", "login_required", "setup_ready", "running", "completed", "technical_block"].includes(service.loadState().status)) service.record({ instanceId, processPid: process.pid, status: "starting_browser", type: "browser_starting", reason: "APR avvia o riaggancia il proprio Chrome persistente.", nextAction: "Verificare la sessione ENEA nel profilo APR." });
      const browser = await activeRuntime.ensureRunning();
      const chromePid = browser.pid ?? service.loadState().chromePid;
      const driver = new CdpEneaBrowserDriver(rootDirectory, activeRuntime, { allowedOrigin: config.allowedOrigin, dashboardUrl: config.dashboardUrl });
      const authenticationJourney = await driver.inspectExternalAuthenticationJourneyReadOnly();
      if (authenticationJourney.inProgress) {
        service.record({
          instanceId,
          processPid: process.pid,
          status: "login_required",
          type: "external_login_in_progress",
          reason: "Autenticazione SPID in corso nella scheda esistente: APR sospende i controlli ENEA e non apre altre finestre.",
          nextAction: "Completare SPID nella stessa scheda; APR riprenderà automaticamente dopo il ritorno al dominio ENEA.",
          chromePid,
          profileFingerprint: browser.profileFingerprint,
          sessionEvidenceId: authenticationJourney.evidenceId,
        });
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      if (!config.operationalEnabled) {
        const current = service.loadState();
        const lastSessionCheckAt = driver.snapshot().events.filter((event) => event.action === "verify_session_dom_server_get").at(-1)?.at ?? null;
        const setupCheckIntervalMs = current.status === "login_required" ? 30_000 : config.keepaliveIntervalMs;
        const sessionCheckDue = !lastSessionCheckAt || Date.now() - Date.parse(lastSessionCheckAt) >= setupCheckIntervalMs;
        if (!sessionCheckDue && ["login_required", "setup_ready"].includes(current.status)) {
          if (current.status === "setup_ready") {
            // Preflight and draft preparation run independently in the supervisor.
            // Re-evaluate the queue gate on every cheap setup tick, otherwise a
            // negative result is cached until the next (much slower) session GET.
            await advanceRepeatDeletionGate(driver);
            const autoArm = service.autoArm();
            service.record({ instanceId, processPid: process.pid, status: "setup_ready", type: autoArm.armed ? "operational_auto_armed" : "operational_auto_arm_waiting", reason: autoArm.armed ? "Gate reale verificato: APR ha armato autonomamente la coda senza comando Codex." : `Contratto DOM verde; auto-arm in attesa: ${autoArm.reason}.`, nextAction: autoArm.armed ? "Al prossimo tick APR reclama la prima pratica pronta e procede in sequenza dal checkpoint." : "APR ripeterà il gate automaticamente; nessuna pratica viene selezionata finché non è verde.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: current.sessionEvidenceId });
          } else {
            service.record({ instanceId, processPid: process.pid, status: current.status, type: current.status, reason: current.reason, nextAction: current.nextAction, chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: current.sessionEvidenceId });
          }
        } else {
          const session = await driver.verifySession();
          if (!session.authenticated) service.record({ instanceId, processPid: process.pid, status: "login_required", type: "login_required", reason: session.serverLogoutProven ? "Logout ENEA provato dal worker APR." : "Autenticazione ENEA non ancora dimostrata nel profilo APR.", nextAction: "Completare una sola volta il login ENEA nella finestra del profilo APR; il worker riprenderà da solo.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: session.evidenceId });
          else {
            const contract = await driver.inspectPortalContractReadOnly();
            if (contract.ready) {
              service.record({ instanceId, processPid: process.pid, status: "setup_ready", type: "setup_ready", reason: "Profilo Chrome APR, sessione ENEA e ingresso Nuova pratica verificati in sola lettura.", nextAction: "APR verifica autonomamente il gate minimo di due pratiche; nessuna pratica è ancora selezionata.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: contract.evidenceId });
              await advanceRepeatDeletionGate(driver);
              const autoArm = service.autoArm();
              service.record({ instanceId, processPid: process.pid, status: "setup_ready", type: autoArm.armed ? "operational_auto_armed" : "operational_auto_arm_waiting", reason: autoArm.armed ? "Gate reale verificato: APR ha armato autonomamente la coda senza comando Codex." : `Contratto DOM verde; auto-arm in attesa: ${autoArm.reason}.`, nextAction: autoArm.armed ? "Al prossimo tick APR reclama la prima pratica pronta e procede in sequenza dal checkpoint." : "APR ripeterà il gate automaticamente; nessuna pratica viene selezionata finché non è verde.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: contract.evidenceId });
            }
            else service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "dom_contract_not_ready", reason: "Sessione autenticata ma ingresso Nuova pratica non riconosciuto dal contratto DOM APR; nessuna pratica selezionata.", nextAction: "APR ripeterà esclusivamente l’ispezione read-only; operatività bloccata.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: contract.evidenceId });
          }
        }
      } else {
        const analysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
        const preflight = new PersistentAprCrmLocalPreflight(rootDirectory, analysis);
        const infissiPreflight = new PersistentAprInfissiBatchPreflight(rootDirectory);
        const execution = new PersistentAprEneaDraftExecution(rootDirectory);
        analysis.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v2");
        analysis.applyParserRevision("invoice-parser-v31-rinaldi-sp-dot-and-vat-layout");
        analysis.applyParserRevision("invoice-parser-v32-grk-vertical-number-date");
        analysis.applyParserRevision("invoice-parser-v33-header-identity-over-body-reference");
        analysis.applyParserRevision("invoice-parser-v34-linea-sole-partial-paper-scomparsa");
        analysis.applyParserRevision("invoice-parser-v35-composite-invoice-transfer-segmentation");
        analysis.applyParserRevision("invoice-parser-v36-screening-unit-surface-coherence");
        preflight.applyValidationRevision("single-unit-building-portal-mapping-v30");
        preflight.applyValidationRevision("rinaldi-sp-dot-and-vat-layout-v32");
        preflight.applyValidationRevision("grk-compact-financial-summary-v33");
        preflight.applyValidationRevision("grk-vertical-number-date-v34");
        preflight.applyValidationRevision("nonfiscal-technical-worksheet-v35");
        preflight.applyValidationRevision("nonfiscal-technical-financial-split-v36");
        preflight.applyValidationRevision("beneficiary-self-duplicate-co-owner-v37");
        preflight.applyValidationRevision("foreign-birth-z129-romania-v38");
        preflight.applyValidationRevision("foreign-birth-z312-dr-congo-v39");
        preflight.applyValidationRevision("beneficiary-italy-select-value-v40");
        preflight.applyValidationRevision("invoice-payment-schedule-sum-v44");
        preflight.applyValidationRevision("completion-date-operator-gate-v45");
        preflight.applyValidationRevision("completion-date-operator-gate-v46");
        preflight.applyValidationRevision("completion-date-operator-gate-v47");
        preflight.applyValidationRevision("bank-transfer-invoice-authority-v48");
        preflight.applyValidationRevision("invoice-header-identity-over-body-reference-v49");
        preflight.applyValidationRevision("enea-2026-june25-deadline-window-v50");
        preflight.applyValidationRevision("linea-sole-partial-paper-scomparsa-v51");
        preflight.applyValidationRevision("composite-invoice-transfer-segmentation-v52");
        preflight.applyValidationRevision("ideal-sistem-vertical-invoice-headings-v53");
        preflight.applyValidationRevision("ideal-sistem-columnar-financial-v54");
        preflight.applyValidationRevision("paper-form-birth-date-leading-digit-ocr-v55");
        preflight.applyValidationRevision("paper-form-identity-cf-segments-v56");
        preflight.applyValidationRevision("paper-form-invoice-confirmed-cf-v57");
        preflight.applyValidationRevision("draft-payload-mapping-completeness-v58");
        preflight.applyValidationRevision("composite-invoice-bank-transfer-payload-v59");
        preflight.applyValidationRevision("missing-explicit-advance-invoice-v60");
        preflight.applyValidationRevision("reverse-labeled-advance-reference-v61");
        preflight.applyValidationRevision("paper-form-birth-date-separator-ocr-v62");
        preflight.applyValidationRevision("screening-primary-measurements-operator-routing-v63");
        preflight.applyValidationRevision("screening-measurements-date-false-positive-v64");
        // Ricalcola il checkpoint comune con il routing basato sui prodotti
        // documentati. Senza questa revisione un servizio aggiornato potrebbe
        // continuare a pubblicare i blocker costruiti dalla vecchia etichetta
        // CRM pur usando il nuovo bundle.
        preflight.applyValidationRevision("documented-product-module-over-label-v65");
        // Una revisione fonti o un riavvio puo lasciare il preflight comune in
        // coda. Le bozze Infissi dipendono da CF e date risolti in quel
        // checkpoint: completarlo prima di costruire i pacchetti evita il race
        // `infissi_shared_mapping_not_ready` e non esegue azioni esterne.
        preflight.runToCompletion();
        for (const validationRevision of APR_REQUIRED_INFISSI_VALIDATION_REVISIONS) {
          infissiPreflight.applyValidationRevision(validationRevision);
        }
        infissiPreflight.tick();
        const preflightSnapshot = preflight.snapshot();
        const infissiSnapshot = infissiPreflight.snapshot();
        const infissiCandidateKeys = new Set(infissiSnapshot.items.map((item) => item.customerKey));
        const commonOnlySnapshot = infissiCandidateKeys.size > 0
          ? { ...preflightSnapshot, items: preflightSnapshot.items.filter((item) => !infissiCandidateKeys.has(item.customerKey)) }
          : preflightSnapshot;
        const infissiExecutionReady = infissiExecutionGateReady(infissiSnapshot);
        const operationalBridge = new PersistentAprEneaOperationalBridge(rootDirectory);
        const legacyDraftPackageFor = (customerKey: string): AprEneaDraftPackage => {
          const infissiItem = infissiSnapshot.items.find((item) => item.customerKey === customerKey);
          if (infissiItem) {
            if (!infissiExecutionReady || infissiItem.state !== "ready_local_plan") throw new Error("crm_enea_infissi_execution_gate_not_ready");
            return infissiPreflight.buildDraftExecutionPackage(customerKey);
          }
          return preflight.buildDraftExecutionPackage(customerKey);
        };
        const draftPackageFor = (customerKey: string): AprEneaDraftPackage => operationalBridge.apply(legacyDraftPackageFor(customerKey));
        execution.applyValidationOperatorGates(preflightSnapshot, "completion-date-operator-gate-v48-cross-module");
        if (infissiExecutionReady) {
          const readyAfterOfficialDeadlineRule = dateGateReleaseReadyCustomerKeys(preflightSnapshot.items, infissiSnapshot.items);
          execution.releaseResolvedDateOperatorGates(readyAfterOfficialDeadlineRule, "enea-2026-june25-deadline-window-v1");
        }
        const buildableInfissiPackages = () => infissiSnapshot.items
          .filter((item) => item.state === "ready_local_plan")
          .flatMap((item) => {
            try {
              return [infissiPreflight.buildDraftExecutionPackage(item.customerKey)];
            } catch {
              // Un mapping condiviso non ancora pronto appartiene alla singola
              // pratica: non deve impedire l'accodamento dei pacchetti verdi.
              return [];
            }
          });
        if (!execution.snapshot().sourceFingerprint) {
          const common = execution.prepare(commonOnlySnapshot);
          if (infissiExecutionReady && infissiSnapshot.sourceFingerprint) {
            const packages = buildableInfissiPackages();
            if (common.sourceFingerprint) execution.appendEligiblePackages(packages, infissiSnapshot.sourceFingerprint);
            else execution.preparePackages(packages, infissiSnapshot.sourceFingerprint);
          }
        }
        else {
          const validationRevision = preflightSnapshot.validationRevisionsApplied?.at(-1);
          if (validationRevision) execution.appendNewEligibleFromValidation(commonOnlySnapshot, validationRevision);
        }
        execution.resumePreExternalPackageFailures(commonOnlySnapshot, "worker:pre-external-package-repair:v2");
        if (infissiExecutionReady) {
          const packages = buildableInfissiPackages();
          if (execution.snapshot().sourceFingerprint && infissiSnapshot.sourceFingerprint) execution.appendEligiblePackages(packages, infissiSnapshot.sourceFingerprint);
          execution.resumeInfissiPackageAvailabilityFailures(packages, "local-infissi-validation-stable", "worker:infissi-package-availability-repair:v1");
        }
        execution.upgradeUncertainPageSaveOperatorInstructions("worker:operator-instruction-upgrade:v1");
        let executionBeforeTick = execution.snapshot();
        const driverBeforeTick = driver.snapshot();
        const correctedPayloadRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || !/beneficiario/i.test(item.uncertainPageSave.pageId)
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") return false;
          const updated = preflightSnapshot.items.find((candidate) => candidate.customerKey === item.customerKey);
          return Boolean(updated?.state === "ready_local_plan"
            && updated.report?.eneaPayloadAudit?.draftReady
            && updated.report.eneaPayloadAudit.portalGate.status === "ready"
            && updated.report.eneaPayloadAudit.mappingFingerprint
            && updated.report.eneaPayloadAudit.mappingFingerprint !== item.mappingFingerprint);
        });
        const correctedInfissiPackageRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || !/beneficiario/i.test(item.uncertainPageSave.pageId)
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") return false;
          const updated = infissiSnapshot.items.find((candidate) => candidate.customerKey === item.customerKey);
          if (updated?.state !== "ready_local_plan") return false;
          const updatedPackage = draftPackageFor(item.customerKey) as unknown as AprEneaDraftPackage;
          return updatedPackage.module === "infissi" && updatedPackage.packageFingerprint !== item.mappingFingerprint;
        });
        const correctedInfissiPrimaryPackageRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || !/beneficiario/i.test(item.uncertainPageSave.pageId)
            || item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === item.uncertainPageSave?.pageId)?.recoverySaveAttemptCount !== 0
            || !item.uncertainPageSave.probes.some((probe) => probe.method === "persisted_fields_get" && probe.outcome === "inconclusive")) return false;
          const updated = infissiSnapshot.items.find((candidate) => candidate.customerKey === item.customerKey);
          if (updated?.state !== "ready_local_plan") return false;
          const updatedPackage = draftPackageFor(item.customerKey) as unknown as AprEneaDraftPackage;
          if (updatedPackage.module !== "infissi" || updatedPackage.packageFingerprint === item.mappingFingerprint) return false;
          const diagnostic = driverBeforeTick.pageDiagnostics?.find((candidate) => candidate.customerKey === item.customerKey && candidate.draftId === item.draftId && candidate.pageId === item.uncertainPageSave?.pageId);
          const normalizedFields = diagnostic?.fields.map((field) => field.portalId === "semantic:beneficiary:co-beneficiary-tax-code" && field.actual === "<missing>" ? { ...field, actual: "" } : field) ?? [];
          return classifyPersistedPageFieldsReadOnly(normalizedFields) === "not_saved";
        });
        const legacyInfissiRowsRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.completedPageIds.length > 0
          && !item.expectedPageIds.some((pageId) => pageId.startsWith("screening:"))
          && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId === "page:Serramenti e infissi" && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
          && /apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason));
        const legacyInfissiZeroRowsEvidence = legacyInfissiRowsRecovery?.draftId
          ? [...(driverBeforeTick.pageDiagnostics ?? [])].reverse().find((diagnostic) => diagnostic.customerKey === legacyInfissiRowsRecovery.customerKey
            && diagnostic.draftId === legacyInfissiRowsRecovery.draftId
            && diagnostic.pageId === "page:Serramenti e infissi"
            && /nessun elemento/i.test(diagnostic.surface?.text ?? ""))
          : null;
        const correctedRemainingPayloadRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Immobile"
            || item.completedPageIds.length < 1
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") return false;
          const updated = preflightSnapshot.items.find((candidate) => candidate.customerKey === item.customerKey);
          return Boolean(updated?.state === "ready_local_plan"
            && updated.report?.buildingQualification === "single_unit"
            && updated.report?.buildingUnitCount === 1
            && updated.report?.eneaPayloadAudit?.draftReady
            && updated.report.eneaPayloadAudit.portalGate.status === "ready"
            && updated.report.eneaPayloadAudit.mappingFingerprint
            && updated.report.eneaPayloadAudit.mappingFingerprint !== item.mappingFingerprint);
        });
        const correctedSavedPayloadRecovery = executionBeforeTick.items.find((item) => {
          const updated = preflightSnapshot.items.find((candidate) => candidate.customerKey === item.customerKey);
          const expectedMappingFingerprint = updated?.report?.eneaPayloadAudit?.mappingFingerprint;
          return Boolean(expectedMappingFingerprint
            && savedPayloadPostCompletionVerificationEligible(item, expectedMappingFingerprint)
            && updated?.state === "ready_local_plan"
            && updated.report?.buildingQualification === "single_unit"
            && updated.report?.buildingUnitCount === 1
            && updated.report?.eneaPayloadAudit?.draftReady
            && updated.report.eneaPayloadAudit.portalGate.status === "ready"
            && updated.report.eneaPayloadAudit.mappingFingerprint !== item.mappingFingerprint);
        });
        const reclassifiablePersistedFieldsProbe = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.uncertainPageSave?.status === "operator_required"
          && item.uncertainPageSave.probes.some((probe) => probe.method === "persisted_fields_get" && probe.outcome === "inconclusive"));
        if (executionBeforeTick.status === "completed" && reclassifiablePersistedFieldsProbe?.draftId && reclassifiablePersistedFieldsProbe.uncertainPageSave) {
          const pageId = reclassifiablePersistedFieldsProbe.uncertainPageSave.pageId;
          const diagnostic = driverBeforeTick.pageDiagnostics?.find((item) => item.customerKey === reclassifiablePersistedFieldsProbe.customerKey && item.draftId === reclassifiablePersistedFieldsProbe.draftId && item.pageId === pageId);
          const probe = reclassifiablePersistedFieldsProbe.uncertainPageSave.probes.find((item) => item.method === "persisted_fields_get" && item.outcome === "inconclusive");
          const commandId = probe ? `service:auto-reclassify-empty-persisted-fields:${reclassifiablePersistedFieldsProbe.customerKey}:${reclassifiablePersistedFieldsProbe.draftId}:${pageId}:${probe.evidenceId}:v1` : null;
          if (diagnostic && probe && commandId && classifyPersistedPageFieldsReadOnly(diagnostic.fields) === "not_saved" && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.reclassifyPersistedFieldsProbeAsNotSaved(reclassifiablePersistedFieldsProbe.customerKey, probe.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "empty_persisted_fields_auto_reclassified", reason: `${reclassifiablePersistedFieldsProbe.displayName}: GET canonica prova campi identificativi vuoti; autorizzato un solo Salva di recupero sulla bozza ${reclassifiablePersistedFieldsProbe.draftId}.`, nextAction: "APR ricompila la stessa pagina e tenta un solo recupero; nessuna nuova bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: probe.evidenceId });
          }
        }
        if (driverBeforeTick.pendingCreate && (driverBeforeTick.creationSurface?.customerKey !== driverBeforeTick.pendingCreate.customerKey || (driverBeforeTick.creationSurface.forms.length + driverBeforeTick.creationSurface.controls.length + driverBeforeTick.creationSurface.actions.length === 0))) {
          const surface = await driver.inspectPendingCreationSurfaceReadOnly();
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "creation_surface_inspected_readonly", reason: "APR ha inventariato in sola lettura la pagina intermedia di creazione; nessun secondo tentativo o submit.", nextAction: "Validare il contratto della pagina intermedia prima di riprendere i casi isolati.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: surface?.evidenceId ?? null });
        }
        let driverSnapshotForRecovery = driver.snapshot();
        const pendingPortalCustomerKey = driverSnapshotForRecovery.pendingCreate?.customerKey ?? null;
        const activeUnmaterialized = executionBeforeTick.currentCustomerKey
          ? executionBeforeTick.items.find((item) => item.customerKey === executionBeforeTick.currentCustomerKey
            && item.state === "create_intent_recorded"
            && !item.draftId
            && item.createAttemptCount === 1
            && item.saveAttemptCount === 0)
          : null;
        if (pendingPortalCustomerKey && activeUnmaterialized && activeUnmaterialized.customerKey !== pendingPortalCustomerKey) {
          const evidenceId = driverSnapshotForRecovery.creationSurface?.evidenceId
            ?? driverSnapshotForRecovery.events.at(-1)?.evidenceId
            ?? `local-pending-create-${pendingPortalCustomerKey}`;
          execution.deferActiveCreateIntentBehindPendingPortalIntent(activeUnmaterialized.customerKey, pendingPortalCustomerKey, evidenceId, `service:auto-defer-create-behind-pending:${activeUnmaterialized.customerKey}:${pendingPortalCustomerKey}:v1`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "create_intent_deferred_behind_pending_portal_intent", reason: `${activeUnmaterialized.displayName} rimessa in coda senza mutazione: APR deve prima risolvere il wizard persistente di ${pendingPortalCustomerKey}.`, nextAction: `Riprendere ${pendingPortalCustomerKey} dal sotto-checkpoint, poi continuare la coda in ordine.`, chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        driverSnapshotForRecovery = driver.snapshot();
        const creationSurface = driverSnapshotForRecovery.creationSurface;
        const wizardContractReady = Boolean(creationSurface
          && creationSurface.controls.some((control) => control.id === "id-role-intermediario" && control.type === "button" && control.label === "Intermediario")
          && creationSurface.controls.some((control) => control.id === "id-tipo-pf" && control.type === "button")
          && creationSurface.actions.some((action) => action.type === "submit" && action.label === "Crea scheda descrittiva"));
        const recoverableCases = executionBeforeTick.items.filter((item) => item.state === "operator_intervention" && !item.draftId && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && /apr_cdp_enea_(create_result_not_identifiable|creation_wizard_contract_invalid|other_create_intent_pending)/.test(item.reason));
        // A pending creation wizard is a global serialization barrier. Resume
        // its owning case before diagnosing unrelated terminal cases: those
        // diagnostics may navigate away from /nuova and require mappings whose
        // payload generation has since changed. The wizard recovery is fully
        // idempotent and still performs at most the one submit recorded in the
        // driver's durable sub-checkpoint.
        if (!executionBeforeTick.currentCustomerKey && ["completed", "ready"].includes(executionBeforeTick.status) && pendingPortalCustomerKey && wizardContractReady && recoverableCases.length > 0 && creationSurface) {
          const recoverable = recoverableCases.find((item) => item.customerKey === pendingPortalCustomerKey);
          if (!recoverable) throw new Error(`apr_pending_create_owner_not_recoverable:${pendingPortalCustomerKey}`);
          const materializedGeneration = driverSnapshotForRecovery.mappings.at(-1)?.draftId ?? "none";
          const commandId = `service:auto-recover-unmaterialized:${recoverable.customerKey}:${creationSurface.evidenceId}:after-${materializedGeneration}:wizard-render-contract-v6`;
          const revisionBeforeRecovery = executionBeforeTick.revision;
          execution.requeueUnmaterializedCreateIntents([recoverable.customerKey], creationSurface.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          if (executionBeforeTick.revision !== revisionBeforeRecovery) service.record({ instanceId, processPid: process.pid, status: "running", type: "unmaterialized_create_auto_requeued", reason: `${recoverable.displayName} riaccodata con priorita sul wizard persistente verificato.`, nextAction: "APR riprende dal wizard; nessun secondo submit e consentito.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: creationSurface.evidenceId });
        }
        const resolvedPendingCheckpoint = execution.snapshot();
        const resolvedPendingDeferrals = resolvedPendingCheckpoint.items.filter((item) => item.state === "operator_intervention"
          && !item.draftId
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && /apr_cdp_enea_other_create_intent_pending/.test(item.reason));
        if (!resolvedPendingCheckpoint.currentCustomerKey && resolvedPendingCheckpoint.status === "completed" && !driver.snapshot().pendingCreate && resolvedPendingDeferrals.length > 0) {
          const materialized = driver.snapshot().mappings.at(-1);
          const evidenceId = driver.snapshot().events.filter((event) => event.action === "create_draft_once").at(-1)?.evidenceId
            ?? `local-resolved-pending-create-${materialized?.customerKey ?? "unknown"}`;
          execution.requeueUnmaterializedCreateIntents(resolvedPendingDeferrals.map((item) => item.customerKey), evidenceId, `service:auto-repair-resolved-pending-deferrals:${resolvedPendingDeferrals.map((item) => item.customerKey).join(":")}:${materialized?.draftId ?? "none"}:v1`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "resolved_pending_create_deferrals_requeued", reason: `${resolvedPendingDeferrals.length} pratiche falsamente isolate dalla precedente barriera portale sono state riaccodate senza nuova mutazione e senza azzerare il contatore.`, nextAction: "APR riprende le pratiche in ordine dopo la materializzazione verificata della bozza precedente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        const finalDraftEvidenceRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 1 && item.pageCheckpoints.length > 0 && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "saved" && checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.savedEvidenceId)) && item.completedPageIds.length === item.expectedPageIds.length && /Bozza completa e salvata non dimostrabile lato server/.test(item.reason));
        const infissiMissingFinalCalculationRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.expectedPageIds.some((pageId) => pageId.startsWith("screening:"))
          && item.expectedPageIds.includes("page:Serramenti e infissi")
          && !item.expectedPageIds.includes("page:Calcolo costi e detrazioni")
          && item.pageCheckpoints.length > 0
          && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "saved" && checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.savedEvidenceId))
          && item.completedPageIds.length === item.expectedPageIds.length
          && /enea_draft_final_calculation_page_missing/.test(item.reason));
        const infissiMissingFinalCalculationEvidence = infissiMissingFinalCalculationRecovery?.draftId
          ? [...driverBeforeTick.events].reverse().find((event) => event.customerKey === infissiMissingFinalCalculationRecovery.customerKey
            && event.draftId === infissiMissingFinalCalculationRecovery.draftId
            && event.url.includes(`/calcolo/${infissiMissingFinalCalculationRecovery.draftId}`))
          : null;
        const duplicateDiscoveryRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && !item.draftId && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.length === 0 && /enea_draft_id_duplicate/.test(item.reason));
        const packageValidationRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && !item.draftId && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.length === 0 && /crm_enea_draft_package_(?:fingerprint_mismatch|rebuild_blocked)/.test(item.reason));
        const pageOrderRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.length === 0 && /apr_cdp_enea_page_navigation_not_found:page:(?:Generatore|Anagrafica Beneficiario)/.test(item.reason));
        const fieldVerificationRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" || checkpoint.state === "saved")
          && /^(?:Errore circoscritto alla pratica: )?apr_cdp_enea_(?:field_verification_failed:(?:id-impianto_centralizzato|id-costo|(?:id-comune(?:_nascita|_residenza)?|id-civico_residenza)(?:,(?:id-comune(?:_nascita|_residenza)?|id-civico_residenza))*)|co_beneficiary_trusted_input_not_verified)$/.test(item.reason)
          && !executionBeforeTick.processedCommandIds.includes(`service:auto-resume-created-field-verification:${item.customerKey}:${item.draftId}:${fieldVerificationRecoveryRevision(item.reason)}`));
        const preSaveMappingRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.completedPageIds.length === 0
          && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
          && /apr_cdp_enea_mapping_missing/.test(item.reason));
        const packageMappingRebindRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.pageCheckpoints.some((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
          && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" || checkpoint.state === "saved")
          && /apr_cdp_enea_mapping_missing/.test(item.reason));
        const authorizedRecoveryMappingRepair = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.uncertainPageSave?.status === "recovery_authorized"
          && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId && checkpoint.state === "pending" && checkpoint.recoverySaveAttemptCount === 0 && Boolean(checkpoint.recoveryAuthorizedEvidenceId))
          && /apr_cdp_enea_mapping_missing/.test(item.reason));
        const authorizedRecoveryPackageRepair = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.uncertainPageSave?.status === "recovery_authorized"
          && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId
            && checkpoint.state === "pending"
            && checkpoint.saveAttemptCount === 1
            && checkpoint.recoverySaveAttemptCount === 0
            && Boolean(checkpoint.recoveryAuthorizedEvidenceId))
          && item.reason === "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready");
        const authorizedRecoveryTransientTimeout = executionBeforeTick.items.find((item) => {
          const resolution = item.uncertainPageSave;
          const checkpoint = resolution ? item.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
          const commandId = item.draftId && checkpoint?.recoveryAuthorizedEvidenceId
            ? `service:auto-resume-authorized-recovery-timeout:${item.customerKey}:${item.draftId}:${resolution!.pageId}:${checkpoint.recoveryAuthorizedEvidenceId}:v1`
            : null;
          return item.state === "operator_intervention"
            && Boolean(item.draftId)
            && resolution?.status === "recovery_authorized"
            && checkpoint?.state === "pending"
            && checkpoint.saveAttemptCount === 1
            && checkpoint.recoverySaveAttemptCount === 0
            && Boolean(checkpoint.recoveryAuthorizedEvidenceId)
            && isTransientCdpReadOnlyFailure(item.reason)
            && Boolean(commandId)
            && !executionBeforeTick.processedCommandIds.includes(commandId!);
        });
        const directRouteRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" || checkpoint.state === "saved") && /apr_cdp_enea_page_navigation_not_found:page:(?:Anagrafica Beneficiario|Immobile|Intervento|Impianto termico esistente|Schermature solari|Calcolo costi e detrazioni)/.test(item.reason));
        const transientReadOnlyTimeoutRecovery = executionBeforeTick.items.find((item) => {
          const pendingPage = item.pageCheckpoints.find((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0);
          const commandId = pendingPage && item.draftId
            ? `service:auto-resume-created-transient-readonly-timeout:${item.customerKey}:${item.draftId}:${pendingPage.pageId}:runtime-evaluate-60s-v2`
            : null;
          return item.state === "operator_intervention"
            && Boolean(item.draftId)
            && item.createAttemptCount === 1
            && item.saveAttemptCount === 0
            && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "saved" || (checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0))
            && item.completedPageIds.every((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state === "saved")
            && isTransientCdpReadOnlyFailure(item.reason)
            && Boolean(commandId)
            && !executionBeforeTick.processedCommandIds.includes(commandId!);
        });
        const screeningRestageTransientTimeoutRecovery = executionBeforeTick.items.find((item) => {
          const pendingPage = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:")
            && checkpoint.state === "pending"
            && checkpoint.saveAttemptCount === 1
            && checkpoint.recoverySaveAttemptCount === 0
            && Boolean(checkpoint.recoveryAuthorizedEvidenceId));
          const commandId = pendingPage && item.draftId
            ? `service:auto-resume-screening-restage-timeout:${item.customerKey}:${item.draftId}:${pendingPage.pageId}:${pendingPage.recoveryAuthorizedEvidenceId}:v1`
            : null;
          return item.state === "operator_intervention"
            && Boolean(item.draftId)
            && ["recovery_authorized", "resolved_staged", "resolved_saved"].includes(item.uncertainPageSave?.status ?? "")
            && Boolean(pendingPage)
            && item.serverEvidenceIds.includes(pendingPage!.recoveryAuthorizedEvidenceId!)
            && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" || checkpoint.state === "staged" || checkpoint.state === "saved")
            && isTransientCdpReadOnlyFailure(item.reason)
            && Boolean(commandId)
            && !executionBeforeTick.processedCommandIds.includes(commandId!);
        });
        const preSaveRemountRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.pageCheckpoints.filter((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.savedEvidenceId).length === 1
          && item.completedPageIds.every((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state === "saved")
          && /apr_cdp_enea_pre_save_field_contract_not_ready:/.test(item.reason));
        const checkpointCollisionRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" && !checkpoint.savedEvidenceId)
          && /enea_draft_page_save_intent_missing/.test(item.reason));
        const unclickedSaveControlRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.pageCheckpoints.some((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.savedEvidenceId)
          && /apr_cdp_enea_unique_enabled_save_button_not_found:/.test(item.reason));
        const screeningOrderRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.length > 0 && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0) && /apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason));
        const screeningSummaryPersistenceDiagnostic = executionBeforeTick.items.find(nestedPageAbsenceRecoveryCandidate);
        const screeningNavigationRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.length > 0 && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0) && /apr_cdp_enea_(?:page_navigation_not_found|screening_activation_failed|screening_add_not_unique|screening_markers_missing):screening:1/.test(item.reason));
        const screeningSaveTimeoutDiagnostic = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1) && /apr_cdp_command_timeout:Runtime\.evaluate/.test(item.reason));
        const screeningPostSaveVerification = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1) && /(?:Esito salvataggio pagina screening:|Esito tecnico incerto dopo il Salva di screening:)/.test(item.reason));
        const screeningRecoveryPostSaveVerification = executionBeforeTick.items.find((item) => item.state === "save_intent_recorded" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 1 && Boolean(checkpoint.recoveryAuthorizedEvidenceId)));
        const infissiExhaustedRowCase = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "operator_required" || !item.uncertainPageSave.pageId.startsWith("screening:")) return false;
          const page = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId);
          const infissiSummary = item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").includes("infiss"));
          return Boolean(infissiSummary && page?.state === "save_intent_recorded" && page.saveAttemptCount === 1 && page.recoverySaveAttemptCount === 1);
        });
        const exhaustedRowDiagnosticRecorded = (action: string, candidate: typeof infissiExhaustedRowCase) => Boolean(candidate && driverBeforeTick.events.some((event) => event.action === action
          && event.customerKey === candidate.customerKey
          && event.draftId === candidate.draftId
          && event.pageId === candidate.uncertainPageSave!.pageId));
        const exhaustedRowDiagnosticCount = (action: string, candidate: typeof infissiExhaustedRowCase) => candidate ? driverBeforeTick.events.filter((event) => event.action === action
          && event.customerKey === candidate.customerKey
          && event.draftId === candidate.draftId
          && event.pageId === candidate.uncertainPageSave!.pageId).length : 0;
        const infissiExhaustedRowDiagnostic = infissiExhaustedRowCase && !exhaustedRowDiagnosticRecorded("inspect_infissi_row_failure_surface_readonly_v3", infissiExhaustedRowCase)
          ? infissiExhaustedRowCase
          : null;
        const infissiExhaustedRowModalDiagnostic = infissiExhaustedRowCase
          && (exhaustedRowDiagnosticRecorded("inspect_infissi_row_failure_surface_readonly", infissiExhaustedRowCase) || exhaustedRowDiagnosticRecorded("inspect_infissi_row_failure_surface_readonly_v3", infissiExhaustedRowCase))
          && !exhaustedRowDiagnosticRecorded("inspect_infissi_add_modal_contract_readonly", infissiExhaustedRowCase)
          ? infissiExhaustedRowCase
          : null;
        const infissiExhaustedRowFilledDiagnostic = infissiExhaustedRowCase
          && exhaustedRowDiagnosticRecorded("inspect_infissi_add_modal_contract_readonly", infissiExhaustedRowCase)
          // Una seconda acquisizione e' ammessa dopo la correzione v3: la
          // diagnostica precedente e' volatile ed e' stata sostituita dalle
          // successive prove GET. Entrambe restano senza click Salva.
          && exhaustedRowDiagnosticCount("inspect_infissi_filled_modal_without_save", infissiExhaustedRowCase) < 3
          ? infissiExhaustedRowCase
          : null;
        const filledInfissiDiagnostic = driverBeforeTick.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string; filled?: { compiled?: string[]; missing?: string[]; mismatched?: string[] }; fields?: Array<{ valid?: boolean; ariaInvalid?: string | null }> } | null;
        const emptyInfissiRowProof = infissiExhaustedRowCase ? driverBeforeTick.pageDiagnostics?.find((diagnostic) => diagnostic.customerKey === infissiExhaustedRowCase.customerKey
          && diagnostic.draftId === infissiExhaustedRowCase.draftId
          && diagnostic.pageId === infissiExhaustedRowCase.uncertainPageSave!.pageId
          && diagnostic.contractRevision === "infissi-row-table-v1"
          && /righe server=0\b/.test(diagnostic.surface?.text ?? "")) : null;
        const infissiStagingClassifierRecovery = infissiExhaustedRowCase
          && filledInfissiDiagnostic?.kind === "infissi-filled-modal-without-save-v1"
          && filledInfissiDiagnostic.customerKey === infissiExhaustedRowCase.customerKey
          && filledInfissiDiagnostic.draftId === infissiExhaustedRowCase.draftId
          && filledInfissiDiagnostic.pageId === infissiExhaustedRowCase.uncertainPageSave!.pageId
          && Boolean(filledInfissiDiagnostic.evidenceId)
          && filledInfissiDiagnostic.filled?.missing?.length === 0
          && filledInfissiDiagnostic.filled?.mismatched?.length === 0
          && filledInfissiDiagnostic.fields?.every((field) => field.valid !== false && field.ariaInvalid !== "true")
          && emptyInfissiRowProof?.evidenceId
          ? { item: infissiExhaustedRowCase, emptyEvidenceId: emptyInfissiRowProof.evidenceId, classifierEvidenceId: filledInfissiDiagnostic.evidenceId! }
          : null;
        const transmittanceDiagnostics = (driverBeforeTick.pageSaveDiagnostics as Array<{
          customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string;
          postClick?: { urlPath?: string; modalOpen?: boolean; invalidControlIds?: string[]; alerts?: string[]; markerFields?: Array<{ id?: string; value?: string; reactValue?: string }>; tables?: Array<{ headers?: string[]; rows?: string[][] }> };
        }> | undefined) ?? [];
        const partialInfissiEmptyCanonicalRecovery = executionBeforeTick.items.map((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "operator_required" || !item.uncertainPageSave.pageId.startsWith("screening:") || !item.pageCheckpoints.some((checkpoint) => /infiss/i.test(checkpoint.pageId))) return null;
          const pageId = item.uncertainPageSave.pageId;
          // Il recupero generico di una riga non persistita non deve precedere
          // una correzione business già provata dal portale. In quel caso il
          // payload va prima rigenerato col valore autorizzato, conservando
          // l'originale in audit, e solo il recupero specifico può riaccodare.
          const rejectedOverMax = [...transmittanceDiagnostics].reverse().some((diagnostic) => diagnostic.customerKey === item.customerKey
            && diagnostic.draftId === item.draftId
            && diagnostic.pageId === pageId
            && diagnostic.postClick?.invalidControlIds?.includes("id-u_post")
            && diagnostic.postClick.alerts?.some((alert) => /numero minore o uguale a 1\.3/i.test(alert))
            && diagnostic.postClick.markerFields?.some((field) => field.id === "id-u_post" && (portalNumberValue(field.reactValue) ?? portalNumberValue(field.value) ?? 0) > 1.3));
          if (rejectedOverMax) return null;
          const evidence = driverBeforeTick.pageDiagnostics?.find((diagnostic) => diagnostic.customerKey === item.customerKey
            && diagnostic.draftId === item.draftId
            && diagnostic.pageId === pageId
            && diagnostic.contractRevision === "infissi-row-table-v1"
            && /righe server=0\b/.test(diagnostic.surface?.text ?? ""));
          const commandId = evidence?.evidenceId ? `service:resume-partial-infissi-empty-canonical:${item.customerKey}:${item.draftId}:${pageId}:${evidence.evidenceId}:v1` : null;
          return evidence?.evidenceId && commandId && !executionBeforeTick.processedCommandIds.includes(commandId) ? { item, evidence, commandId } : null;
        }).find((candidate) => candidate !== null) ?? null;
        const emptyGeneratorSummaryRecovery = executionBeforeTick.items.map((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito."
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Impianto termico esistente") return null;
          const generator = item.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId));
          const plant = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Impianto termico esistente");
          if (!generator || generator.state !== "saved" || generator.saveAttemptCount !== 1 || !generator.savedEvidenceId
            || !plant || plant.state !== "save_intent_recorded" || plant.saveAttemptCount !== 1 || plant.recoverySaveAttemptCount !== 1 || plant.savedEvidenceId) return null;
          const diagnostic = [...((driverBeforeTick.pageSaveDiagnostics ?? []) as Array<{
            customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string; traces?: unknown[];
            postClick?: { invalidControlIds?: string[]; markerFields?: Array<{ valid?: boolean; ariaInvalid?: string | null }>; tables?: Array<{ headers?: string[]; rows?: string[][] }> };
          }>)]
            .reverse().find((candidate) => candidate.customerKey === item.customerKey
              && candidate.draftId === item.draftId
              && candidate.pageId === plant.pageId
              && candidate.evidenceId
              && candidate.traces?.length === 0
              && candidate.postClick?.invalidControlIds?.length === 0
              && candidate.postClick.markerFields?.length === 3
              && candidate.postClick.markerFields.every((field) => field.valid !== false && field.ariaInvalid !== "true")
              && candidate.postClick.tables?.some((table) => table.headers?.some((header) => /Tipo di generatore/i.test(header))
                && (table.rows ?? []).every((row) => row.slice(1, 4).every((cell) => !String(cell ?? "").trim()))));
          const commandId = diagnostic?.evidenceId
            ? `service:resume-generator-empty-summary:${item.customerKey}:${item.draftId}:${diagnostic.evidenceId}:v1`
            : null;
          return diagnostic?.evidenceId && commandId && !executionBeforeTick.processedCommandIds.includes(commandId)
            ? { item, diagnostic, commandId }
            : null;
        }).find((candidate) => candidate !== null) ?? null;
        const infissiPostClickRowPersistenceRecovery = executionBeforeTick.items.map((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "operator_required" || !item.uncertainPageSave.pageId.startsWith("screening:") || !item.pageCheckpoints.some((checkpoint) => /infiss/i.test(checkpoint.pageId))) return null;
          const page = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId);
          if (!page || page.state !== "save_intent_recorded" || page.saveAttemptCount !== 1 || page.recoverySaveAttemptCount !== 0 || page.savedEvidenceId) return null;
          const expectedRows = Number(page.pageId.slice("screening:".length));
          const diagnostic = [...transmittanceDiagnostics].reverse().find((candidate) => candidate.customerKey === item.customerKey
            && candidate.draftId === item.draftId
            && candidate.pageId === page.pageId
            && candidate.evidenceId
            && candidate.postClick?.urlPath === `/pratica/ecobonus/2026/serramenti/${item.draftId}`
            && candidate.postClick.modalOpen === false
            && candidate.postClick.invalidControlIds?.length === 0
            && candidate.postClick.tables?.some((table) => table.headers?.some((header) => /Trasmittanza del vecchio infisso/i.test(header))
              && table.rows?.filter((row) => row.length >= 9).length === expectedRows));
          const commandId = diagnostic?.evidenceId ? `service:accept-infissi-post-click-row-table:${item.customerKey}:${item.draftId}:${page.pageId}:${diagnostic.evidenceId}:v1` : null;
          return diagnostic?.evidenceId && commandId && !executionBeforeTick.processedCommandIds.includes(commandId)
            ? { item, page, diagnostic, expectedRows, commandId }
            : null;
        }).find((candidate) => candidate !== null) ?? null;
        const rejectedTransmittanceDiagnostic = [...transmittanceDiagnostics].reverse().find((diagnostic) => diagnostic.customerKey === infissiExhaustedRowCase?.customerKey
          && diagnostic.draftId === infissiExhaustedRowCase?.draftId
          && diagnostic.pageId === infissiExhaustedRowCase?.uncertainPageSave?.pageId
          && diagnostic.postClick?.invalidControlIds?.includes("id-u_post")
          && diagnostic.postClick.alerts?.some((alert) => /numero minore o uguale a 1\.3/i.test(alert))
          && diagnostic.postClick.markerFields?.some((field) => field.id === "id-u_post" && (portalNumberValue(field.reactValue) ?? portalNumberValue(field.value) ?? 0) > 1.3));
        const updatedInfissiItem = infissiExhaustedRowCase
          ? infissiSnapshot.items.find((item) => item.customerKey === infissiExhaustedRowCase.customerKey)
          : null;
        const authorizedTransmittanceCorrectionRecovery = infissiExhaustedRowCase
          && infissiSnapshot.status === "completed"
          && updatedInfissiItem?.state === "ready_local_plan"
          && updatedInfissiItem.report?.eneaDraftPayload?.windows.some((window) => window.sourceNewWindowThermalTransmittanceWm2K > 1.3 && window.newWindowThermalTransmittanceWm2K === 1.3)
          && updatedInfissiItem.report.eneaDraftPayload.audit.appliedRuleIds.includes("user-2026-08-23-infissi-portal-transmittance-over-max-to-1-3-v1")
          && emptyInfissiRowProof?.evidenceId
          && rejectedTransmittanceDiagnostic?.evidenceId
          ? { item: infissiExhaustedRowCase, emptyEvidenceId: emptyInfissiRowProof.evidenceId, rejectedEvidenceId: rejectedTransmittanceDiagnostic.evidenceId }
          : null;

        if (!executionBeforeTick.currentCustomerKey && finalDraftEvidenceRecovery?.draftId) {
          const finalCheckpoint = finalDraftEvidenceRecovery.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Calcolo costi e detrazioni");
          const finalEvent = finalCheckpoint?.savedEvidenceId
            ? driverBeforeTick.events.find((event) => event.evidenceId === finalCheckpoint.savedEvidenceId
              && event.customerKey === finalDraftEvidenceRecovery.customerKey
              && event.draftId === finalDraftEvidenceRecovery.draftId
              && event.pageId === "page:Calcolo costi e detrazioni"
              && event.action === "verify_page_saved_server_redirect"
              && new URL(event.url).pathname === `/pratica/ecobonus/2026/riepilogo/${finalDraftEvidenceRecovery.draftId}`)
            : null;
          // Il journal CDP viene compattato, mentre il checkpoint esecutivo
          // conserva intenzionalmente la prova server di ogni pagina. Se il
          // vecchio evento di redirect non e' piu' nel journal, la catena N/N
          // tutta `saved` e l'evidence id del Calcolo presente anche nel ledger
          // server sono la prova durevole sufficiente per il solo gate bozza.
          const durableFinalEvidence = finalEvent ?? (finalCheckpoint?.savedEvidenceId
            && finalDraftEvidenceRecovery.serverEvidenceIds.includes(finalCheckpoint.savedEvidenceId)
            ? { evidenceId: finalCheckpoint.savedEvidenceId, url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/riepilogo/${finalDraftEvidenceRecovery.draftId}` }
            : null);
          if (durableFinalEvidence) {
            const commandId = `service:auto-record-final-draft-from-checkpoint:${finalDraftEvidenceRecovery.customerKey}:${finalDraftEvidenceRecovery.draftId}:${durableFinalEvidence.evidenceId}:v2`;
            execution.recordDraftSavedFromDurableCheckpoint(finalDraftEvidenceRecovery.customerKey, durableFinalEvidence.url, durableFinalEvidence.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "final_draft_checkpoint_evidence_recovered", reason: `${finalDraftEvidenceRecovery.displayName}: bozza completa confermata dal checkpoint N/N e dalla prova server durevole del Calcolo; nessun Salva ripetuto.`, nextAction: "Proseguire con la coda dalla pratica successiva.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: durableFinalEvidence.evidenceId });
          }
        }
        const screeningReactPreclickRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && Boolean(checkpoint.preparedEvidenceId) && !checkpoint.savedEvidenceId)
          && /apr_cdp_enea_screening_react_contract_not_ready:screening:\d+$/.test(item.reason));
        const screeningReactGenerationRepair = executionBeforeTick.items.find((item) => executionBeforeTick.currentCustomerKey === item.customerKey
          && item.state === "filling"
          && Boolean(item.draftId)
          && item.pageCheckpoints.some((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.recoveryAuthorizedEvidenceId && !checkpoint.preparedEvidenceId && !checkpoint.savedEvidenceId)
          && /Stessa bozza riattivata: il journal prova che screening:\d+ non ha emesso alcun click Salva/.test(item.reason));
        const generatorActivationDiagnostic = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.createAttemptCount === 1
          && item.saveAttemptCount === 0
          && /Generatore/.test(item.pageCheckpoints.find((checkpoint) => checkpoint.state === "pending")?.pageId ?? "")
          && /apr_cdp_enea_(?:generator_activation_failed:|mapping_missing)/.test(item.reason));
        const generatorUncertainReadOnlyRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "probing" || !/Generatore/.test(item.uncertainPageSave.pageId)) return false;
          const page = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId);
          const commandId = `service:auto-verify-uncertain-generator-summary:${item.customerKey}:${item.draftId}:${item.uncertainPageSave.pageId}:v1`;
          return Boolean(page && page.state === "save_intent_recorded" && page.saveAttemptCount === 1 && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const generatorUncertainActivationDiagnostic = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "probing" || !/Generatore/.test(item.uncertainPageSave.pageId)) return false;
          const summaryCommandId = `service:auto-verify-uncertain-generator-summary:${item.customerKey}:${item.draftId}:${item.uncertainPageSave.pageId}:v1`;
          const diagnosticCommandId = `service:inspect-uncertain-generator-react-contract:${item.customerKey}:${item.draftId}:${item.uncertainPageSave.pageId}:v2`;
          return executionBeforeTick.processedCommandIds.includes(summaryCommandId) && !executionBeforeTick.processedCommandIds.includes(diagnosticCommandId);
        });
        const pageFieldContractDiagnostic = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && /apr_cdp_enea_field_verification_failed:/.test(item.reason));
        const exhaustedStandardPageDiagnostic = executionBeforeTick.items.find((item) => {
          const pageId = item.uncertainPageSave?.pageId ?? "";
          return item.state === "operator_intervention"
            && Boolean(item.draftId)
            && item.uncertainPageSave?.status === "operator_required"
            && !pageId.startsWith("screening:")
            && pageId !== "page:Allocazione costi e detrazioni"
            && !/Generatore/.test(pageId)
            && item.reason === "La GET canonica dimostra che anche l'unico recupero non è persistito."
            && !driverBeforeTick.events.some((event) => event.action === "inspect_prepared_standard_page_without_save_v3"
              && event.customerKey === item.customerKey
              && event.draftId === item.draftId
              && event.pageId === pageId);
        });
        const priorPageSaveVerification = executionBeforeTick.items.find((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.completedPageIds.includes("page:Anagrafica Beneficiario") && /apr_cdp_enea_page_navigation_not_found:page:Immobile/.test(item.reason));
        const preClickRecoveryRequeue = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && item.uncertainPageSave?.status === "recovery_authorized"
          && item.pageCheckpoints.some((page) => page.pageId === item.uncertainPageSave!.pageId && page.state === "save_intent_recorded" && page.saveAttemptCount === 1 && page.recoverySaveAttemptCount === 1)
          && /apr_cdp_enea_unique_enabled_save_button_not_found:/.test(item.reason));
        const recoveryTimeoutVerification = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "operator_required" || !/unico recupero autorizzato ha esito incerto/.test(item.reason)) return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const evidenceId = item.serverEvidenceIds.at(-1) ?? `recovery-timeout-${item.draftId}`;
          const commandId = `service:verify-recovery-timeout-readonly:${item.customerKey}:${item.draftId}:${item.uncertainPageSave.pageId}:${evidenceId}:v1`;
          return Boolean(page && page.state === "save_intent_recorded" && page.saveAttemptCount === 1 && page.recoverySaveAttemptCount === 1 && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const calculation36InputContractRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Allocazione costi e detrazioni"
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const proof = item.uncertainPageSave.probes.find((probe) => probe.method === "persisted_fields_get"
            && probe.outcome === "not_saved"
            && typeof probe.url === "string"
            && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
            && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item.draftId}`));
          const commandId = `service:auto-requeue-calculation-36-input-contract:${item.customerKey}:${item.draftId}:react-controlled-input-v5`;
          return Boolean(page
            && page.state === "save_intent_recorded"
            && page.saveAttemptCount === 1
            && page.recoverySaveAttemptCount === 1
            && !page.savedEvidenceId
            && proof
            && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const standardSaveDeliveryContractRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId.startsWith("screening:")
            || item.uncertainPageSave.pageId === "page:Allocazione costi e detrazioni"
            || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const diagnostics = ((driverBeforeTick.pageSaveDiagnostics ?? []) as Array<{
            customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string;
            traces?: unknown[]; postClick?: { urlPath?: string; invalidControlIds?: string[]; markerFields?: unknown[] };
          }>).filter((diagnostic) => diagnostic.customerKey === item.customerKey
            && diagnostic.draftId === item.draftId
            && diagnostic.pageId === item.uncertainPageSave!.pageId);
          const sourceRoute = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Serramenti e infissi", "serramenti"]]).get(item.uncertainPageSave.pageId);
          const failedDeliveries = diagnostics.filter((diagnostic) => diagnostic.traces?.length === 0
            && diagnostic.postClick?.urlPath === `/pratica/ecobonus/2026/${sourceRoute}/${item.draftId}`
            && diagnostic.postClick.invalidControlIds?.length === 0
            && (diagnostic.postClick.markerFields?.length ?? 0) > 0);
          const commandId = `service:auto-requeue-standard-save-delivery:${item.customerKey}:${item.draftId}:${item.uncertainPageSave.pageId}:trusted-enter-zero-mutation-v1`;
          return Boolean(page
            && page.state === "save_intent_recorded"
            && page.saveAttemptCount === 1
            && page.recoverySaveAttemptCount === 1
            && !page.savedEvidenceId
            && failedDeliveries.length >= 2
            && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const municipalityAutocompleteContractRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave?.status !== "operator_required" || item.uncertainPageSave.pageId !== "page:Anagrafica Beneficiario") return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const diagnostic = [...((driverBeforeTick.pageSaveDiagnostics ?? []) as Array<{
            kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string;
            traces?: unknown[]; postClick?: { invalidControlIds?: string[] };
            invalidControlIds?: string[];
            saveControls?: Array<{ disabled?: boolean; reactOnClick?: boolean }>;
            fields?: Array<{ id?: string; control?: string; value?: string; matches?: boolean; valid?: boolean; ariaInvalid?: string | null; reactValue?: string | null }>;
          }>)]
            .reverse().find((candidate) => candidate.customerKey === item.customerKey && candidate.draftId === item.draftId && candidate.pageId === item.uncertainPageSave!.pageId
              && ((candidate.traces?.length === 0 && candidate.postClick?.invalidControlIds?.some((id) => id === "id-comune_nascita" || id === "id-comune_residenza"))
                || (candidate.kind === "prepared-standard-page-without-save-v3"
                  && candidate.invalidControlIds?.length === 0
                  && candidate.saveControls?.length === 1
                  && candidate.saveControls[0]?.disabled === false
                  && candidate.saveControls[0]?.reactOnClick === true
                  && ["id-comune_nascita", "id-comune_residenza"].every((id) => candidate.fields?.some((field) => field.id === id
                    && field.control === "autocomplete"
                    && field.matches === true
                    && field.valid === true
                    && field.ariaInvalid !== "true"
                    && / \([A-Z]{2}\)$/.test(field.reactValue ?? field.value ?? ""))))));
          const commandId = `service:auto-requeue-municipality-autocomplete:${item.customerKey}:${item.draftId}:authoritative-istat-v68`;
          return Boolean(page && page.state === "save_intent_recorded" && page.saveAttemptCount === 1 && page.recoverySaveAttemptCount === 1 && !page.savedEvidenceId && diagnostic?.evidenceId && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const calculation36TransientSurfaceVerification = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Allocazione costi e detrazioni") return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const diagnostic = driverBeforeTick.pageDiagnostics?.find((candidate) => candidate.customerKey === item.customerKey
            && candidate.draftId === item.draftId
            && candidate.pageId === item.uncertainPageSave!.pageId);
          const falseProof = item.uncertainPageSave.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "not_saved");
          const commandId = `service:resume-calculation-36-readonly-after-transient-surface:${item.customerKey}:${item.draftId}:v6`;
          return Boolean(page
            && page.state === "save_intent_recorded"
            && page.saveAttemptCount === 1
            && page.recoverySaveAttemptCount === 1
            && !page.savedEvidenceId
            && falseProof
            && diagnostic
            && diagnostic.fields.length > 0
            && diagnostic.fields.every((field) => field.actual === "<missing>")
            && item.serverEvidenceIds.includes(diagnostic.evidenceId)
            && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const calculation36ModalContractDiagnostic = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Allocazione costi e detrazioni") return false;
          const diagnostic = driverBeforeTick.pageDiagnostics?.find((candidate) => candidate.customerKey === item.customerKey
            && candidate.draftId === item.draftId
            && candidate.pageId === item.uncertainPageSave!.pageId);
          const durableModalDiagnostic = driverBeforeTick.calculationModalContractDiagnostic as { kind?: string; customerKey?: string; draftId?: string } | null;
          const alreadyPersisted = durableModalDiagnostic?.kind === "calculation-allocation-modal-contract-v9"
            && durableModalDiagnostic.customerKey === item.customerKey
            && durableModalDiagnostic.draftId === item.draftId;
          return Boolean(diagnostic
            && diagnostic.fields.some((field) => field.portalId.endsWith(":50") && field.actual !== "0" && field.actual !== "<missing>")
            && diagnostic.fields.some((field) => field.portalId.endsWith(":36") && field.actual === "0")
            && !alreadyPersisted);
        });
        const calculation36TrustedInputRecovery = executionBeforeTick.items.find((item) => {
          if (item.state !== "operator_intervention"
            || !item.draftId
            || item.uncertainPageSave?.status !== "operator_required"
            || item.uncertainPageSave.pageId !== "page:Allocazione costi e detrazioni") return false;
          const page = item.pageCheckpoints.find((candidate) => candidate.pageId === item.uncertainPageSave!.pageId);
          const persistedDiagnostic = driverBeforeTick.pageDiagnostics?.find((candidate) => candidate.customerKey === item.customerKey
            && candidate.draftId === item.draftId
            && candidate.pageId === item.uncertainPageSave!.pageId);
          const modalDiagnostic = driverBeforeTick.calculationModalContractDiagnostic as { kind?: string; customerKey?: string; draftId?: string; evidenceId?: string; inputs?: Array<{ id?: string; reactProps?: { value?: string; onChange?: string } }> } | null;
          const persistedProbe = item.uncertainPageSave.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "inconclusive");
          const commandId = `service:auto-requeue-calculation-36-trusted-input:${item.customerKey}:${item.draftId}:staged-until-outer-save-v11`;
          return Boolean(page
            && page.state === "save_intent_recorded"
            && page.saveAttemptCount === 1
            && page.recoverySaveAttemptCount === 1
            && persistedDiagnostic?.fields.some((field) => field.portalId.endsWith(":50") && field.actual !== "0" && field.actual !== "<missing>")
            && persistedDiagnostic.fields.some((field) => field.portalId.endsWith(":36") && field.actual === "0")
            && modalDiagnostic?.kind === "calculation-allocation-modal-contract-v9"
            && modalDiagnostic.customerKey === item.customerKey
            && modalDiagnostic.draftId === item.draftId
            && modalDiagnostic.evidenceId
            && modalDiagnostic.inputs?.some((input) => input.id === "id-costo2025p" && input.reactProps?.value === "0" && Boolean(input.reactProps.onChange))
            && persistedProbe
            && !executionBeforeTick.processedCommandIds.includes(commandId));
        });
        const uncertainPageSaveVerification = executionBeforeTick.items.filter((item) => item.state === "operator_intervention" && Boolean(item.draftId) && item.createAttemptCount === 1 && item.saveAttemptCount === 0 && item.pageCheckpoints.some((page) => page.state === "save_intent_recorded" && page.saveAttemptCount === 1) && (Boolean(item.uncertainPageSave) || /(?:Esito salvataggio pagina|apr_cdp_command_timeout:Runtime\.evaluate)/.test(item.reason))).find((item) => {
          const page = item.uncertainPageSave
            ? item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === item.uncertainPageSave!.pageId)
            : item.pageCheckpoints.find((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1);
          // The generator modal only stages values in the outer plant page.  A
          // failed/legacy modal save cannot be diagnosed by reopening the modal:
          // doing so would destroy the staged DOM state and create a noisy retry
          // loop.  Keep these cases terminal and let only a fresh case exercise
          // the corrected generator -> plant transaction.
          // A page that has already consumed its single recovery belongs only to
          // recoveryTimeoutVerification above.  Never feed it back into the
          // first-save auto-authorization path: that would request a forbidden
          // second recovery and turn a terminal per-case result into a global
          // technical block.
          const transientCalculationReadOnlyAuthorized = Boolean(page
            && page.recoverySaveAttemptCount === 1
            && page.pageId === "page:Allocazione costi e detrazioni"
            && item.uncertainPageSave?.status === "probing"
            && executionBeforeTick.processedCommandIds.includes(`service:resume-calculation-36-readonly-after-transient-surface:${item.customerKey}:${item.draftId}:v6`));
          const module = page ? (draftPackageFor(item.customerKey) as unknown as AprEneaDraftPackage).module : undefined;
          if (!page || (page.recoverySaveAttemptCount === 1 && !transientCalculationReadOnlyAuthorized) || /Generatore/.test(page.pageId) || !nestedUncertainPageSaveProbeAllowed(module, page.pageId)) return false;
          if (item.uncertainPageSave) {
            const repairableMappingFailure = item.uncertainPageSave.status === "operator_required"
              && item.uncertainPageSave.probes.length === 3
              && item.uncertainPageSave.probes.every((probe) => probe.outcome === "inconclusive" && /apr_cdp_enea_mapping_missing/.test(probe.reason));
            const repairableInfissiClassifierFailure = module === "infissi"
              && page.pageId.startsWith("screening:")
              && item.uncertainPageSave.status === "operator_required"
              && item.uncertainPageSave.probes.length === 3
              && item.uncertainPageSave.probes.every((probe) => probe.outcome === "inconclusive")
              && item.uncertainPageSave.probes.some((probe) => probe.method === "persisted_fields_get" && /^0\/\d+ campi coincidono: prova non conclusiva\.$/.test(probe.reason));
            const serverProvenNotSaved = item.uncertainPageSave.status === "operator_required"
              && item.uncertainPageSave.probes.some((probe) => probe.method === "persisted_fields_get"
                && probe.outcome === "not_saved"
                && typeof probe.url === "string"
                && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
                && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item.draftId}`));
            return (item.uncertainPageSave.status === "probing" && item.uncertainPageSave.probes.length < 3) || repairableMappingFailure || repairableInfissiClassifierFailure || serverProvenNotSaved;
          }
          const migrationCommandId = `service:migrate-legacy-uncertain-page-save:${item.customerKey}:${item.draftId}:${page.pageId}:v1`;
          return !executionBeforeTick.processedCommandIds.includes(migrationCommandId);
        });
        const fieldRecoveryPageId = fieldVerificationRecovery?.pageCheckpoints.find((checkpoint) => checkpoint.state === "pending")?.pageId ?? null;
        const preparationDiagnostic = driverBeforeTick.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string } | null;
        const fieldRecoveryDiagnostic = fieldVerificationRecovery && fieldRecoveryPageId
          ? driverBeforeTick.pageDiagnostics?.find((item) => item.customerKey === fieldVerificationRecovery.customerKey && item.draftId === fieldVerificationRecovery.draftId && item.pageId === fieldRecoveryPageId)
            ?? (preparationDiagnostic?.customerKey === fieldVerificationRecovery.customerKey
              && preparationDiagnostic.draftId === fieldVerificationRecovery.draftId
              && preparationDiagnostic.pageId === fieldRecoveryPageId
              && preparationDiagnostic.evidenceId
              ? preparationDiagnostic
              : null)
          : null;
        const disabledCostContractRecovery = executionBeforeTick.items.find((item) => item.state === "operator_intervention"
          && Boolean(item.draftId)
          && /apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason));
        const disabledCostContractDiagnostic = disabledCostContractRecovery
          && preparationDiagnostic?.customerKey === disabledCostContractRecovery.customerKey
          && preparationDiagnostic.draftId === disabledCostContractRecovery.draftId
          && preparationDiagnostic.pageId === "page:Schermature solari"
          && (preparationDiagnostic as { fieldDiagnostics?: Array<{ portalId?: string; disabled?: boolean }> }).fieldDiagnostics?.some((field) => field.portalId === "id-costo" && field.disabled)
          ? preparationDiagnostic
          : null;
        const screeningOrderDiagnostic = screeningOrderRecovery ? driverBeforeTick.pageDiagnostics?.find((item) => item.customerKey === screeningOrderRecovery.customerKey && item.draftId === screeningOrderRecovery.draftId && item.pageId === "page:Schermature solari" && item.fields.some((field) => field.portalId === "id-costo" && field.disabled && !field.matches)) ?? null : null;
        const screeningSummaryDiagnostic = driverBeforeTick.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string } | null;
        const screeningPostSaveDiagnostic = driverBeforeTick.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string; rowCount?: number; rows?: string[][]; modalOpen?: boolean } | null;
        const screeningSummaryObserved = screeningSaveTimeoutDiagnostic ? driverBeforeTick.events.some((event) => event.action === "inspect_screening_summary_readonly" && event.customerKey === screeningSaveTimeoutDiagnostic.customerKey && event.draftId === screeningSaveTimeoutDiagnostic.draftId) : false;
        type PersistedScreeningAbsenceDiagnostic = AprNestedPageAbsenceEvidence & { kind?: string; customerKey?: string; draftId?: string };
        const screeningPersistenceProofs = screeningSummaryPersistenceDiagnostic
          ? ((driverBeforeTick.pageSaveDiagnostics ?? []) as PersistedScreeningAbsenceDiagnostic[])
            .filter((diagnostic) => diagnostic.kind === "screening-summary-readonly-v4"
              && diagnostic.customerKey === screeningSummaryPersistenceDiagnostic.customerKey
              && diagnostic.draftId === screeningSummaryPersistenceDiagnostic.draftId)
            .slice(-2)
          : [];
        const generatorSummaryObserved = generatorActivationDiagnostic ? driverBeforeTick.events.some((event) => event.action === "inspect_generator_summary_readonly" && event.customerKey === generatorActivationDiagnostic.customerKey && event.draftId === generatorActivationDiagnostic.draftId) : false;
        const generatorActivationObserved = generatorActivationDiagnostic ? driverBeforeTick.events.some((event) => event.action === "inspect_generator_activation_surface_readonly_v2" && event.customerKey === generatorActivationDiagnostic.customerKey && event.draftId === generatorActivationDiagnostic.draftId) : false;
        const generatorSummarySurface = driverBeforeTick.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string; expectedActivationLabel?: string; rowDetails?: Array<{ cells: string[]; actions: Array<{ label: string; title: string; disabled: boolean }> }> } | null;
        const generatorSummarySurfaceMatchesCurrent = Boolean(generatorActivationDiagnostic
          && generatorSummarySurface?.kind === "generator-summary-readonly-v2"
          && generatorSummarySurface.customerKey === generatorActivationDiagnostic.customerKey
          && generatorSummarySurface.draftId === generatorActivationDiagnostic.draftId);
        const generatorSummaryRowReady = Boolean(generatorActivationDiagnostic
          && generatorSummarySurface
          && generatorSummarySurfaceMatchesCurrent
          && generatorSummarySurface.expectedActivationLabel
          && generatorSummarySurface.rowDetails?.some((row) => {
            const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
            const first = normalize(row.cells[0] ?? "");
            const labelMatches = eneaGeneratorActivationLabels(generatorSummarySurface.expectedActivationLabel!).map(normalize).some((label) => first === label || first.includes(label) || label.includes(first));
            const hasModify = row.actions.some((action) => !action.disabled && /(^|\s)modifica(?:\s|$)/.test(normalize(action.title || action.label)));
            return labelMatches && hasModify;
          }));
        const generatorActivationPackage = generatorActivationDiagnostic
          ? draftPackageFor(generatorActivationDiagnostic.customerKey) as unknown as AprEneaDraftPackage
          : null;
        const generatorActivationPage = generatorActivationDiagnostic
          ? generatorActivationDiagnostic.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId) && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0) ?? null
          : null;
        const generatorActivationStep = generatorActivationPackage && generatorActivationPage
          ? generatorActivationPackage.workflow.steps.find((step) => `page:${step.pageName}` === generatorActivationPage.pageId) ?? null
          : null;
        const geothermalPeaRecoveryCommandId = generatorActivationDiagnostic
          ? `service:auto-resume-generator-geothermal-pea:${generatorActivationDiagnostic.customerKey}:${generatorActivationDiagnostic.draftId}:mapping-rebind-v2`
          : null;
        const fieldRecoveryCommandId = fieldVerificationRecovery ? `service:auto-resume-created-field-verification:${fieldVerificationRecovery.customerKey}:${fieldVerificationRecovery.draftId}:${fieldVerificationRecoveryRevision(fieldVerificationRecovery.reason)}` : null;
        const directRouteRecoveryCommandId = directRouteRecovery ? `service:auto-resume-created-direct-route:${directRouteRecovery.customerKey}:${directRouteRecovery.draftId}:allowlisted-route-v46` : null;
        if (!executionBeforeTick.currentCustomerKey && partialInfissiEmptyCanonicalRecovery) {
          const { item, evidence, commandId } = partialInfissiEmptyCanonicalRecovery;
          execution.resumePartialInfissiRowsAfterEmptyCanonicalSummary(item.customerKey, evidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "partial_infissi_rows_empty_canonical_recovery_started", reason: `${item.displayName}: GET canonica a zero righe; il prefisso Infissi staged viene ripristinato 1:1 sulla stessa bozza.`, nextAction: "APR ripristina il prefisso perso e continua le righe mai tentate senza duplicare la bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidence.evidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && emptyGeneratorSummaryRecovery) {
          const { item, diagnostic, commandId } = emptyGeneratorSummaryRecovery;
          execution.resumeGeneratorAndPlantAfterEmptyGeneratorSummary(item.customerKey, diagnostic.evidenceId!, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "generator_empty_summary_recovery_started", reason: `${item.displayName}: tabella generatori vuota dopo lo staging; APR ripristina la sottofinestra e il Salva esterno sulla stessa bozza.`, nextAction: "APR riparte dal generatore annidato senza duplicare la bozza o ripetere le pagine verificate.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId! });
        }
        if (!executionBeforeTick.currentCustomerKey && infissiPostClickRowPersistenceRecovery) {
          const { item, page, diagnostic, expectedRows, commandId } = infissiPostClickRowPersistenceRecovery;
          execution.recordInfissiRowStagedFromPostClickTable(item.customerKey, page.pageId, expectedRows, diagnostic.evidenceId!, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "infissi_post_click_row_table_accepted", reason: `${item.displayName}: ${page.pageId} verificata dalla tabella post-click con ${expectedRows} righe; nessun secondo Salva.`, nextAction: "APR prosegue dalla riga Infissi successiva e verificherà il riepilogo esterno.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId! });
        }
        if (executionBeforeTick.status === "completed" && correctedInfissiPrimaryPackageRecovery?.draftId) {
          const correctedPackage = draftPackageFor(correctedInfissiPrimaryPackageRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(correctedPackage, correctedInfissiPrimaryPackageRecovery.draftId);
          const persistedProbe = correctedInfissiPrimaryPackageRecovery.uncertainPageSave?.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "inconclusive");
          if (!persistedProbe) throw new Error("infissi_primary_package_correction_probe_missing");
          const commandId = `service:auto-requeue-primary-infissi-package-correction:${correctedInfissiPrimaryPackageRecovery.customerKey}:${correctedInfissiPrimaryPackageRecovery.draftId}:${correctedPackage.workflowFingerprint}:v1`;
          execution.requeueVerifiedInfissiPackageCorrectionAfterPrimaryNotSaved(correctedPackage, correctedInfissiPrimaryPackageRecovery.customerKey, persistedProbe.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_infissi_package_correction_requeued", reason: `${correctedInfissiPrimaryPackageRecovery.displayName}: falso cointestatario uguale al beneficiario principale escluso e bozza ${correctedInfissiPrimaryPackageRecovery.draftId} riagganciata; nessuna nuova bozza.`, nextAction: "APR ricompila Beneficiario col pacchetto corretto e prosegue automaticamente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && correctedInfissiPackageRecovery?.draftId && !correctedInfissiPrimaryPackageRecovery) {
          const correctedPackage = draftPackageFor(correctedInfissiPackageRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(correctedPackage, correctedInfissiPackageRecovery.draftId);
          const commandId = `service:auto-requeue-verified-infissi-package-correction:${correctedInfissiPackageRecovery.customerKey}:${correctedInfissiPackageRecovery.draftId}:${correctedPackage.workflowFingerprint}:v1`;
          execution.requeueVerifiedInfissiPackageCorrection(correctedPackage, correctedInfissiPackageRecovery.customerKey, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_infissi_package_correction_requeued", reason: `${correctedInfissiPackageRecovery.displayName}: luogo estero normalizzato e bozza ${correctedInfissiPackageRecovery.draftId} riagganciata in sola lettura; nessuna nuova bozza.`, nextAction: "APR ricompila Beneficiario con il nuovo fingerprint e prosegue sullo stesso ID.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && legacyInfissiRowsRecovery?.draftId && legacyInfissiZeroRowsEvidence?.evidenceId) {
          const upgradedPackage = draftPackageFor(legacyInfissiRowsRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(upgradedPackage, legacyInfissiRowsRecovery.draftId);
          const commandId = `service:auto-resume-legacy-infissi-rows:${legacyInfissiRowsRecovery.customerKey}:${legacyInfissiRowsRecovery.draftId}:${legacyInfissiZeroRowsEvidence.evidenceId}:v1`;
          execution.resumeLegacyInfissiRowsBeforeSummary(legacyInfissiRowsRecovery.customerKey, legacyInfissiZeroRowsEvidence.evidenceId, commandId, upgradedPackage);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "legacy_infissi_rows_requeued_before_summary", reason: `${legacyInfissiRowsRecovery.displayName}: GET canonica a zero righe e pacchetto aggiornato; le pagine comuni restano salvate sulla bozza ${legacyInfissiRowsRecovery.draftId}.`, nextAction: "APR inserisce le righe Infissi 1:1 prima del costo, senza duplicare la bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && correctedPayloadRecovery?.draftId && !correctedInfissiPackageRecovery) {
          const correctedPackage = draftPackageFor(correctedPayloadRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(correctedPackage, correctedPayloadRecovery.draftId);
          const commandId = `service:auto-requeue-verified-payload-correction:${correctedPayloadRecovery.customerKey}:${correctedPayloadRecovery.draftId}:${correctedPackage.workflowFingerprint}:v1`;
          execution.requeueVerifiedPayloadCorrection(preflightSnapshot, correctedPayloadRecovery.customerKey, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_payload_correction_requeued", reason: `${correctedPayloadRecovery.displayName}: payload anagrafico corretto e bozza ${correctedPayloadRecovery.draftId} riagganciata in sola lettura; nessuna nuova bozza.`, nextAction: "APR ricompila Beneficiario con il nuovo fingerprint e prosegue dallo stesso ID.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && correctedRemainingPayloadRecovery?.draftId) {
          const correctedPackage = draftPackageFor(correctedRemainingPayloadRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(correctedPackage, correctedRemainingPayloadRecovery.draftId);
          const commandId = `service:auto-requeue-verified-remaining-payload-correction:${correctedRemainingPayloadRecovery.customerKey}:${correctedRemainingPayloadRecovery.draftId}:${correctedPackage.workflowFingerprint}:single-unit-v1`;
          execution.requeueVerifiedRemainingPayloadCorrection(preflightSnapshot, correctedRemainingPayloadRecovery.customerKey, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_payload_correction_requeued", reason: `${correctedRemainingPayloadRecovery.displayName}: edificio a unita unica riallineato e bozza ${correctedRemainingPayloadRecovery.draftId} riagganciata senza duplicarla.`, nextAction: "APR conserva Beneficiario e riprende dalla pagina Immobile con la classificazione corretta.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && correctedSavedPayloadRecovery?.draftId) {
          const correctedPackage = draftPackageFor(correctedSavedPayloadRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const expectedMappingFingerprint = preflightSnapshot.items.find((item) => item.customerKey === correctedSavedPayloadRecovery.customerKey)?.report?.eneaPayloadAudit?.mappingFingerprint;
          if (!expectedMappingFingerprint) throw new Error(`enea_saved_payload_post_completion_mapping_fingerprint_missing:${correctedSavedPayloadRecovery.customerKey}`);
          const intentCommandId = `service:post-completion-saved-payload-verification-intent:${correctedSavedPayloadRecovery.customerKey}:${correctedSavedPayloadRecovery.draftId}:${correctedPackage.workflowFingerprint}:v1`;
          execution.recordSavedPayloadPostCompletionVerificationIntent(correctedSavedPayloadRecovery.customerKey, expectedMappingFingerprint, intentCommandId);
          executionBeforeTick = execution.snapshot();
          await driver.rebindLegacyMappingReadOnly(correctedPackage, correctedSavedPayloadRecovery.draftId);
          const diagnostic = await driver.inspectPersistedPageValuesReadOnly(correctedPackage, correctedSavedPayloadRecovery.draftId, "page:Immobile");
          const mismatched = diagnostic.fields.filter((field) => !field.matches);
          const oldBuildingTypeIsolated = mismatched.length === 1
            && mismatched[0].portalId === "id-tipologia"
            && /edificio in linea|condominio oltre/i.test(mismatched[0].actual)
            && /casa singola|costruzione isolata/i.test(mismatched[0].expected);
          if (oldBuildingTypeIsolated) {
            const commandId = `service:auto-requeue-saved-single-unit-payload:${correctedSavedPayloadRecovery.customerKey}:${correctedSavedPayloadRecovery.draftId}:${correctedPackage.workflowFingerprint}:v1`;
            execution.requeueSavedDraftPageAfterVerifiedPayloadCorrection(preflightSnapshot, correctedSavedPayloadRecovery.customerKey, "page:Immobile", diagnostic.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_payload_correction_requeued", reason: `${correctedSavedPayloadRecovery.displayName}: GET canonica ha isolato la classificazione condominio sulla sola pagina Immobile; stessa bozza riaccodata come unita unica.`, nextAction: "APR corregge Immobile, conserva tutte le altre pagine e riverifica l'intera bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
          } else {
            const commandId = `service:post-completion-saved-payload-verification-inconclusive:${correctedSavedPayloadRecovery.customerKey}:${correctedSavedPayloadRecovery.draftId}:${correctedPackage.workflowFingerprint}:${diagnostic.evidenceId}:v1`;
            execution.recordSavedPayloadPostCompletionVerificationInconclusive(correctedSavedPayloadRecovery.customerKey, diagnostic.evidenceId, mismatched.map((field) => field.portalId), commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "saved_payload_correction_not_isolated", reason: `${correctedSavedPayloadRecovery.displayName}: la differenza del payload aggiornato non e isolata alla tipologia edificio (${mismatched.map((field) => field.portalId).join(",") || "nessuna differenza DOM"}); nessuna mutazione eseguita.`, nextAction: "Conservare la bozza e riesaminare il contratto senza ripetere Salva.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && authorizedRecoveryMappingRepair?.draftId) {
          const draftPackage = draftPackageFor(authorizedRecoveryMappingRepair.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(draftPackage, authorizedRecoveryMappingRepair.draftId);
          const commandId = `service:auto-resume-authorized-recovery-after-mapping:${authorizedRecoveryMappingRepair.customerKey}:${authorizedRecoveryMappingRepair.draftId}:${authorizedRecoveryMappingRepair.uncertainPageSave!.pageId}:v1`;
          execution.resumeAuthorizedRecoveryAfterMappingRepair(authorizedRecoveryMappingRepair.customerKey, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "authorized_recovery_mapping_rebound", reason: `${authorizedRecoveryMappingRepair.displayName}: mappatura locale riallineata con GET sulla stessa bozza ${authorizedRecoveryMappingRepair.draftId}; nessuna nuova creazione.`, nextAction: "APR riprende l'unico recupero gia autorizzato dalla pagina pendente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && authorizedRecoveryPackageRepair?.draftId) {
          const draftPackage = draftPackageFor(authorizedRecoveryPackageRepair.customerKey) as unknown as AprEneaDraftPackage;
          const expectedMappingFingerprint = preflightSnapshot.items.find((item) => item.customerKey === authorizedRecoveryPackageRepair.customerKey)?.report?.eneaPayloadAudit?.mappingFingerprint;
          if (!expectedMappingFingerprint) throw new Error(`crm_enea_authorized_recovery_mapping_fingerprint_missing:${authorizedRecoveryPackageRepair.customerKey}`);
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(draftPackage, authorizedRecoveryPackageRepair.draftId);
          const commandId = `service:auto-resume-authorized-recovery-after-package:${authorizedRecoveryPackageRepair.customerKey}:${authorizedRecoveryPackageRepair.draftId}:${draftPackage.packageFingerprint}:v1`;
          execution.resumeAuthorizedRecoveryAfterPackageAvailability(draftPackage, expectedMappingFingerprint, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "authorized_recovery_package_available", reason: `${authorizedRecoveryPackageRepair.displayName}: pacchetto locale nuovamente verde e bozza ${authorizedRecoveryPackageRepair.draftId} riagganciata con GET; nessuna nuova creazione.`, nextAction: "APR usa soltanto il recupero gia autorizzato sulla pagina pendente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && authorizedRecoveryTransientTimeout?.draftId) {
          const resolution = authorizedRecoveryTransientTimeout.uncertainPageSave!;
          const checkpoint = authorizedRecoveryTransientTimeout.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId)!;
          const commandId = `service:auto-resume-authorized-recovery-timeout:${authorizedRecoveryTransientTimeout.customerKey}:${authorizedRecoveryTransientTimeout.draftId}:${resolution.pageId}:${checkpoint.recoveryAuthorizedEvidenceId}:v1`;
          const evidenceId = authorizedRecoveryTransientTimeout.serverEvidenceIds.at(-1) ?? checkpoint.recoveryAuthorizedEvidenceId!;
          execution.resumeAuthorizedRecoveryAfterTransientReadOnlyTimeout(authorizedRecoveryTransientTimeout.customerKey, evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "authorized_recovery_transient_timeout_requeued", reason: `${authorizedRecoveryTransientTimeout.displayName}: timeout prima del click; l'unico recupero autorizzato resta integro sulla bozza ${authorizedRecoveryTransientTimeout.draftId}.`, nextAction: "APR riprepara una sola volta la pagina pendente e non crea una nuova bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && packageMappingRebindRecovery?.draftId && !authorizedRecoveryMappingRepair) {
          const draftPackage = draftPackageFor(packageMappingRebindRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(draftPackage, packageMappingRebindRecovery.draftId);
          const commandId = `service:auto-resume-package-mapping-rebind:${packageMappingRebindRecovery.customerKey}:${packageMappingRebindRecovery.draftId}:${draftPackage.packageFingerprint}:v2`;
          execution.resumeCreatedDraftAfterPackageMappingRebind(packageMappingRebindRecovery.customerKey, mappingEvidence.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "package_mapping_rebound", reason: `${packageMappingRebindRecovery.displayName}: fingerprint aggiornato riassociato con GET alla stessa bozza ${packageMappingRebindRecovery.draftId}.`, nextAction: "APR riprende dalla sola pagina pendente; nessuna pagina salvata viene ripetuta.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
        }
        if (screeningReactGenerationRepair) {
          const page = screeningReactGenerationRepair.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.recoveryAuthorizedEvidenceId && !checkpoint.preparedEvidenceId && !checkpoint.savedEvidenceId)!;
          const preparedEvent = [...driverBeforeTick.events].reverse().find((event) => event.action === "prepare_allowlisted_page" && event.customerKey === screeningReactGenerationRepair.customerKey && event.draftId === screeningReactGenerationRepair.draftId && event.pageId === page.pageId);
          const saveEvent = preparedEvent ? driverBeforeTick.events.find((event) => event.action === "save_page_once" && event.customerKey === screeningReactGenerationRepair.customerKey && event.draftId === screeningReactGenerationRepair.draftId && event.pageId === page.pageId && event.revision > preparedEvent.revision) : null;
          const commandId = preparedEvent ? `service:repair-screening-react-preclick-generation:${screeningReactGenerationRepair.customerKey}:${screeningReactGenerationRepair.draftId}:${page.pageId}:${preparedEvent.evidenceId}:v2` : null;
          if (preparedEvent && !saveEvent && commandId && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.requeueScreeningAfterUnclickedReactContractFailure(screeningReactGenerationRepair.customerKey, page.pageId, preparedEvent.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_react_preclick_generation_repaired", reason: `${screeningReactGenerationRepair.displayName}: generazione idempotente di ${page.pageId} riallineata dopo prova journal senza click Salva.`, nextAction: "APR riprepara una sola volta la riga e prosegue sulla stessa bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: preparedEvent.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && infissiMissingFinalCalculationRecovery?.draftId && infissiMissingFinalCalculationEvidence) {
          const draftPackage = draftPackageFor(infissiMissingFinalCalculationRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const commandId = `service:auto-repair-infissi-final-calculation:${infissiMissingFinalCalculationRecovery.customerKey}:${infissiMissingFinalCalculationRecovery.draftId}:${infissiMissingFinalCalculationEvidence.evidenceId}:v1`;
          execution.resumeInfissiFinalCalculationAfterCheckpointRepair(
            infissiMissingFinalCalculationRecovery.customerKey,
            infissiMissingFinalCalculationEvidence.evidenceId,
            commandId,
            draftPackage,
          );
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "infissi_final_calculation_checkpoint_repaired", reason: `${infissiMissingFinalCalculationRecovery.displayName}: pagina Calcolo ripristinata nel checkpoint della stessa bozza ${infissiMissingFinalCalculationRecovery.draftId}; risparmio energetico lasciato al portale.`, nextAction: "APR completa esclusivamente Calcolo costi e detrazioni, verifica lato server e ferma la pratica alla bozza salvata.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: infissiMissingFinalCalculationEvidence.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && finalDraftEvidenceRecovery?.draftId) {
          const draftPackage = draftPackageFor(finalDraftEvidenceRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const evidence = driver.completeDraftServerEvidence(draftPackage, finalDraftEvidenceRecovery.draftId);
          const commandId = evidence ? `service:auto-recover-final-draft-evidence:${finalDraftEvidenceRecovery.customerKey}:${finalDraftEvidenceRecovery.draftId}:${evidence.evidenceId}:v1` : null;
          if (evidence && commandId && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeFinalDraftVerificationFromServerEvidence(finalDraftEvidenceRecovery.customerKey, evidence.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "final_draft_server_evidence_auto_recovered", reason: `${finalDraftEvidenceRecovery.displayName}: catena completa di prove server recuperata dal journal; nessun Salva ripetuto.`, nextAction: "APR registra la stessa bozza come salvata usando il riepilogo server già acquisito.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidence.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && duplicateDiscoveryRecovery) {
          const mistakenMapping = driverBeforeTick.mappings.find((mapping) => mapping.customerKey === duplicateDiscoveryRecovery.customerKey);
          const conflictingOwner = mistakenMapping ? driverBeforeTick.mappings.find((mapping) => mapping.customerKey !== duplicateDiscoveryRecovery.customerKey && mapping.draftId === mistakenMapping.draftId) : null;
          if (mistakenMapping && conflictingOwner) {
            const evidence = driver.discardConflictingDiscoveredMapping(duplicateDiscoveryRecovery.customerKey, mistakenMapping.draftId);
            execution.requeueUnmaterializedCreateIntents([duplicateDiscoveryRecovery.customerKey], evidence.evidenceId, `service:auto-recover-conflicting-discovery:${duplicateDiscoveryRecovery.customerKey}:${mistakenMapping.draftId}:mapped-draft-exclusion-v1`);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "conflicting_draft_discovery_recovered", reason: `${duplicateDiscoveryRecovery.displayName}: associazione locale errata alla bozza ${mistakenMapping.draftId} di ${conflictingOwner.customerKey} rimossa; nessuna nuova creazione era stata eseguita.`, nextAction: "APR riprende lo stesso intento includendo tutti gli ID già mappati nella baseline di discovery.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidence.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && pageFieldContractDiagnostic && !preSaveMappingRecovery && !recoveryTimeoutVerification && !uncertainPageSaveVerification && !infissiExhaustedRowCase) {
          const page = pageFieldContractDiagnostic.pageCheckpoints.find((checkpoint) => checkpoint.state === "pending");
          const priorDiagnostic = page ? driverBeforeTick.pageDiagnostics?.find((item) => item.customerKey === pageFieldContractDiagnostic.customerKey && item.draftId === pageFieldContractDiagnostic.draftId && item.pageId === page.pageId && item.surface && item.contractRevision === "autocomplete-structure-v2") : null;
          if (page && !priorDiagnostic) {
            const diagnosticPackage = draftPackageFor(pageFieldContractDiagnostic.customerKey) as unknown as AprEneaDraftPackage;
            await driver.rebindLegacyMappingReadOnly(diagnosticPackage, pageFieldContractDiagnostic.draftId!);
            const diagnostic = await driver.inspectPersistedPageValuesReadOnly(diagnosticPackage, pageFieldContractDiagnostic.draftId!, page.pageId);
            service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "page_field_contract_inspected_readonly", reason: `${pageFieldContractDiagnostic.displayName}: contratto GET acquisito per ${page.pageId}; ${diagnostic.fields.filter((field) => !field.matches).length} campi non coincidenti, nessun Salva emesso.`, nextAction: "Correggere il mapping del controllo e riprendere la stessa bozza dal checkpoint preparazione.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && exhaustedStandardPageDiagnostic?.draftId) {
          const pageId = exhaustedStandardPageDiagnostic.uncertainPageSave!.pageId;
          const diagnosticPackage = draftPackageFor(exhaustedStandardPageDiagnostic.customerKey) as unknown as AprEneaDraftPackage;
          await driver.rebindLegacyMappingReadOnly(diagnosticPackage, exhaustedStandardPageDiagnostic.draftId);
          const diagnostic = await driver.inspectPreparedStandardPageWithoutSave(diagnosticPackage, exhaustedStandardPageDiagnostic.draftId, pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "exhausted_standard_page_inspected_without_save", reason: `${exhaustedStandardPageDiagnostic.displayName}: ${pageId} compilata nel solo DOM diagnostico, senza Salva; invalidi=${diagnostic.invalidControlIds.join(",") || "nessuno"}, controlli Salva=${diagnostic.saveControls.length}, alert=${diagnostic.alerts.length}.`, nextAction: "Usare la prova DOM/React per una correzione generale; nessun ulteriore Salva e stato emesso.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && screeningSaveTimeoutDiagnostic && !screeningSummaryObserved) {
          const page = screeningSaveTimeoutDiagnostic.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1)!;
          const diagnostic = await driver.inspectScreeningSummaryReadOnly(draftPackageFor(screeningSaveTimeoutDiagnostic.customerKey) as unknown as AprEneaDraftPackage, screeningSaveTimeoutDiagnostic.draftId!, page.pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "screening_summary_inspected_readonly", reason: `${screeningSaveTimeoutDiagnostic.displayName}: riepilogo screening riletto con GET; caricamento=${diagnostic.loading}, superficie=${diagnostic.surfaceReady}, righe=${diagnostic.rows.length}; nessun nuovo Salva.`, nextAction: diagnostic.loading || !diagnostic.surfaceReady ? "Il riepilogo ENEA non ha completato il caricamento server: mantenere il caso isolato e correggere la readiness della pagina." : "Correggere esclusivamente il contratto di lettura della riga oppure mantenere il caso isolato se la riga non esiste.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && authorizedTransmittanceCorrectionRecovery?.item.draftId) {
          const { item, emptyEvidenceId, rejectedEvidenceId } = authorizedTransmittanceCorrectionRecovery;
          const upgradedPackage = draftPackageFor(item.customerKey) as unknown as AprEneaDraftPackage;
          const commandId = `service:resume-infissi-transmittance-over-max-to-13:${item.customerKey}:${item.draftId}:${emptyEvidenceId}:${rejectedEvidenceId}:v2`;
          execution.resumeInfissiRowsAfterAuthorizedTransmittanceCorrection(item.customerKey, emptyEvidenceId, rejectedEvidenceId, commandId, upgradedPackage);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "infissi_transmittance_over_max_to_13_recovery_started", reason: `${item.displayName}: valore fonte oltre il massimo ENEA e limite 1,3 auditati; stessa bozza ${item.draftId} riattivata con 1,3 nel solo campo portale.`, nextAction: "APR ripristina le righe 1:1, salva il riepilogo Serramenti e infissi e verifica la bozza senza preview o invio.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: rejectedEvidenceId });
        }
        if (executionBeforeTick.status === "completed" && !authorizedTransmittanceCorrectionRecovery && infissiExhaustedRowDiagnostic?.draftId) {
          const pageId = infissiExhaustedRowDiagnostic.uncertainPageSave!.pageId;
          const diagnostic = await driver.inspectInfissiRowFailureSurfaceReadOnly(draftPackageFor(infissiExhaustedRowDiagnostic.customerKey) as unknown as AprEneaDraftPackage, infissiExhaustedRowDiagnostic.draftId, pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "infissi_exhausted_row_inspected_readonly", reason: `${infissiExhaustedRowDiagnostic.displayName}: superficie della riga non consolidata acquisita in sola lettura dopo l'unico recupero; righe=${diagnostic.tables.flatMap((table) => table.rows).filter((row) => row.length >= 9).length}, dialoghi=${diagnostic.dialogs.length}, alert=${diagnostic.alerts.length}.`, nextAction: "Correggere il contratto locale usando la prova DOM; nessun ulteriore Salva è autorizzato su questa generazione.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && infissiExhaustedRowModalDiagnostic?.draftId) {
          const pageId = infissiExhaustedRowModalDiagnostic.uncertainPageSave!.pageId;
          const diagnostic = await driver.inspectInfissiAddModalContractReadOnly(draftPackageFor(infissiExhaustedRowModalDiagnostic.customerKey) as unknown as AprEneaDraftPackage, infissiExhaustedRowModalDiagnostic.draftId, pageId);
          const uPost = diagnostic.controls.find((control) => control.id === "id-u_post");
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "infissi_add_modal_contract_inspected_readonly", reason: `${infissiExhaustedRowModalDiagnostic.displayName}: modale Aggiungi aperto senza compilare o salvare; id-u_post min=${uPost?.min || "-"}, max=${uPost?.max || "-"}, step=${uPost?.step || "-"}.`, nextAction: "Usare il contratto osservato per correggere il mapping o classificare un limite portale; nessun Salva è stato emesso.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && infissiExhaustedRowFilledDiagnostic?.draftId) {
          const pageId = infissiExhaustedRowFilledDiagnostic.uncertainPageSave!.pageId;
          const diagnostic = await driver.inspectInfissiFilledModalWithoutSave(draftPackageFor(infissiExhaustedRowFilledDiagnostic.customerKey) as unknown as AprEneaDraftPackage, infissiExhaustedRowFilledDiagnostic.draftId, pageId);
          const invalid = diagnostic.fields.filter((field) => !field.valid || field.ariaInvalid === "true");
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "infissi_filled_modal_inspected_without_save", reason: `${infissiExhaustedRowFilledDiagnostic.displayName}: valori della riga caricati nel solo modale diagnostico, senza Salva; compilati=${diagnostic.filled.compiled.length}, discordanti=${diagnostic.filled.mismatched.length}, invalidi=${invalid.length}, alert=${diagnostic.alerts.length}.`, nextAction: "Correggere il contratto di staging usando la validazione React osservata; il modale non è stato salvato.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && infissiStagingClassifierRecovery?.item.draftId) {
          const { item, emptyEvidenceId, classifierEvidenceId } = infissiStagingClassifierRecovery;
          const commandId = `service:resume-infissi-staging-classifier-v4:${item.customerKey}:${item.draftId}:${emptyEvidenceId}:${classifierEvidenceId}`;
          execution.resumeInfissiRowsAfterStagingClassifierCorrection(item.customerKey, emptyEvidenceId, classifierEvidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "infissi_staging_classifier_recovery_started", reason: `${item.displayName}: server canonico a zero righe e 9/9 valori React validi; stessa bozza ${item.draftId} riattivata dopo correzione del verificatore paginato/riordinato.`, nextAction: "APR ripristina le 10 righe 1:1, salva il riepilogo Serramenti e infissi e verifica la bozza senza preview o invio.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: classifierEvidenceId });
        }
        if (executionBeforeTick.status === "completed" && screeningReactPreclickRecovery) {
          const page = screeningReactPreclickRecovery.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && Boolean(checkpoint.preparedEvidenceId))!;
          const preparedEvent = driverBeforeTick.events.find((event) => event.action === "prepare_allowlisted_page"
            && event.evidenceId === page.preparedEvidenceId
            && event.customerKey === screeningReactPreclickRecovery.customerKey
            && event.draftId === screeningReactPreclickRecovery.draftId
            && event.pageId === page.pageId);
          const saveEvent = preparedEvent ? driverBeforeTick.events.find((event) => event.action === "save_page_once"
            && event.customerKey === screeningReactPreclickRecovery.customerKey
            && event.draftId === screeningReactPreclickRecovery.draftId
            && event.pageId === page.pageId
            && event.revision > preparedEvent.revision) : null;
          const commandId = `service:auto-requeue-screening-react-preclick:${screeningReactPreclickRecovery.customerKey}:${screeningReactPreclickRecovery.draftId}:${page.pageId}:${page.preparedEvidenceId}:v1`;
          if (preparedEvent && !saveEvent && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.requeueScreeningAfterUnclickedReactContractFailure(screeningReactPreclickRecovery.customerKey, page.pageId, preparedEvent.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_react_contract_requeued_preclick", reason: `${screeningReactPreclickRecovery.displayName}: journal verificato, nessun click Salva emesso su ${page.pageId}; riallineamento React e ripresa della stessa bozza.`, nextAction: "APR riprepara esclusivamente la riga interrotta; righe già salvate e ID bozza restano invariati.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: preparedEvent.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && screeningSummaryPersistenceDiagnostic && screeningPersistenceProofs.length < 2) {
          const firstScreeningPage = screeningSummaryPersistenceDiagnostic.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:"))!;
          const diagnostic = await driver.inspectScreeningSummaryReadOnly(draftPackageFor(screeningSummaryPersistenceDiagnostic.customerKey) as unknown as AprEneaDraftPackage, screeningSummaryPersistenceDiagnostic.draftId!, firstScreeningPage.pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "screening_persistence_inspected_readonly", reason: `${screeningSummaryPersistenceDiagnostic.displayName}: lettura server indipendente ${screeningPersistenceProofs.length + 1}/2; righe=${diagnostic.rowCount}, caricamento=${diagnostic.loading}, superficie=${diagnostic.surfaceReady}, autenticata=${diagnostic.authenticated}; nessun campo modificato e nessun Salva.`, nextAction: "APR esegue una seconda lettura indipendente prima di autorizzare qualunque recupero.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed"
          && screeningSummaryPersistenceDiagnostic
          && screeningPersistenceProofs.length === 2) {
          const proofIds = screeningPersistenceProofs.map((proof) => proof.evidenceId).join(":");
          const commandId = `service:auto-recover-empty-screening-summary:${screeningSummaryPersistenceDiagnostic.customerKey}:${screeningSummaryPersistenceDiagnostic.draftId}:${proofIds}:v2`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeScreeningRowsAfterEmptyServerSummary(screeningSummaryPersistenceDiagnostic.customerKey, screeningPersistenceProofs, commandId);
            executionBeforeTick = execution.snapshot();
            const recovered = executionBeforeTick.items.find((item) => item.customerKey === screeningSummaryPersistenceDiagnostic.customerKey)?.state === "filling";
            service.record({ instanceId, processPid: process.pid, status: recovered ? "running" : "technical_block", type: recovered ? "screening_empty_summary_auto_recovered" : "screening_empty_summary_recovery_rejected", reason: recovered ? `${screeningSummaryPersistenceDiagnostic.displayName}: due letture server indipendenti e concordanti provano zero righe persistite; autorizzato un solo ripristino 1:1 sulla stessa bozza.` : `${screeningSummaryPersistenceDiagnostic.displayName}: le due letture non soddisfano il contratto rigoroso; recupero automatico vietato.`, nextAction: recovered ? "APR reinserisce esclusivamente le righe assenti e salva il riepilogo una sola volta; nessuna duplicazione possibile." : "Richiesto intervento operatore: nessun nuovo Salva automatico è autorizzato.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: screeningPersistenceProofs[1].evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && screeningPostSaveVerification && screeningPostSaveDiagnostic?.kind === "screening-post-save-readonly-v1" && screeningPostSaveDiagnostic.customerKey === screeningPostSaveVerification.customerKey && screeningPostSaveDiagnostic.draftId === screeningPostSaveVerification.draftId && (screeningPostSaveDiagnostic.rowCount ?? 0) > 0 && screeningPostSaveDiagnostic.modalOpen === false) {
          const page = screeningPostSaveVerification.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1)!;
          const draftPackage = draftPackageFor(screeningPostSaveVerification.customerKey) as unknown as AprEneaDraftPackage;
          const screeningIndex = Number(page.pageId.slice("screening:".length)) - 1;
          const screeningStep = draftPackage.workflow.screeningSteps[screeningIndex];
          const matchingRows = screeningStep ? matchingScreeningRowIndexes(screeningPostSaveDiagnostic.rows ?? [], screeningStep.fields) : [];
          const saveEvent = [...driverBeforeTick.events].reverse().find((event) => event.action === "save_page_once" && event.customerKey === screeningPostSaveVerification.customerKey && event.draftId === screeningPostSaveVerification.draftId && event.pageId === page.pageId);
          const diagnosticEvent = driverBeforeTick.events.find((event) => event.evidenceId === screeningPostSaveDiagnostic.evidenceId && event.action === "verify_screening_post_save_failed_readonly_diagnostic" && event.customerKey === screeningPostSaveVerification.customerKey && event.draftId === screeningPostSaveVerification.draftId && event.pageId === page.pageId);
          const commandId = `service:auto-verify-screening-unique-row:${screeningPostSaveVerification.customerKey}:${screeningPostSaveVerification.draftId}:${page.pageId}:${screeningPostSaveDiagnostic.evidenceId}:v45`;
          if (matchingRows.length === 1 && saveEvent && diagnosticEvent && diagnosticEvent.revision > saveEvent.revision && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.recordScreeningStagedFromPostSaveReadOnly(screeningPostSaveVerification.customerKey, page.pageId, screeningPostSaveDiagnostic.evidenceId!, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_unique_row_post_save_verified", reason: `${screeningPostSaveVerification.displayName}: una sola riga tecnica coincide integralmente nel riepilogo successivo all'unico Salva; nessun secondo click.`, nextAction: "APR prosegue dalla riga successiva sulla stessa bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: screeningPostSaveDiagnostic.evidenceId! });
          }
        }
        if (screeningRecoveryPostSaveVerification && screeningPostSaveDiagnostic?.kind === "screening-post-save-readonly-v1" && screeningPostSaveDiagnostic.customerKey === screeningRecoveryPostSaveVerification.customerKey && screeningPostSaveDiagnostic.draftId === screeningRecoveryPostSaveVerification.draftId && (screeningPostSaveDiagnostic.rowCount ?? 0) > 0 && screeningPostSaveDiagnostic.modalOpen === false) {
          const page = screeningRecoveryPostSaveVerification.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:") && checkpoint.state === "save_intent_recorded" && checkpoint.recoverySaveAttemptCount === 1)!;
          const draftPackage = draftPackageFor(screeningRecoveryPostSaveVerification.customerKey) as unknown as AprEneaDraftPackage;
          const screeningIndex = Number(page.pageId.slice("screening:".length)) - 1;
          const screeningStep = draftPackage.workflow.screeningSteps[screeningIndex];
          const matchingRows = screeningStep ? matchingScreeningRowIndexes(screeningPostSaveDiagnostic.rows ?? [], screeningStep.fields) : [];
          const saveEvent = [...driverBeforeTick.events].reverse().find((event) => event.action === "save_page_once" && event.customerKey === screeningRecoveryPostSaveVerification.customerKey && event.draftId === screeningRecoveryPostSaveVerification.draftId && event.pageId === page.pageId);
          const diagnosticEvent = driverBeforeTick.events.find((event) => event.evidenceId === screeningPostSaveDiagnostic.evidenceId && event.action === "verify_screening_post_save_failed_readonly_diagnostic" && event.customerKey === screeningRecoveryPostSaveVerification.customerKey && event.draftId === screeningRecoveryPostSaveVerification.draftId && event.pageId === page.pageId);
          const commandId = `service:auto-verify-screening-recovery-unique-row:${screeningRecoveryPostSaveVerification.customerKey}:${screeningRecoveryPostSaveVerification.draftId}:${page.pageId}:${screeningPostSaveDiagnostic.evidenceId}:v46`;
          if (matchingRows.length === 1 && saveEvent && diagnosticEvent && diagnosticEvent.revision > saveEvent.revision && !executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.recordScreeningRecoveryStagedFromPostSaveReadOnly(screeningRecoveryPostSaveVerification.customerKey, page.pageId, screeningPostSaveDiagnostic.evidenceId!, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_recovery_unique_row_verified", reason: `${screeningRecoveryPostSaveVerification.displayName}: l'unico recupero di ${page.pageId} coincide con una sola riga server; nessun ulteriore Salva.`, nextAction: "APR prosegue dalla riga successiva sulla stessa bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: screeningPostSaveDiagnostic.evidenceId! });
          }
        }
        if (executionBeforeTick.status === "completed" && generatorUncertainReadOnlyRecovery) {
          const pageId = generatorUncertainReadOnlyRecovery.uncertainPageSave!.pageId;
          const commandId = `service:auto-verify-uncertain-generator-summary:${generatorUncertainReadOnlyRecovery.customerKey}:${generatorUncertainReadOnlyRecovery.draftId}:${pageId}:v1`;
          const diagnostic = await driver.inspectGeneratorSummaryReadOnly(draftPackageFor(generatorUncertainReadOnlyRecovery.customerKey) as unknown as AprEneaDraftPackage, generatorUncertainReadOnlyRecovery.draftId!, pageId);
          execution.resumeReadOnlyVerificationOfUncertainPageSave(generatorUncertainReadOnlyRecovery.customerKey, pageId, diagnostic.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "uncertain_generator_save_readonly_verification_resumed", reason: `${generatorUncertainReadOnlyRecovery.displayName}: riepilogo generatore acquisito con GET; ripresa della sola verifica, senza secondo Salva.`, nextAction: "APR confronta i valori nella tabella server e prosegue solo se coincidono integralmente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && generatorUncertainActivationDiagnostic) {
          const pageId = generatorUncertainActivationDiagnostic.uncertainPageSave!.pageId;
          const commandId = `service:inspect-uncertain-generator-react-contract:${generatorUncertainActivationDiagnostic.customerKey}:${generatorUncertainActivationDiagnostic.draftId}:${pageId}:v2`;
          const diagnostic = await driver.inspectGeneratorActivationSurfaceReadOnly(draftPackageFor(generatorUncertainActivationDiagnostic.customerKey) as unknown as AprEneaDraftPackage, generatorUncertainActivationDiagnostic.draftId!, pageId);
          execution.recordCaseBlockedAndContinue(generatorUncertainActivationDiagnostic.customerKey, `Diagnostica React generatore acquisita dopo prova server vuota: riga=${diagnostic.activation.rowFound}, controllo=${diagnostic.activation.controlFound}, marker=${diagnostic.markerIdsPresent.length}; nessun secondo Salva.`, diagnostic.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "uncertain_generator_react_contract_inspected", reason: `${generatorUncertainActivationDiagnostic.displayName}: modulo generatore aperto in sola lettura dopo prova server vuota; ${diagnostic.controls.length} controlli osservati, nessun campo modificato e nessun Salva.`, nextAction: "Correggere localmente il binding React e collaudarlo su fixture prima di una nuova pratica.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed"
          && generatorActivationDiagnostic
          && generatorActivationPackage
          && generatorActivationPage
          && generatorActivationStep?.markerIds.includes("id-pea")
          && geothermalPeaRecoveryCommandId
          && !executionBeforeTick.processedCommandIds.includes(geothermalPeaRecoveryCommandId)) {
          const diagnostic = await driver.inspectGeneratorActivationSurfaceReadOnly(
            generatorActivationPackage,
            generatorActivationDiagnostic.draftId!,
            generatorActivationPage.pageId,
          );
          const allExpectedMarkersPresent = generatorActivationStep.markerIds.every((markerId) => diagnostic.markerIdsPresent.includes(markerId));
          if (diagnostic.activation.rowFound
            && diagnostic.activation.controlFound
            && diagnostic.activation.clicked
            && allExpectedMarkersPresent) {
            const mappingEvidence = await driver.rebindLegacyMappingReadOnly(
              generatorActivationPackage,
              generatorActivationDiagnostic.draftId!,
            );
            execution.resumeCreatedDraftAfterGeneratorActivationCorrection(
              generatorActivationDiagnostic.customerKey,
              mappingEvidence.evidenceId,
              geothermalPeaRecoveryCommandId,
            );
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "generator_geothermal_pea_auto_resumed", reason: `${generatorActivationDiagnostic.displayName}: controlli geotermici reali id-num/id-pea/id-pn e nuova impronta del piano riallineati integralmente; ripresa automatica della stessa bozza, senza nuova creazione.`, nextAction: "APR compila il generatore pendente e prosegue dalle pagine non ancora salvate.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
          } else {
            service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "generator_geothermal_pea_contract_incomplete", reason: `${generatorActivationDiagnostic.displayName}: contratto geotermico incompleto; attesi=${generatorActivationStep.markerIds.join(",")}, presenti=${diagnostic.markerIdsPresent.join(",") || "nessuno"}; nessun campo compilato e nessun Salva.`, nextAction: "Mantenere la stessa bozza isolata e correggere il contratto solo dopo nuova evidenza DOM completa.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && generatorActivationDiagnostic && !generatorSummarySurfaceMatchesCurrent) {
          const page = generatorActivationDiagnostic.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId) && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)!;
          const diagnostic = await driver.inspectGeneratorSummaryReadOnly(draftPackageFor(generatorActivationDiagnostic.customerKey) as unknown as AprEneaDraftPackage, generatorActivationDiagnostic.draftId!, page.pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "generator_summary_inspected_readonly", reason: `${generatorActivationDiagnostic.displayName}: tabella generatori riletta con GET; ${diagnostic.rows.length} righe e ${diagnostic.actions.length} azioni osservate, nessun Salva.`, nextAction: "Allineare la label di attivazione esclusivamente a una riga portale inequivoca, poi riprendere la stessa bozza dal checkpoint.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && generatorActivationDiagnostic && generatorSummaryObserved && generatorSummaryRowReady && generatorSummarySurface?.evidenceId) {
          const commandId = `service:auto-resume-generator-summary-control:${generatorActivationDiagnostic.customerKey}:${generatorActivationDiagnostic.draftId}:electric-carrier-alias-v43`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeCreatedDraftAfterGeneratorActivationCorrection(generatorActivationDiagnostic.customerKey, generatorSummarySurface.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "generator_summary_control_auto_resumed", reason: `${generatorActivationDiagnostic.displayName}: riga tecnica generatore e controllo Modifica verificati nel riepilogo; ripresa della stessa bozza con alias portale auditato.`, nextAction: "APR apre Altro per il generatore alimentato a energia elettrica, compila e salva una sola volta.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: generatorSummarySurface.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && generatorActivationDiagnostic && generatorSummaryObserved && !generatorActivationObserved) {
          const page = generatorActivationDiagnostic.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId) && checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)!;
          const diagnostic = await driver.inspectGeneratorActivationSurfaceReadOnly(draftPackageFor(generatorActivationDiagnostic.customerKey) as unknown as AprEneaDraftPackage, generatorActivationDiagnostic.draftId!, page.pageId);
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "generator_activation_surface_inspected_readonly", reason: `${generatorActivationDiagnostic.displayName}: riga=${diagnostic.activation.rowFound}, controllo=${diagnostic.activation.controlFound}, click UI=${diagnostic.activation.clicked}, marker=${diagnostic.markerIdsPresent.length}; nessun campo compilato e nessun Salva.`, nextAction: "Allineare l'apertura modale ai controlli osservati, poi riprendere la stessa bozza dal checkpoint.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        const generatorActivationSurface = driver.snapshot().pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; evidenceId?: string; markerIdsPresent?: string[]; activation?: { rowFound?: boolean; controlFound?: boolean; clicked?: boolean } } | null;
        if (executionBeforeTick.status === "completed" && generatorActivationDiagnostic && generatorActivationStep && generatorActivationObserved && generatorActivationSurface?.kind === "generator-activation-surface-readonly-v2" && generatorActivationSurface.customerKey === generatorActivationDiagnostic.customerKey && generatorActivationSurface.draftId === generatorActivationDiagnostic.draftId && generatorActivationSurface.activation?.rowFound && generatorActivationSurface.activation.controlFound && generatorActivationSurface.activation.clicked && generatorActivationStep.markerIds.every((markerId) => generatorActivationSurface.markerIdsPresent?.includes(markerId))) {
          const commandId = `service:auto-resume-generator-activation:${generatorActivationDiagnostic.customerKey}:${generatorActivationDiagnostic.draftId}:react-table-wait-v42`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeCreatedDraftAfterGeneratorActivationCorrection(generatorActivationDiagnostic.customerKey, generatorActivationSurface.evidenceId!, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "generator_activation_auto_resumed", reason: `${generatorActivationDiagnostic.displayName}: riga generatore caricata e modale riconosciuta; ripresa della stessa bozza senza nuova creazione.`, nextAction: "APR compila il generatore pendente e conserva le pagine già salvate.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: generatorActivationSurface.evidenceId! });
          }
        }
        if (executionBeforeTick.status === "completed" && fieldVerificationRecovery && fieldRecoveryPageId && !fieldRecoveryDiagnostic) {
          const recoveryPackage = draftPackageFor(fieldVerificationRecovery.customerKey) as unknown as AprEneaDraftPackage;
          await driver.rebindLegacyMappingReadOnly(recoveryPackage, fieldVerificationRecovery.draftId!);
          const diagnostic = await driver.inspectPersistedPageValuesReadOnly(
            recoveryPackage,
            fieldVerificationRecovery.draftId!,
            fieldRecoveryPageId,
          );
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "field_verification_surface_inspected_readonly", reason: `${fieldVerificationRecovery.displayName}: pagina pendente riletta in sola lettura dopo aggiornamento del contratto; nessun Salva emesso.`, nextAction: "APR userà questa prova per riprendere la stessa pagina col contratto testato.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && disabledCostContractRecovery?.draftId && disabledCostContractDiagnostic) {
          const diagnostic = await driver.inspectScreeningSummaryReadOnly(
            draftPackageFor(disabledCostContractRecovery.customerKey) as unknown as AprEneaDraftPackage,
            disabledCostContractRecovery.draftId,
            "screening:1",
          );
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "disabled_cost_summary_inspected_readonly", reason: `${disabledCostContractRecovery.displayName}: tabella schermature e costo disabilitato riletti in sola lettura; nessun campo o Salva toccato.`, nextAction: "Classificare il contratto reale della pagina prima della ripresa.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && fieldVerificationRecovery && fieldRecoveryDiagnostic && fieldRecoveryCommandId && !executionBeforeTick.processedCommandIds.includes(fieldRecoveryCommandId)) {
          const recoveryPackage = draftPackageFor(fieldVerificationRecovery.customerKey) as unknown as AprEneaDraftPackage;
          // La diagnostica della pagina puo appartenere a una revisione
          // precedente del pacchetto. Prima di riattivare l'esecuzione
          // riassocia sempre, tramite GET, l'impronta corrente alla stessa
          // bozza; in questo modo il tick operativo non ricade nel falso
          // `mapping_missing` dopo una correzione del driver.
          const mappingEvidence = await driver.rebindLegacyMappingReadOnly(recoveryPackage, fieldVerificationRecovery.draftId!);
          const evidenceId = mappingEvidence.evidenceId;
          execution.resumeCreatedDraftAfterFieldVerificationCorrection(fieldVerificationRecovery.customerKey, evidenceId, fieldRecoveryCommandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_field_verification_auto_resumed", reason: `${fieldVerificationRecovery.displayName} ripresa sulla stessa bozza dopo correzione verificata del confronto dei controlli portale.`, nextAction: "APR ricompila la pagina pendente e salva una sola volta soltanto dopo rilettura verde.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && preSaveMappingRecovery?.draftId) {
          const draftPackage = draftPackageFor(preSaveMappingRecovery.customerKey) as unknown as AprEneaDraftPackage;
          const commandId = `service:auto-resume-pre-save-mapping:${preSaveMappingRecovery.customerKey}:${preSaveMappingRecovery.draftId}:${draftPackage.packageFingerprint}:v57`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            const evidence = await driver.rebindLegacyMappingReadOnly(draftPackage, preSaveMappingRecovery.draftId);
            execution.resumeCreatedDraftAfterFieldVerificationCorrection(preSaveMappingRecovery.customerKey, evidence.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_field_verification_auto_resumed", reason: `${preSaveMappingRecovery.displayName}: nuova impronta locale riallineata con GET alla stessa bozza ${preSaveMappingRecovery.draftId}; nessuna duplicazione e nessun Salva precedente.`, nextAction: "APR ricompila la prima pagina pendente con il contratto corretto e salva una sola volta dopo verifica.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidence.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && directRouteRecovery && directRouteRecoveryCommandId && !executionBeforeTick.processedCommandIds.includes(directRouteRecoveryCommandId)) {
          const evidenceId = directRouteRecovery.serverEvidenceIds.at(-1) ?? `draft-${directRouteRecovery.draftId}-direct-route`;
          execution.resumeCreatedDraftAfterDirectRouteCorrection(directRouteRecovery.customerKey, evidenceId, directRouteRecoveryCommandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_page_order_auto_resumed", reason: `${directRouteRecovery.displayName}: route diretta allowlistata ripristinata sulla stessa bozza; nessuna nuova creazione o ripetizione dei Salva verificati.`, nextAction: "APR riprende dalla prima pagina pendente dello stesso ID bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && transientReadOnlyTimeoutRecovery) {
          const evidenceId = transientReadOnlyTimeoutRecovery.serverEvidenceIds.at(-1) ?? `draft-${transientReadOnlyTimeoutRecovery.draftId}-pre-save-timeout`;
          const pendingPage = transientReadOnlyTimeoutRecovery.pageCheckpoints.find((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0);
          if (!pendingPage) throw new Error(`apr_enea_transient_timeout_pending_page_missing:${transientReadOnlyTimeoutRecovery.customerKey}`);
          execution.resumeCreatedDraftAfterTransientReadOnlyTimeout(transientReadOnlyTimeoutRecovery.customerKey, evidenceId, `service:auto-resume-created-transient-readonly-timeout:${transientReadOnlyTimeoutRecovery.customerKey}:${transientReadOnlyTimeoutRecovery.draftId}:${pendingPage.pageId}:runtime-evaluate-60s-v2`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_transient_readonly_timeout_auto_resumed", reason: `${transientReadOnlyTimeoutRecovery.displayName} ripresa sulla stessa bozza dopo timeout precedente a qualunque Salva.`, nextAction: "APR ricompila la prima pagina pendente con il limite corretto e non crea una nuova bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && screeningRestageTransientTimeoutRecovery?.draftId) {
          const pendingPage = screeningRestageTransientTimeoutRecovery.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:")
            && checkpoint.state === "pending"
            && checkpoint.saveAttemptCount === 1
            && checkpoint.recoverySaveAttemptCount === 0
            && Boolean(checkpoint.recoveryAuthorizedEvidenceId));
          if (!pendingPage?.recoveryAuthorizedEvidenceId) throw new Error(`apr_enea_screening_restage_timeout_pending_page_missing:${screeningRestageTransientTimeoutRecovery.customerKey}`);
          const commandId = `service:auto-resume-screening-restage-timeout:${screeningRestageTransientTimeoutRecovery.customerKey}:${screeningRestageTransientTimeoutRecovery.draftId}:${pendingPage.pageId}:${pendingPage.recoveryAuthorizedEvidenceId}:v1`;
          execution.resumeAuthorizedScreeningRestageAfterTransientTimeout(screeningRestageTransientTimeoutRecovery.customerKey, pendingPage.recoveryAuthorizedEvidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "authorized_screening_restage_transient_timeout_auto_resumed", reason: `${screeningRestageTransientTimeoutRecovery.displayName}: ripristino 1:1 ripreso sulla stessa bozza dopo timeout precedente al Salva della riga pendente.`, nextAction: "APR continua dalla prima riga di recupero pendente senza ripetere righe già verificate.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: pendingPage.recoveryAuthorizedEvidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && preSaveRemountRecovery) {
          const page = preSaveRemountRecovery.pageCheckpoints.find((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.savedEvidenceId)!;
          const preparedEvent = [...driverBeforeTick.events].reverse().find((event) => event.action === "prepare_allowlisted_page" && event.customerKey === preSaveRemountRecovery.customerKey && event.draftId === preSaveRemountRecovery.draftId && event.pageId === page.pageId);
          const saveEvent = preparedEvent ? driverBeforeTick.events.find((event) => event.action === "save_page_once" && event.customerKey === preSaveRemountRecovery.customerKey && event.draftId === preSaveRemountRecovery.draftId && event.pageId === page.pageId && event.revision > preparedEvent.revision) : null;
          if (preparedEvent && !saveEvent) {
            const commandId = `service:auto-resume-pre-save-remount:${preSaveRemountRecovery.customerKey}:${preSaveRemountRecovery.draftId}:${page.pageId}:${preparedEvent.evidenceId}:v1`;
            if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
              execution.resumeCreatedDraftAfterPreSaveRemount(preSaveRemountRecovery.customerKey, preparedEvent.evidenceId, commandId);
              executionBeforeTick = execution.snapshot();
              service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_pre_save_remount_auto_resumed", reason: `${preSaveRemountRecovery.displayName}: journal verificato senza click Salva; stessa bozza ripresa dalla sola pagina rimontata.`, nextAction: "APR ricompila e rilegge i campi immediatamente prima dell'unico Salva.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: preparedEvent.evidenceId });
            }
          }
        }
        if (!executionBeforeTick.currentCustomerKey && checkpointCollisionRecovery) {
          const page = checkpointCollisionRecovery.pageCheckpoints.find((checkpoint) => checkpoint.state === "prepared" && !checkpoint.savedEvidenceId)!;
          const verified = [...driverBeforeTick.events].reverse().find((event) => event.action === "verify_page_saved_server_redirect" && event.customerKey === checkpointCollisionRecovery.customerKey && event.draftId === checkpointCollisionRecovery.draftId && event.pageId === page.pageId);
          if (verified?.url) {
            const commandId = `service:auto-resume-page-saved-checkpoint-collision:${checkpointCollisionRecovery.customerKey}:${checkpointCollisionRecovery.draftId}:${page.pageId}:${verified.evidenceId}:v1`;
            if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
              execution.resumePageSavedAfterCheckpointCollision(checkpointCollisionRecovery.customerKey, page.pageId, verified.evidenceId, verified.url, commandId);
              executionBeforeTick = execution.snapshot();
              service.record({ instanceId, processPid: process.pid, status: "running", type: "page_saved_checkpoint_collision_auto_resumed", reason: `${checkpointCollisionRecovery.displayName}: redirect server già acquisito recepito nel checkpoint; nessun nuovo Salva.`, nextAction: "APR prosegue dalla pagina successiva della stessa bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: verified.evidenceId });
            }
          }
        }
        if (!executionBeforeTick.currentCustomerKey && unclickedSaveControlRecovery) {
          const page = unclickedSaveControlRecovery.pageCheckpoints.find((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && !checkpoint.savedEvidenceId)!;
          const prepared = [...driverBeforeTick.events].reverse().find((event) => event.action === "prepare_allowlisted_page" && event.customerKey === unclickedSaveControlRecovery.customerKey && event.draftId === unclickedSaveControlRecovery.draftId && event.pageId === page.pageId);
          const clicked = prepared ? driverBeforeTick.events.find((event) => event.action === "save_page_once" && event.customerKey === unclickedSaveControlRecovery.customerKey && event.draftId === unclickedSaveControlRecovery.draftId && event.pageId === page.pageId && event.revision > prepared.revision) : null;
          if (prepared && !clicked) {
            const commandId = `service:auto-resume-unclicked-save-control:${unclickedSaveControlRecovery.customerKey}:${unclickedSaveControlRecovery.draftId}:${page.pageId}:${prepared.evidenceId}:v1`;
            if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
              execution.resumeUnclickedPageAfterSaveControlCorrection(unclickedSaveControlRecovery.customerKey, page.pageId, prepared.evidenceId, commandId);
              executionBeforeTick = execution.snapshot();
              service.record({ instanceId, processPid: process.pid, status: "running", type: "unclicked_save_control_auto_resumed", reason: `${unclickedSaveControlRecovery.displayName}: journal senza click; stessa pagina riaccodata con il controllo Salva corretto.`, nextAction: "APR compila e salva una sola volta sulla stessa bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: prepared.evidenceId });
            }
          }
        }
        if (executionBeforeTick.status === "completed" && screeningOrderRecovery && screeningOrderDiagnostic) {
          const commandId = `service:auto-resume-screening-before-summary:${screeningOrderRecovery.customerKey}:${screeningOrderRecovery.draftId}:disabled-cost-proof-v1`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeCreatedDraftAfterScreeningOrderCorrection(screeningOrderRecovery.customerKey, screeningOrderDiagnostic.evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_order_auto_resumed", reason: `${screeningOrderRecovery.displayName}: righe schermatura riallineate prima del costo riepilogativo sulla stessa bozza.`, nextAction: "APR riprende dalla prima schermatura 1:1 senza ripetere pagine o salvataggi già verificati.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: screeningOrderDiagnostic.evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && screeningNavigationRecovery) {
          const evidenceId = screeningNavigationRecovery.serverEvidenceIds.at(-1) ?? `local-screening-navigation-contract-${screeningNavigationRecovery.draftId}`;
          const commandId = `service:auto-resume-screening-navigation:${screeningNavigationRecovery.customerKey}:${screeningNavigationRecovery.draftId}:react-add-wait-v23`;
          if (!executionBeforeTick.processedCommandIds.includes(commandId)) {
            execution.resumeCreatedDraftAfterScreeningNavigationCorrection(screeningNavigationRecovery.customerKey, evidenceId, commandId);
            executionBeforeTick = execution.snapshot();
            service.record({ instanceId, processPid: process.pid, status: "running", type: "screening_navigation_auto_resumed", reason: `${screeningNavigationRecovery.displayName}: apertura annidata Aggiungi schermatura corretta e testata; ripresa sulla stessa bozza.`, nextAction: "APR inserisce le righe 1:1 e le verifica prima del riepilogo, senza ripetere pagine già salvate.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
          }
        }
        if (executionBeforeTick.status === "completed" && priorPageSaveVerification) {
          const evidenceId = priorPageSaveVerification.serverEvidenceIds.at(-1) ?? `draft-${priorPageSaveVerification.draftId}-beneficiary-save-diagnostic`;
          execution.resumeReadOnlyVerificationOfPriorPageSave(priorPageSaveVerification.customerKey, "page:Anagrafica Beneficiario", evidenceId, `service:auto-verify-prior-page-save:${priorPageSaveVerification.customerKey}:${priorPageSaveVerification.draftId}:beneficiary-v1`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "prior_page_save_readonly_verification_resumed", reason: `${priorPageSaveVerification.displayName}: verifica GET del precedente salvataggio Anagrafica sulla stessa bozza.`, nextAction: "APR non ripete Salva; prosegue soltanto se i valori sono persistiti lato server.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && calculation36InputContractRecovery) {
          const evidenceId = "software-contract:calculation-36-react-controlled-input-v5";
          const commandId = `service:auto-requeue-calculation-36-input-contract:${calculation36InputContractRecovery.customerKey}:${calculation36InputContractRecovery.draftId}:react-controlled-input-v5`;
          execution.requeueCalculationAllocationAfterInputContractUpgrade(calculation36InputContractRecovery.customerKey, evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "calculation_36_input_contract_auto_recovered", reason: `${calculation36InputContractRecovery.displayName}: contratto 36% aggiornato e collaudato con attesa della risposta asincrona ENEA; stessa bozza riaccodata senza ripetere le pagine salvate.`, nextAction: "APR attende la chiusura del modale e la tabella 36% aggiornata prima di qualunque GET di verifica.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && standardSaveDeliveryContractRecovery) {
          const pageId = standardSaveDeliveryContractRecovery.uncertainPageSave!.pageId;
          const evidenceId = "software-contract:trusted-enter-zero-mutation-v1";
          const commandId = `service:auto-requeue-standard-save-delivery:${standardSaveDeliveryContractRecovery.customerKey}:${standardSaveDeliveryContractRecovery.draftId}:${pageId}:trusted-enter-zero-mutation-v1`;
          execution.requeueStandardPageAfterSaveDeliveryContractUpgrade(standardSaveDeliveryContractRecovery.customerKey, evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "standard_save_delivery_contract_auto_recovered", reason: `${standardSaveDeliveryContractRecovery.displayName}: due consegne Salva senza richiesta né navigazione provano zero mutazioni; stessa bozza riaccodata col fallback attendibile collaudato.`, nextAction: "APR riprende la stessa pagina e verifica la risposta server senza creare una nuova bozza.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && municipalityAutocompleteContractRecovery) {
          const diagnostic = [...((driverBeforeTick.pageSaveDiagnostics ?? []) as Array<{ customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string }>)]
            .reverse().find((candidate) => candidate.customerKey === municipalityAutocompleteContractRecovery.customerKey && candidate.draftId === municipalityAutocompleteContractRecovery.draftId && candidate.pageId === "page:Anagrafica Beneficiario")!;
          const commandId = `service:auto-requeue-municipality-autocomplete:${municipalityAutocompleteContractRecovery.customerKey}:${municipalityAutocompleteContractRecovery.draftId}:authoritative-istat-v68`;
          execution.requeueBeneficiaryAfterMunicipalityAutocompleteContractUpgrade(municipalityAutocompleteContractRecovery.customerKey, diagnostic.evidenceId!, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "municipality_autocomplete_contract_auto_recovered", reason: `${municipalityAutocompleteContractRecovery.displayName}: selezione Comune riallineata alla superficie autorevole ENEA; stessa bozza riaccodata.`, nextAction: "APR seleziona entrambi i Comuni dalla lista del portale e li verifica dopo il Salva.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && calculation36TransientSurfaceVerification?.draftId) {
          const diagnostic = driverBeforeTick.pageDiagnostics.find((candidate) => candidate.customerKey === calculation36TransientSurfaceVerification.customerKey
            && candidate.draftId === calculation36TransientSurfaceVerification.draftId
            && candidate.pageId === "page:Allocazione costi e detrazioni")!;
          const commandId = `service:resume-calculation-36-readonly-after-transient-surface:${calculation36TransientSurfaceVerification.customerKey}:${calculation36TransientSurfaceVerification.draftId}:v6`;
          execution.resumeCalculationAllocationReadOnlyVerificationAfterTransientSurface(calculation36TransientSurfaceVerification.customerKey, diagnostic.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "calculation_36_transient_surface_readonly_resumed", reason: `${calculation36TransientSurfaceVerification.displayName}: la tabella React assente non prova un mancato salvataggio; ripresa esclusivamente la verifica GET della bozza ${calculation36TransientSurfaceVerification.draftId}.`, nextAction: "APR attende la tabella server fino a 30 secondi e non emette alcun nuovo Salva.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && calculation36ModalContractDiagnostic?.draftId) {
          const draftPackage = draftPackageFor(calculation36ModalContractDiagnostic.customerKey) as unknown as AprEneaDraftPackage;
          const diagnostic = await driver.inspectCalculationAllocationModalContractReadOnly(draftPackage, calculation36ModalContractDiagnostic.draftId, "page:Allocazione costi e detrazioni");
          service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "calculation_36_modal_contract_inspected_readonly", reason: `${calculation36ModalContractDiagnostic.displayName}: APR ha inventariato campo, stato React e pulsante del modale 36% senza modificare o salvare.`, nextAction: "Correggere e collaudare localmente il contratto del modale prima di autorizzare una nuova generazione singola.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && calculation36TrustedInputRecovery?.draftId) {
          const modalDiagnostic = driverBeforeTick.calculationModalContractDiagnostic as { evidenceId: string };
          const persistedProbe = calculation36TrustedInputRecovery.uncertainPageSave!.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "inconclusive")!;
          const commandId = `service:auto-requeue-calculation-36-trusted-input:${calculation36TrustedInputRecovery.customerKey}:${calculation36TrustedInputRecovery.draftId}:staged-until-outer-save-v11`;
          execution.requeueCalculationAllocationAfterTrustedInputContractUpgrade(calculation36TrustedInputRecovery.customerKey, modalDiagnostic.evidenceId, persistedProbe.evidenceId, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "calculation_36_trusted_input_auto_recovered", reason: `${calculation36TrustedInputRecovery.displayName}: autorizzato un solo recupero transazionale sulla stessa bozza ${calculation36TrustedInputRecovery.draftId}; il modale resta staged fino al Salva Calcolo.`, nextAction: "APR non ricarica dopo il modale: salva Calcolo una volta e verifica entrambi lato server.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: modalDiagnostic.evidenceId });
        }
        if (executionBeforeTick.status === "completed" && recoveryTimeoutVerification) {
          const pageId = recoveryTimeoutVerification.uncertainPageSave!.pageId;
          const timeoutEvidenceId = recoveryTimeoutVerification.serverEvidenceIds.at(-1) ?? `recovery-timeout-${recoveryTimeoutVerification.draftId}`;
          const commandId = `service:verify-recovery-timeout-readonly:${recoveryTimeoutVerification.customerKey}:${recoveryTimeoutVerification.draftId}:${pageId}:${timeoutEvidenceId}:v1`;
          const draftPackage = draftPackageFor(recoveryTimeoutVerification.customerKey) as unknown as AprEneaDraftPackage;
          let probe: AprEneaPageSaveProbeEvidence;
          try {
            const probes = await driver.probePageSaveReadOnly(draftPackage, recoveryTimeoutVerification.draftId!, pageId);
            probe = probes.find((candidate) => candidate.outcome === "saved")
              ?? probes.find((candidate) => candidate.outcome === "not_saved")
              ?? probes.at(-1)!;
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            probe = { method: "persisted_fields_get", outcome: "inconclusive", evidenceId: `recovery-probe-error-${recoveryTimeoutVerification.customerKey}-${pageId}`, observedAt: new Date().toISOString(), reason: `Verifica GET post-recupero non disponibile: ${reason}`, url: config.dashboardUrl };
          }
          execution.recordUncertainPageSaveRecoveryProbe(recoveryTimeoutVerification.customerKey, probe, commandId);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: probe.outcome === "saved" ? "running" : "technical_block", type: "uncertain_page_save_recovery_probed_readonly", reason: `${recoveryTimeoutVerification.displayName}: verifica post-recupero ${probe.outcome}; nessun nuovo Salva.`, nextAction: executionBeforeTick.items.find((item) => item.customerKey === recoveryTimeoutVerification.customerKey)!.nextAction, chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: probe.evidenceId });
        }
        if (!executionBeforeTick.currentCustomerKey && preClickRecoveryRequeue) {
          const evidenceId = preClickRecoveryRequeue.serverEvidenceIds.at(-1) ?? `driver-preclick-${preClickRecoveryRequeue.draftId}`;
          execution.requeueUnclickedUncertainPageSaveRecovery(
            preClickRecoveryRequeue.customerKey,
            evidenceId,
            `service:requeue-unclicked-recovery:${preClickRecoveryRequeue.customerKey}:${preClickRecoveryRequeue.draftId}:${preClickRecoveryRequeue.uncertainPageSave!.pageId}:${evidenceId}:v1`,
          );
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "uncertain_page_save_recovery_requeued_preclick", reason: `${preClickRecoveryRequeue.displayName}: nessun click Salva emesso; la pagina sarà ricompilata prima dell'unico recupero autorizzato.`, nextAction: "Riprendere la stessa bozza e verificare il pulsante prima dell'intento mutativo.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && uncertainPageSaveVerification && !screeningSummaryPersistenceDiagnostic) {
          const page = uncertainPageSaveVerification.uncertainPageSave
            ? uncertainPageSaveVerification.pageCheckpoints.find((checkpoint) => checkpoint.pageId === uncertainPageSaveVerification.uncertainPageSave!.pageId)!
            : uncertainPageSaveVerification.pageCheckpoints.find((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1)!;
          const legacyEvidenceId = uncertainPageSaveVerification.serverEvidenceIds.at(-1) ?? `draft-${uncertainPageSaveVerification.draftId}-legacy-uncertain-page-save`;
          if (!uncertainPageSaveVerification.uncertainPageSave) {
            execution.migrateLegacyUncertainPageSave(
              uncertainPageSaveVerification.customerKey,
              page.pageId,
              legacyEvidenceId,
              `service:migrate-legacy-uncertain-page-save:${uncertainPageSaveVerification.customerKey}:${uncertainPageSaveVerification.draftId}:${page.pageId}:v1`,
            );
            executionBeforeTick = execution.snapshot();
          }
          let migrated = executionBeforeTick.items.find((item) => item.customerKey === uncertainPageSaveVerification.customerKey)!;
          const draftPackage = draftPackageFor(migrated.customerKey) as unknown as AprEneaDraftPackage;
          const driverState = driver.snapshot();
          const infissiClassifierDiagnostic = driverState.pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string; rowCount?: number } | null;
          if (draftPackage.module === "infissi"
            && page.pageId.startsWith("screening:")
            && migrated.uncertainPageSave?.status === "operator_required"
            && migrated.uncertainPageSave.probes.some((probe) => probe.method === "persisted_fields_get" && /^0\/\d+ campi coincidono: prova non conclusiva\.$/.test(probe.reason))
            && infissiClassifierDiagnostic?.kind === "infissi-row-post-save-readonly-v1"
            && infissiClassifierDiagnostic.customerKey === migrated.customerKey
            && infissiClassifierDiagnostic.draftId === migrated.draftId
            && infissiClassifierDiagnostic.pageId === page.pageId
            && infissiClassifierDiagnostic.rowCount === Number(page.pageId.slice("screening:".length)) - 1
            && infissiClassifierDiagnostic.evidenceId) {
            execution.requeueUncertainInfissiRowProbesAfterClassifierCorrection(
              migrated.customerKey,
              infissiClassifierDiagnostic.evidenceId,
              `service:requeue-infissi-row-probes-after-classifier:${migrated.customerKey}:${migrated.draftId}:${page.pageId}:${infissiClassifierDiagnostic.evidenceId}:v1`,
            );
            executionBeforeTick = execution.snapshot();
            migrated = executionBeforeTick.items.find((item) => item.customerKey === uncertainPageSaveVerification.customerKey)!;
          }
          const exactMapping = driverState.mappings.find((mapping) => mapping.packageFingerprint === draftPackage.packageFingerprint && mapping.draftId === migrated.draftId);
          const legacyMapping = driverState.mappings.find((mapping) => mapping.customerKey === migrated.customerKey && mapping.draftId === migrated.draftId);
          if (!exactMapping && legacyMapping) {
            const mappingEvidence = await driver.rebindLegacyMappingReadOnly(draftPackage, migrated.draftId!);
            if (migrated.uncertainPageSave?.status === "operator_required" && migrated.uncertainPageSave.probes.every((probe) => /apr_cdp_enea_mapping_missing/.test(probe.reason))) {
              execution.requeueLegacyUncertainPageSaveProbesAfterMappingRepair(
                migrated.customerKey,
                mappingEvidence.evidenceId,
                `service:requeue-legacy-uncertain-probes-after-mapping-repair:${migrated.customerKey}:${migrated.draftId}:${page.pageId}:${mappingEvidence.evidenceId}:v1`,
              );
              executionBeforeTick = execution.snapshot();
              migrated = executionBeforeTick.items.find((item) => item.customerKey === uncertainPageSaveVerification.customerKey)!;
            }
            service.record({ instanceId, processPid: process.pid, status: "running", type: "legacy_draft_mapping_rebound_readonly", reason: `${migrated.displayName}: associazione locale ripristinata sulla stessa bozza ${migrated.draftId} tramite GET; nessuna creazione o Salva.`, nextAction: "Eseguire le sole sonde read-only sul salvataggio già emesso.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: mappingEvidence.evidenceId });
          }
          const serverNotSavedProof = migrated.uncertainPageSave?.status === "operator_required"
            ? migrated.uncertainPageSave.probes.find((probe) => probe.method === "persisted_fields_get"
              && probe.outcome === "not_saved"
              && typeof probe.url === "string"
              && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
              && probe.url.split(/[?#]/, 1)[0].endsWith(`/${migrated.draftId}`))
            : null;
          if (serverNotSavedProof) {
            execution.authorizeUncertainPageSaveRecoveryFromServerProof(
              migrated.customerKey,
              `service:auto-authorize-conclusive-not-saved-recovery:${migrated.customerKey}:${migrated.draftId}:${page.pageId}:${serverNotSavedProof.evidenceId}:v1`,
            );
            executionBeforeTick = execution.snapshot();
            migrated = executionBeforeTick.items.find((item) => item.customerKey === uncertainPageSaveVerification.customerKey)!;
            service.record({ instanceId, processPid: process.pid, status: "running", type: "uncertain_page_save_recovery_auto_authorized", reason: `${migrated.displayName}: GET canonica della stessa bozza dimostra pagina non persistita; autorizzato un solo recupero.`, nextAction: "Riprendere la stessa bozza senza crearne una nuova ed eseguire un solo Salva di recupero.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: serverNotSavedProof.evidenceId });
          }
          if (migrated.uncertainPageSave?.status === "probing") {
            const transientPersistedProbe = migrated.uncertainPageSave.probes.find((probe) => probe.method === "persisted_fields_get"
              && probe.outcome === "inconclusive"
              && /apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000)/.test(probe.reason));
            const transientPersistedProbeRetryAvailable = (migrated.uncertainPageSave.transientProbeRetryCounts?.persisted_fields_get ?? 0) === 0;
            if (page.pageId.startsWith("screening:") && nestedUncertainPageSaveProbeAllowed(draftPackage.module, page.pageId) && transientPersistedProbe && transientPersistedProbeRetryAvailable) {
              execution.requeueTransientUncertainPageSaveProbe(
                migrated.customerKey,
                "persisted_fields_get",
                `service:requeue-transient-nested-row-probe:${migrated.customerKey}:${migrated.draftId}:${page.pageId}:persisted_fields_get:v2`,
              );
              executionBeforeTick = execution.snapshot();
              migrated = executionBeforeTick.items.find((item) => item.customerKey === uncertainPageSaveVerification.customerKey)!;
            }
            const missingMethods = (["server_redirect", "persisted_fields_get", "server_metadata_get"] as const).filter((method) => !migrated.uncertainPageSave!.probes.some((probe) => probe.method === method));
            let probes: AprEneaPageSaveProbeEvidence[];
            try {
              probes = await driver.probePageSaveReadOnly(draftPackage, migrated.draftId!, page.pageId);
            } catch (error) {
              const probeReason = error instanceof Error ? error.message : String(error);
              probes = missingMethods.map((method) => ({
                method,
                outcome: "inconclusive",
                reason: `La sonda legacy read-only non ha risposto: ${probeReason}`,
                evidenceId: `legacy-probe-error-${method}-${page.pageId}`,
                observedAt: new Date().toISOString(),
                url: config.dashboardUrl,
              }));
            }
            for (const probe of probes.filter((candidate) => missingMethods.includes(candidate.method))) {
              const currentResolution = execution.snapshot().items.find((item) => item.customerKey === migrated.customerKey)?.uncertainPageSave;
              if (currentResolution?.status !== "probing" || currentResolution.probes.some((candidate) => candidate.method === probe.method)) break;
              execution.recordUncertainPageSaveProbe(
                migrated.customerKey,
                probe,
                `service:legacy-uncertain-page-save-probe:${migrated.customerKey}:${migrated.draftId}:${page.pageId}:${probe.method}:${probe.evidenceId}`,
              );
            }
            executionBeforeTick = execution.snapshot();
            const resolution = executionBeforeTick.items.find((item) => item.customerKey === migrated.customerKey)!.uncertainPageSave!;
            service.record({
              instanceId,
              processPid: process.pid,
              status: resolution.status === "resolved_saved" ? "running" : "technical_block",
              type: "legacy_uncertain_page_save_probed_readonly",
              reason: `${migrated.displayName}: checkpoint legacy migrato e verificato con ${resolution.probes.length} prove read-only; esito ${resolution.status}.`,
              nextAction: resolution.nextAction,
              chromePid,
              profileFingerprint: browser.profileFingerprint,
              sessionEvidenceId: resolution.probes.at(-1)?.evidenceId ?? legacyEvidenceId,
            });
          }
        }
        if (executionBeforeTick.status === "completed" && pageOrderRecovery) {
          const evidenceId = pageOrderRecovery.serverEvidenceIds.at(-1) ?? `draft-${pageOrderRecovery.draftId}-page-order-diagnostic`;
          execution.resumeCreatedDraftAfterPageOrderCorrection(pageOrderRecovery.customerKey, evidenceId, `service:auto-resume-created-page-order:${pageOrderRecovery.customerKey}:${pageOrderRecovery.draftId}:direct-route-hydration-v31`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "created_draft_page_order_auto_resumed", reason: `${pageOrderRecovery.displayName} ripresa sulla stessa bozza dopo riallineamento dell'ordine pagine.`, nextAction: "APR compila dalla pagina Beneficiario; nessuna nuova bozza viene creata.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        if (executionBeforeTick.status === "completed" && packageValidationRecovery) {
          const rebuiltPackage = draftPackageFor(packageValidationRecovery.customerKey);
          const evidenceId = `local-preflight-${rebuiltPackage.packageFingerprint}`;
          execution.requeueUnmaterializedCreateIntents([packageValidationRecovery.customerKey], evidenceId, `service:auto-recover-package-validation:${packageValidationRecovery.customerKey}:${rebuiltPackage.packageFingerprint}:v1`);
          executionBeforeTick = execution.snapshot();
          service.record({ instanceId, processPid: process.pid, status: "running", type: "validated_package_auto_requeued", reason: `${packageValidationRecovery.displayName} riaccodata dopo ricostruzione locale coerente del pacchetto; nessuna chiamata di creazione era stata emessa.`, nextAction: "APR crea una sola bozza dal pacchetto rivalidato e prosegue dai checkpoint.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidenceId });
        }
        const finalIntegrityServiceState = service.loadState();
        const savedDraftIntegrityCertification = executionBeforeTick.items.find((item) => item.state === "saved"
          && Boolean(item.draftId)
          && item.completedPageIds.length === item.expectedPageIds.length
          && !driver.snapshot().events.some((event) => event.action === "verify_complete_draft_readonly" && event.customerKey === item.customerKey && event.draftId === item.draftId)
          && !finalIntegrityServiceState.audit.some((event) => event.type === "final_draft_integrity_post_checkpoint_rejected_v6" && event.reason.includes(`bozza ${item.draftId}`)));
        if (executionBeforeTick.status === "completed" && savedDraftIntegrityCertification?.draftId) {
          const draftPackage = draftPackageFor(savedDraftIntegrityCertification.customerKey) as unknown as AprEneaDraftPackage;
          const evidence = await driver.verifyDraftSaved(draftPackage, savedDraftIntegrityCertification.draftId);
          if (evidence) {
            service.record({ instanceId, processPid: process.pid, status: "completed", type: "final_draft_integrity_verified_readonly", reason: `${savedDraftIntegrityCertification.displayName}: bozza ${savedDraftIntegrityCertification.draftId} certificata con catena server, cardinalità delle schermature e costo finale riletti in sola lettura.`, nextAction: "Fermarsi alla bozza salvata; anteprima, submit e comunicazioni restano vietati.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: evidence.evidenceId });
          } else {
            service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "final_draft_integrity_post_checkpoint_rejected_v6", reason: `${savedDraftIntegrityCertification.displayName}: bozza ${savedDraftIntegrityCertification.draftId} non certificata dal controllo finale di cardinalità e costo; nessuna azione mutativa ripetuta.`, nextAction: "Correggere il solo controllo read-only prima di dichiarare il test concluso.", chromePid, profileFingerprint: browser.profileFingerprint });
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            continue;
          }
        }
        const lastKeepaliveEvent = driver.snapshot().events.filter((event) => event.action === "verify_session_dom_server_get").at(-1) ?? null;
        const lastKeepaliveAt = lastKeepaliveEvent?.at ?? null;
        let serviceBeforeKeepalive = service.loadState();
        const lastKeepaliveAudit = serviceBeforeKeepalive.audit.filter((event) => ["keepalive_ok", "keepalive_login_required", "keepalive_inconclusive"].includes(event.type)).at(-1) ?? null;
        if (!serviceBeforeKeepalive.sessionEvidenceId && lastKeepaliveAudit?.type === "keepalive_ok" && lastKeepaliveEvent) {
          service.record({ instanceId, processPid: process.pid, status: serviceBeforeKeepalive.status, type: "keepalive_evidence_recovered", reason: "Prova keepalive autenticata recuperata dal journal CDP dopo il riavvio, senza emettere una nuova richiesta.", nextAction: serviceBeforeKeepalive.nextAction, chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: lastKeepaliveEvent.evidenceId, workerRevision: serviceBeforeKeepalive.workerRevision });
          serviceBeforeKeepalive = service.loadState();
        }
        const pendingInconclusiveKeepalive = lastKeepaliveAudit?.type === "keepalive_inconclusive";
        const effectiveServiceStatus = pendingInconclusiveKeepalive ? "technical_block" : serviceBeforeKeepalive.status;
        const lastServiceAuditType = pendingInconclusiveKeepalive ? "keepalive_inconclusive" : serviceBeforeKeepalive.audit.at(-1)?.type ?? null;
        const effectiveKeepaliveIntervalMs = aprEneaKeepaliveInterval({ configuredIntervalMs: config.keepaliveIntervalMs, serviceStatus: effectiveServiceStatus, lastAuditType: lastServiceAuditType });
        const keepaliveDue = isAprEneaKeepaliveDue({ lastKeepaliveAt, keepaliveIntervalMs: effectiveKeepaliveIntervalMs });
        if (shouldHoldAprEneaKeepaliveState({ keepaliveDue, serviceStatus: effectiveServiceStatus, lastAuditType: lastServiceAuditType })) {
          const heartbeatType = effectiveServiceStatus === "login_required" ? "login_required_heartbeat" : "keepalive_inconclusive";
          service.record({ instanceId, processPid: process.pid, status: effectiveServiceStatus, type: heartbeatType, reason: pendingInconclusiveKeepalive ? lastKeepaliveAudit!.reason : serviceBeforeKeepalive.reason, nextAction: pendingInconclusiveKeepalive ? "APR ripeterà soltanto la verifica read-only alla scadenza; nessuna pratica e nessuna azione mutativa." : serviceBeforeKeepalive.nextAction, chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: serviceBeforeKeepalive.sessionEvidenceId });
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          continue;
        }
        if (keepaliveDue) {
          const keepalive = await driver.verifySession();
          if (!keepalive.authenticated) {
            if (keepalive.serverLogoutProven) {
              if (executionBeforeTick.sourceFingerprint) execution.recordLoginRequired("Logout ENEA provato dal keepalive permanente del worker APR.", keepalive.evidenceId, `service:keepalive-login-required:${keepalive.evidenceId}`);
              service.record({ instanceId, processPid: process.pid, status: "login_required", type: "keepalive_login_required", reason: "Logout ENEA provato dal keepalive APR; coda globale sospesa.", nextAction: "Completare nuovamente il login nel profilo APR; nessun ticket pratica e nessun retry mutativo.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: keepalive.evidenceId });
            } else {
              service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "keepalive_inconclusive", reason: "Il keepalive GET non ha dimostrato né sessione autenticata né logout server; stato precedente preservato senza classificazione login_required.", nextAction: "APR ripeterà soltanto la verifica read-only alla scadenza; nessuna pratica e nessuna azione mutativa.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: keepalive.evidenceId });
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs)); continue;
          }
          if (executionBeforeTick.sourceFingerprint) execution.recordSessionReady(keepalive.evidenceId, `service:keepalive-session-ready:${keepalive.evidenceId}`);
          const keepaliveStatus = executionBeforeTick.status === "completed" ? "completed" : executionBeforeTick.status === "blocked_preflight" ? "idle" : "running";
          service.record({ instanceId, processPid: process.pid, status: keepaliveStatus, type: "keepalive_ok", reason: keepaliveStatus === "idle" ? "IDLE — coda vuota; sessione ENEA mantenuta dal keepalive GET innocuo." : "Sessione ENEA mantenuta attiva dal keepalive GET innocuo del worker APR.", nextAction: executionBeforeTick.status === "completed" ? "Mantenere la sessione pronta H24; attendere una nuova coda." : executionBeforeTick.status === "blocked_preflight" ? "Attendere una nuova coda APR persistente." : "Proseguire dal checkpoint corrente.", chromePid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: keepalive.evidenceId, workerRevision: service.loadState().workerRevision });
        }
        const worker = new PersistentAprEneaBrowserWorker(rootDirectory, execution, (customerKey) => draftPackageFor(customerKey) as unknown as AprEneaDraftPackage, driver, { instanceId, processPid: process.pid });
        const state = await worker.tick();
        const executionAfterTick = execution.snapshot();
        service.record({ instanceId, processPid: process.pid, status: state.status === "completed" ? "completed" : state.status === "login_required" ? "login_required" : state.status === "idle" ? "idle" : state.status === "technical_block" ? "technical_block" : "running", type: "worker_tick", reason: state.reason, nextAction: state.nextAction, chromePid, profileFingerprint: browser.profileFingerprint, ...(executionAfterTick.sessionEvidenceId ? { sessionEvidenceId: executionAfterTick.sessionEvidenceId } : {}), workerRevision: state.revision });
      }
    } catch (error) {
      process.stderr.write(`[apr-worker-error] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      service.record({ instanceId, processPid: process.pid, status: "technical_block", type: "technical_block", reason: error instanceof Error ? error.message : String(error), nextAction: "Il servizio ritenterà soltanto operazioni idempotenti; nessun submit o retry mutativo alla cieca." });
    } finally {
      service.recordCdpConnections(activeRuntime.connectionStats());
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  runtime?.closeAllPageClients();
  if (runtime) service.recordCdpConnections(runtime.connectionStats());
  service.record({ instanceId, processPid: process.pid, status: "stopped", type: "stopped", reason: "Worker APR arrestato con segnale di sistema.", nextAction: "Il LaunchAgent lo riavvierà mantenendo checkpoint e profilo." });
}

if (mode === "status") print(service.snapshot());
else if (mode === "configure") {
  const remoteDebuggingPort = option("--remote-debugging-port");
  print(service.configure({
    setupEnabled: option("--setup-enabled") === "true",
    operationalEnabled: option("--operational-enabled") === "true",
    ...(option("--profile-directory") ? { profileDirectory: path.resolve(option("--profile-directory")!) } : {}),
    ...(remoteDebuggingPort ? { remoteDebuggingPort: Number(remoteDebuggingPort) } : {}),
  }));
}
else if (mode === "bridge-status") print(new PersistentAprEneaOperationalBridge(rootDirectory).snapshot());
else if (mode === "bridge-arm") {
  const customerKey = option("--customer-key") ?? "";
  const mappingPath = path.resolve(option("--mapping-artifact") ?? "");
  const authorizationId = option("--authorization-id") ?? "";
  if (!customerKey.trim() || !mappingPath || !authorizationId.trim()) throw new Error("apr_enea_bridge_arm_options_required");
  const mappingArtifact = JSON.parse(readFileSync(mappingPath, "utf8")) as AprEneaMappingArtifact;
  print(new PersistentAprEneaOperationalBridge(rootDirectory).arm({ legacyPackage: loadLegacyDraftPackage(customerKey), mappingArtifact, authorizationId }));
}
else if (mode === "requeue-deleted-draft") {
  const customerKey = option("--customer-key") ?? "";
  const draftId = option("--draft-id") ?? "";
  const operatorEvidenceId = option("--operator-evidence-id") ?? "";
  const commandId = option("--command-id") ?? `worker:requeue-deleted-draft:${customerKey}:${draftId}:v1`;
  if (!customerKey.trim() || !/^\d{4,}$/.test(draftId) || !operatorEvidenceId.trim()) throw new Error("apr_enea_deleted_draft_requeue_options_required");
  const config = service.loadConfig();
  const runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
  const browser = await runtime.ensureRunning();
  const driver = new CdpEneaBrowserDriver(rootDirectory, runtime, { allowedOrigin: config.allowedOrigin, dashboardUrl: config.dashboardUrl });
  const proof = await driver.verifyDraftIdsAbsentReadOnly([draftId]);
  if (!proof.allAbsent) throw new Error(`apr_enea_deleted_draft_still_present:${draftId}`);
  const retiredMapping = driver.retireDeletedDraftMappingAfterVerifiedAbsence(customerKey, draftId, proof);
  const execution = new PersistentAprEneaDraftExecution(rootDirectory);
  const state = execution.requeueAfterVerifiedDraftDeletion(customerKey, draftId, proof.evidenceId, operatorEvidenceId, commandId);
  service.record({ instanceId, processPid: process.pid, status: "running", type: "verified_deleted_draft_requeued", reason: `${customerKey}: bozza TEST ${draftId} verificata assente, associazione locale ritirata e caso riaccodato con audit.`, nextAction: "Il LaunchAgent riprenderà dal nuovo intento persistente senza duplicare il vecchio ID.", chromePid: browser.pid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: proof.evidenceId });
  print({ proof, retiredMapping, execution: state });
}
else if (mode === "recover-pending-create") {
  const customerKey = option("--customer-key") ?? "";
  const commandId = option("--command-id") ?? `worker:recover-pending-create:${customerKey}:v1`;
  if (!customerKey.trim()) throw new Error("apr_enea_pending_create_recovery_customer_required");
  const config = service.loadConfig();
  const runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
  const browser = await runtime.ensureRunning();
  const driver = new CdpEneaBrowserDriver(rootDirectory, runtime, { allowedOrigin: config.allowedOrigin, dashboardUrl: config.dashboardUrl });
  const pending = driver.snapshot().pendingCreate;
  if (!pending || pending.customerKey !== customerKey || pending.wizardSubmitAttemptCount !== 0) throw new Error("apr_enea_pending_create_recovery_checkpoint_invalid");
  const execution = new PersistentAprEneaDraftExecution(rootDirectory);
  const item = execution.snapshot().items.find((candidate) => candidate.customerKey === customerKey);
  if (!item || item.state !== "operator_intervention" || item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0
    || !/apr_cdp_enea_(create_result_not_identifiable|creation_wizard_contract_invalid|other_create_intent_pending)/.test(item.reason)) throw new Error("apr_enea_pending_create_recovery_case_invalid");
  const surface = await driver.inspectPendingCreationSurfaceReadOnly();
  const contractReady = Boolean(surface
    && surface.customerKey === customerKey
    && new URL(surface.url).pathname === "/pratica/ecobonus/2026/nuova"
    && surface.controls.some((control) => control.id === "id-role-intermediario" && control.type === "button" && control.label === "Intermediario")
    && surface.controls.some((control) => control.id === "id-tipo-pf" && control.type === "button")
    && surface.actions.some((action) => action.type === "submit" && action.label === "Crea scheda descrittiva"));
  if (!surface || !contractReady) throw new Error("apr_enea_pending_create_recovery_contract_invalid");
  const state = execution.requeueUnmaterializedCreateIntents([customerKey], surface.evidenceId, commandId);
  service.record({ instanceId, processPid: process.pid, status: "running", type: "pending_create_wizard_recovered", reason: `${item.displayName}: wizard persistente riagganciato in sola lettura e intento riaccodato senza azzerare il contatore.`, nextAction: "Il LaunchAgent riprende lo stesso intento e puo eseguire l'unico submit di creazione ancora disponibile.", chromePid: browser.pid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: surface.evidenceId });
  print({ surface, execution: state });
}
else if (mode === "resume-infissi-contract-discovery") {
  const customerKey = option("--customer-key") ?? "";
  const commandId = option("--command-id") ?? `worker:resume-infissi-contract-discovery:${customerKey}:v2`;
  if (!customerKey.trim()) throw new Error("apr_enea_infissi_contract_recovery_customer_required");
  const driver = new CdpEneaBrowserDriver(rootDirectory, new PersistentAprChromeRuntime({
    chromeExecutable: service.loadConfig().chromeExecutable,
    profileDirectory: service.loadConfig().profileDirectory,
    remoteDebuggingPort: service.loadConfig().remoteDebuggingPort,
    headless: false,
    initialUrl: service.loadConfig().dashboardUrl,
  }), { allowedOrigin: service.loadConfig().allowedOrigin, dashboardUrl: service.loadConfig().dashboardUrl });
  const diagnostic = driver.snapshot().pagePreparationDiagnostic as { kind?: string; customerKey?: string; draftId?: string; pageId?: string; evidenceId?: string } | null;
  if (!diagnostic
    || !["infissi-technical-contract-discovery-v1", "infissi-technical-contract-discovery-v2"].includes(diagnostic.kind ?? "")
    || diagnostic.customerKey !== customerKey
    || diagnostic.pageId !== "page:Serramenti e infissi"
    || !diagnostic.evidenceId) throw new Error("apr_enea_infissi_contract_recovery_diagnostic_invalid");
  const execution = new PersistentAprEneaDraftExecution(rootDirectory);
  const infissiPreflight = new PersistentAprInfissiBatchPreflight(rootDirectory);
  const draftPackage = infissiPreflight.buildDraftExecutionPackage(customerKey);
  await driver.rebindLegacyMappingReadOnly(draftPackage, diagnostic.draftId!);
  const state = execution.resumeCreatedDraftAfterInfissiContractDiscovery(customerKey, diagnostic.evidenceId, commandId, new Date(), draftPackage);
  service.record({ instanceId, processPid: process.pid, status: "running", type: "infissi_contract_discovery_requeued", reason: `${customerKey}: stessa bozza riattivata dalla sola pagina tecnica dopo discovery read-only.`, nextAction: "APR acquisisce il contratto completo del modale senza salvare." });
  print({ diagnostic, execution: state });
}
else if (mode === "inspect-standard-save-control") {
  const customerKey = option("--customer-key") ?? "";
  const draftId = option("--draft-id") ?? "";
  const pageId = option("--page-id") ?? "";
  if (!customerKey.trim() || !/^\d{4,}$/.test(draftId) || !pageId.trim()) throw new Error("apr_enea_standard_save_diagnostic_options_required");
  const execution = new PersistentAprEneaDraftExecution(rootDirectory).snapshot();
  const item = execution.items.find((candidate) => candidate.customerKey === customerKey);
  const page = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
  if (!item || item.draftId !== draftId || item.uncertainPageSave?.status !== "recovery_authorized" || page?.state !== "save_intent_recorded" || page.recoverySaveAttemptCount !== 1) throw new Error("apr_enea_standard_save_diagnostic_checkpoint_invalid");
  const config = service.loadConfig();
  const runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
  const browser = await runtime.ensureRunning();
  const driver = new CdpEneaBrowserDriver(rootDirectory, runtime, { allowedOrigin: config.allowedOrigin, dashboardUrl: config.dashboardUrl });
  const diagnostic = await driver.inspectPreparedStandardPageSaveControlReadOnly(loadDraftPackage(customerKey), draftId, pageId);
  service.record({ instanceId, processPid: process.pid, status: "running", type: "standard_save_control_inspected_readonly", reason: `${customerKey}: controllo Salva ispezionato senza clic né navigazione.`, nextAction: "Correggere il driver prima di consumare l'unico Salva di recupero autorizzato.", chromePid: browser.pid, profileFingerprint: browser.profileFingerprint, sessionEvidenceId: diagnostic.evidenceId });
  print({ diagnostic });
}
else if (mode === "serve") await serve();
else throw new Error("Comando worker non valido: status, configure, bridge-status, bridge-arm, requeue-deleted-draft, recover-pending-create, resume-infissi-contract-discovery, inspect-standard-save-control, serve.");
