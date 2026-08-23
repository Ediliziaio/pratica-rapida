import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { LocalDashboardSupervisor, prepareEneaDraftExecutionIfAbsent, shouldRunShadowIntake } from "./localDashboardServer";
import { PersistentEneaRunner } from "./runner";
import { SupervisorBusyError } from "./supervisorRuntime";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { VERIFIED_LOCAL_READ_ONLY_FIXTURE } from "./fixtures/readOnlyAdapterFixture";
import { PersistentExecutionPlanStore } from "./executionPlan";
import { PersistentAprCrmReadOnlyAdapter } from "./crmReadOnlyAdapter";
import { VERIFIED_APR_CRM_READONLY_FIXTURE } from "./fixtures/aprCrmReadOnlyFixture";
import { APR_CRM_SUPABASE_ORIGIN, PersistentAprCrmAuth, type AprSecretStore } from "./crmAuth";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_READY_PIPELINE } from "../../src/features/enea-shadow-crm/aprCrmIntegrationContract";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { APR_REQUIRED_INFISSI_VALIDATION_REVISIONS } from "./infissiExecutionGate";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { compareAprParallelCaseTruth, PersistentAprCaseTruthComparisonStore } from "./aprCaseTruthComparisonStore";
import type { AprCollectedCaseObservations } from "./aprCaseObservationCollector";
import type { AprCaseStatusObservation } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

const temporaryDirectories: string[] = [];
const runningSupervisors: LocalDashboardSupervisor[] = [];

function temporaryStateDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-dashboard-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const supervisor of runningSupervisors.splice(0)) {
    if (supervisor.url) await supervisor.stop("Pulizia test.");
  }
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("dashboard HTTP e supervisore persistente", () => {
  it("non interroga Pronte da fare prima del via e consente l'ingresso installato dopo il comando esplicito", () => {
    const liveDirectory = temporaryStateDirectory();
    expect(shouldRunShadowIntake(liveDirectory, false)).toBe(false);
    expect(shouldRunShadowIntake(liveDirectory, true)).toBe(true);
    const historicalDirectory = temporaryStateDirectory();
    mkdirSync(path.join(historicalDirectory, "cohort-seed"));
    writeFileSync(path.join(historicalDirectory, "cohort-seed", "checkpoint.json"), "{}\n");
    expect(shouldRunShadowIntake(historicalDirectory, false)).toBe(false);
    expect(shouldRunShadowIntake(historicalDirectory, true)).toBe(true);
  });
  it("preserva un checkpoint ENEA immutabile quando il preflight read-only viene revisionato", () => {
    const directory = temporaryStateDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    const originalPreflight = {
      status: "completed",
      sourceFingerprint: "preflight-before-validation-revision",
      items: ["first", "second"].map((customerKey) => ({
        customerKey,
        displayName: customerKey,
        practiceId: `crm-${customerKey}`,
        state: "ready_local_plan",
        report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `mapping-${customerKey}`, requiredPortalFieldCount: 1, portalGate: { status: "ready", workflowFingerprint: `workflow-${customerKey}`, supportedPages: ["Beneficiario"], screeningItemCount: 0 } } },
      })),
    } as never;
    const prepared = execution.prepare(originalPreflight, new Date("2026-08-16T12:00:00.000Z"));
    const revisedPreflight = structuredClone(originalPreflight) as never;
    (revisedPreflight as { sourceFingerprint: string }).sourceFingerprint = "preflight-after-validation-revision";

    const resumed = prepareEneaDraftExecutionIfAbsent(execution, revisedPreflight, new Date("2026-08-16T12:05:00.000Z"));

    expect(resumed.sourceFingerprint).toBe(prepared.sourceFingerprint);
    expect(resumed.revision).toBe(prepared.revision);
    expect(resumed.items).toEqual(prepared.items);
    expect(resumed.audit).toEqual(prepared.audit);
  });

  it("non accoda pacchetti Infissi intermedi e li aggiunge soltanto dopo tutte le revisioni obbligatorie", () => {
    const directory = temporaryStateDirectory();
    const execution = new PersistentAprEneaDraftExecution(directory);
    const common = {
      status: "completed", sourceFingerprint: "common-mixed-source", validationRevisionsApplied: ["common-final"],
      items: ["screening-a", "screening-b"].map((customerKey) => ({ customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, state: "ready_local_plan", report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `map-${customerKey}`, requiredPortalFieldCount: 1, portalGate: { status: "ready", workflowFingerprint: `flow-${customerKey}`, supportedPages: ["Beneficiario"], screeningItemCount: 1 } } } })),
    } as never;
    const draftPackage: AprEneaDraftPackage = {
      module: "infissi", customerKey: "infissi-a", displayName: "Infissi A", practiceId: "crm-infissi-a", packageFingerprint: "package-infissi-a", workflowFingerprint: "workflow-infissi-a",
      workflow: { supportedPages: ["Serramenti e infissi"], screeningItemCount: 1, steps: [], screeningSteps: [] },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
    let revisions: string[] = [];
    const infissi = {
      snapshot: () => ({ status: "completed", sourceFingerprint: "infissi-source", validationRevisionsApplied: revisions, items: [{ customerKey: "infissi-a", state: "ready_local_plan", report: { eneaDraftPayload: {}, blockers: [] } }] }),
      buildDraftExecutionPackage: () => draftPackage,
    } as never;

    const intermediate = prepareEneaDraftExecutionIfAbsent(execution, common, new Date("2026-08-23T00:00:00Z"), infissi);
    expect(intermediate.items.map((item) => item.customerKey)).toEqual(["screening-a", "screening-b"]);

    revisions = [...APR_REQUIRED_INFISSI_VALIDATION_REVISIONS];
    const final = prepareEneaDraftExecutionIfAbsent(execution, common, new Date("2026-08-23T00:01:00Z"), infissi);
    expect(final.items.map((item) => item.customerKey)).toEqual(["screening-a", "screening-b", "infissi-a"]);
  });

  it("accetta login CRM soltanto dalla form locale con origin e CSRF validi senza esporre segreti", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const secretStore: AprSecretStore & { value: string | null } = {
      value: null,
      async get() { return this.value; },
      async set(value: string) { this.value = value; },
      async delete() { this.value = null; },
    };
    const key = [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from('{"role":"anon","ref":"xmkjrhwmmuzaqjqlvzxm"}').toString("base64url"), "fixture"].join(".");
    const auth = new PersistentAprCrmAuth(directory, secretStore, async () => new Response(JSON.stringify({ access_token: "access-private", refresh_token: "refresh-private", expires_at: 1_787_000_000, user: { email: "apr@example.test" } }), { status: 200 }));
    auth.configure(APR_CRM_SUPABASE_ORIGIN, key);
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000, crmAuth: auth });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();

    const page = await (await fetch(`${url}/auth/crm`)).text();
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();
    const formBody = `csrf=${encodeURIComponent(csrf!)}&email=apr%40example.test&password=private-password`;
    const rejected = await fetch(`${url}/auth/crm/session`, { method: "POST", headers: { Origin: "http://attacker.invalid", "Content-Type": "application/x-www-form-urlencoded" }, body: formBody });
    expect(rejected.status).toBe(403);

    const accepted = await fetch(`${url}/auth/crm/session`, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/x-www-form-urlencoded" }, body: formBody });
    const acceptedHtml = await accepted.text();
    expect(accepted.status).toBe(200);
    expect(acceptedHtml).toContain("Accesso verificato dal server");
    expect(acceptedHtml).not.toContain("private-password");
    expect(acceptedHtml).not.toContain("access-private");
    expect(acceptedHtml).not.toContain("refresh-private");
    const status = await (await fetch(`${url}/api/crm-auth`)).json() as Record<string, unknown>;
    expect(status).toMatchObject({ status: "authenticated", credentialsStoredInCheckpoint: false, accessTokenExposed: false, externalActionAllowed: false });
    expect(JSON.stringify(status)).not.toContain("refresh-private");
  });

  it("espone pagina e API read-only visibili su loopback senza mutare il journal", async () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    const before = runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T13:00:00.000Z"));
    const crmAdapterStore = new PersistentAprCrmReadOnlyAdapter(directory);
    crmAdapterStore.configureFromFile(path.resolve("config/apr/crm-readonly-adapter.json"));
    crmAdapterStore.verifyFixture(VERIFIED_APR_CRM_READONLY_FIXTURE);
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const statusResponse = await fetch(`${url}/api/status`);
    const status = await statusResponse.json() as { runner: { health: string; revision: number }; supervisor: { url: string; status: string }; readiness: { queueMayRun: boolean; leaseState: string }; adapter: { status: string; queueMayRun: boolean } };
    expect(statusResponse.status).toBe(200);
    expect(status).toMatchObject({ runner: { health: "runner_off", revision: before.revision }, supervisor: { url, status: "running" }, readiness: { queueMayRun: false, leaseState: "not_acquired" }, adapter: { status: "disconnected", queueMayRun: false } });

    new PersistentReadOnlyAdapter(directory).runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "dashboard:fixture", new Date("2026-08-14T13:00:01.000Z"));
    const adapterResponse = await fetch(`${url}/api/adapter`);
    const adapter = await adapterResponse.json() as { status: string; evidenceCount: number; keepaliveCount: number; queueMayRun: boolean };
    expect(adapter).toMatchObject({ status: "fixture_verified", evidenceCount: 5, keepaliveCount: 1, queueMayRun: false });

    const pageResponse = await fetch(url);
    const html = await pageResponse.text();
    expect(pageResponse.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain("Automazione PraticaRapida");
    expect(html).toContain("Centro di controllo APR");
    expect(html).toContain("APR NON AVVIATO");
    expect(html).toContain("Avvia APR");
    expect(html).toContain("Lavorate fino alla fine");
    expect(html).toContain("Pratiche bloccate");
    expect(html).toContain("Confronto APR ↔ operatore CRM");
    expect(html).toContain("SHADOW — produzione umana e risultato APR separati");
    expect(html).toContain("MATTEO = produzione reale · APR = produzione shadow");
    expect(html).toContain("APR · primo modulo ENEA");
    expect(html).toContain("capability ENEA autorizzata può soltanto creare, compilare e salvare una bozza TEST");
    expect(html).toContain("Esecutore ENEA TEST · capability limitata create/fill/save");
    expect(html).toContain("Runner spento");
    expect(html).toContain("Prossima azione");
    expect(html).toContain("Ultimi eventi e regole applicate");
    expect(html).toContain("Readiness/lease: not_acquired");
    expect(html).toContain("coda abilitata");
    expect(html).toContain("Adattatore read-only: fixture_verified");
    expect(html).toContain("prove con fingerprint");
    const matrix = await (await fetch(`${url}/api/rule-matrix`)).json() as { activeCount: number; totalCount: number };
    expect(matrix).toEqual(expect.objectContaining({ activeCount: 0, totalCount: APR_RULE_TEST_MATRIX.length }));
    expect(html).toContain(`Matrice regole → test → runtime · 0/${APR_RULE_TEST_MATRIX.length} attive/testate/installate`);
    expect(html).toContain("Adapter CRM read-only");
    expect(html).toContain("Ciclo CRM APR persistente");
    expect(html).toContain("Ingresso CRM reale · GET autenticato soltanto");
    expect(html).toContain("APR CRM live · dossier, fonti e preflight locale");
    expect(html).toContain("APR · pacchetti bozza verificati esclusivamente in locale");
    expect(html).toContain("APR · coda handoff esecutore separata e fail-closed");
    expect(html).toContain("APR · intake locale dell'esecutore persistente");
    expect(html).toContain("APR · piano cohort-specific create/fill/save · solo simulatore locale");
    expect(html).toContain("APR · continuità automatica tra gate");
    expect(html).toContain("APR · admission readiness ENEA · collaudo solo locale");
    expect(html).toContain("APR · piano discovery operativo read-only · solo locale");
    expect(html).toContain("APR · attach reale Chrome · sola lettura");
    expect(html).toContain("immagini non fiscali escluse");
    expect(html).toContain("pipeline Pronte da fare");
    expect(html).toContain("IDLE — 0 pratiche");
    expect(html).toContain("Stato trasporto: fixture_verified");
    expect(html).toContain("contract_only_not_real");
    expect(html).toContain("Notifiche senza Codex: attive");
    expect(html).toContain("Centro notifiche macOS con inbox durevole");
    expect(html).toContain("Continuità APR · watchdog separato");
    expect(html).toContain("IDLE — coda vuota");
    const crmAdapter = await (await fetch(`${url}/api/crm-readonly-adapter`)).json() as { status: string; evidenceCount: number; externalActionAllowed: boolean; queueMayRun: boolean };
    expect(crmAdapter).toMatchObject({ status: "fixture_verified", evidenceCount: 5, externalActionAllowed: false, queueMayRun: false });
    const crmWorkflow = await (await fetch(`${url}/api/crm-integration-workflow`)).json() as { status: string; progress: { total: number }; externalActionAllowed: boolean };
    expect(crmWorkflow).toMatchObject({ status: "idle", progress: { total: 0 }, externalActionAllowed: false });
    const crmIncoming = await (await fetch(`${url}/api/crm-incoming-readonly`)).json() as { status: string; progress: { observed: number }; externalActionAllowed: boolean; mutationAllowed: boolean };
    expect(crmIncoming).toMatchObject({ status: "idle", progress: { observed: 0 }, externalActionAllowed: false, mutationAllowed: false });
    const crmLiveProcessing = await (await fetch(`${url}/api/crm-live-processing`)).json() as { status: string; progress: { total: number }; externalActionAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean };
    expect(crmLiveProcessing).toMatchObject({ status: "idle", progress: { total: 0 }, externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false });
    const shadowComparison = await (await fetch(`${url}/api/shadow-comparison`)).json() as { status: string; currentPhase: string; cumulative: { totalPractices: number }; promotionGate: { productionAuthorized: boolean }; externalMutationAllowed: boolean; eneaSubmitAllowed: boolean };
    expect(shadowComparison).toMatchObject({ status: "awaiting_shadow_cases", currentPhase: "SHADOW", cumulative: { totalPractices: 0 }, promotionGate: { productionAuthorized: false }, externalMutationAllowed: false, eneaSubmitAllowed: false });
    const shadowControl = await (await fetch(`${url}/api/shadow-control`)).json() as { status: string; intakeAllowed: boolean; externalMutationAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; communicationsAllowed: boolean };
    expect(shadowControl).toMatchObject({ status: "stopped", intakeAllowed: false, externalMutationAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    const localDraftPackages = await (await fetch(`${url}/api/crm-local-draft-packages`)).json() as { status: string; progress: { total: number }; externalActionAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; communicationsAllowed: boolean };
    expect(localDraftPackages).toMatchObject({ status: "unprepared", progress: { total: 0 }, externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    const localDraftHandoff = await (await fetch(`${url}/api/crm-local-draft-handoff`)).json() as { status: string; progress: { total: number; dispatched: number }; historicalCheckpointImported: boolean; externalActionAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; receiptAllowed: boolean; communicationsAllowed: boolean };
    expect(localDraftHandoff).toMatchObject({ status: "unprepared", progress: { total: 0, dispatched: 0 }, historicalCheckpointImported: false, externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    const localExecutorIntake = await (await fetch(`${url}/api/crm-local-executor-intake`)).json() as { status: string; progress: { total: number; active: number }; browserAllowed: boolean; externalActionAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; receiptAllowed: boolean; communicationsAllowed: boolean };
    expect(localExecutorIntake).toMatchObject({ status: "unprepared", progress: { total: 0, active: 0 }, browserAllowed: false, externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    const localCohortPlan = await (await fetch(`${url}/api/crm-local-cohort-execution-plan`)).json() as { status: string; progress: { total: number; active: number }; historicalExecutionCheckpointImported: boolean; historicalExecutionPathRead: boolean; simulatorOnly: boolean; browserAllowed: boolean; externalActionAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; receiptAllowed: boolean; communicationsAllowed: boolean };
    expect(localCohortPlan).toMatchObject({ status: "unprepared", progress: { total: 0, active: 0 }, historicalExecutionCheckpointImported: false, historicalExecutionPathRead: false, simulatorOnly: true, browserAllowed: false, externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    const gateOrchestrator = await (await fetch(`${url}/api/apr-gate-orchestrator`)).json() as { status: string; progress: { total: number; active: number }; externalActionAllowed: boolean; browserAllowed: boolean; crmMutationAllowed: boolean; eneaActionAllowed: boolean; previewAllowed: boolean; submitAllowed: boolean; receiptAllowed: boolean; communicationsAllowed: boolean };
    expect(gateOrchestrator).toMatchObject({ status: "unprepared", progress: { total: 0, active: 0 }, externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    const readinessAdmission = await (await fetch(`${url}/api/apr-enea-readiness-admission`)).json() as { status: string; phase: string; progress: { completedPhases: number; totalPhases: number }; externalActionAllowed: boolean; browserAllowed: boolean; eneaActionAllowed: boolean };
    expect(readinessAdmission).toMatchObject({ status: "unprepared", phase: "unprepared", progress: { completedPhases: 0, totalPhases: 7 }, externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    const readOnlyDiscovery = await (await fetch(`${url}/api/apr-enea-readonly-discovery`)).json() as { status: string; phase: string; progress: { completedPhases: number; totalPhases: number }; plannedSurfaces: unknown[]; externalActionAllowed: boolean; browserAllowed: boolean; eneaActionAllowed: boolean };
    expect(readOnlyDiscovery).toMatchObject({ status: "unprepared", phase: "unprepared", progress: { completedPhases: 0, totalPhases: 5 }, plannedSurfaces: expect.any(Array), externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    const realReadOnlyAttach = await (await fetch(`${url}/api/apr-enea-real-readonly-attach`)).json() as { status: string; phase: string; transportChecksPassed: number; externalActionAllowed: boolean; createWindowAllowed: boolean; createTabsAllowed: boolean; navigationAllowed: boolean; networkRequestAllowed: boolean };
    expect(realReadOnlyAttach).toMatchObject({ status: "unprepared", phase: "unprepared", transportChecksPassed: 0, externalActionAllowed: false, createWindowAllowed: false, createTabsAllowed: false, navigationAllowed: false, networkRequestAllowed: false });
    const notifications = await (await fetch(`${url}/api/notifications`)).json() as { codexRequiredForDelivery: boolean; deliveryMode: string };
    expect(notifications).toMatchObject({ codexRequiredForDelivery: false, deliveryMode: "macos_notification_center_with_durable_inbox" });
    const health = await (await fetch(`${url}/healthz`)).json() as { codexRequiredForNotification: boolean; externalActionAllowed: boolean; shadowControl: string; shadowIntakeAllowed: boolean; crmIntegrationWorkflow: string; crmIncomingReadOnly: string; crmLiveProcessing: string; crmLocalDraftHandoff: string; crmLocalExecutorIntake: string; crmLocalCohortExecutionPlan: string; aprGateOrchestrator: string; aprEneaReadinessAdmission: string; aprEneaReadOnlyDiscovery: string; aprEneaRealReadOnlyAttach: string };
    expect(health).toMatchObject({ codexRequiredForNotification: false, externalActionAllowed: false, shadowControl: "stopped", shadowIntakeAllowed: false, crmIntegrationWorkflow: "idle", crmIncomingReadOnly: "idle", crmLiveProcessing: "idle", crmLocalDraftHandoff: "unprepared", crmLocalExecutorIntake: "unprepared", crmLocalCohortExecutionPlan: "unprepared", aprGateOrchestrator: "unprepared", aprEneaReadinessAdmission: "unprepared", aprEneaReadOnlyDiscovery: "unprepared", aprEneaRealReadOnlyAttach: "unprepared" });
    const draftExecution = await (await fetch(`${url}/api/enea-draft-execution`)).json() as { status: string; previewAllowed: boolean; submitAllowed: boolean; communicationsAllowed: boolean };
    expect(draftExecution).toMatchObject({ status: "blocked_preflight", previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    const watchdog = await (await fetch(`${url}/api/watchdog`)).json() as { status: string; currentPhase: string; pendingRecovery: unknown };
    expect(watchdog).toMatchObject({ status: "IDLE", currentPhase: "coda_vuota", pendingRecovery: null });
    expect(runner.load().revision).toBe(before.revision);
  });

  it("rende visibile il checkpoint Infissi e la verita caso READY dalla dashboard", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    supervisor.infissiLocalMapping.run({
      practiceId: "practice-infissi",
      customerKey: "cristina-fabbro",
      displayName: "Cristina Fabbro",
      invoiceDimensionSource: { sourceId: "fattura-1", text: "1245 mm x 1435 mm" },
      invoiceFinancialSources: [{ sourceId: "fattura-1", text: "1245 mm x 1435 mm\nTOTALE 1.000,00(EUR)" }],
      technicalDocumentSource: { sourceId: "dop", text: "WEB/24/1 - 001\nTrasmittanza termica Uw [W/m K] 1.3" },
      verifiedTechnicalPageDimensions: [{ pageId: "001", widthMm: 1245, heightMm: 1435, verificationMethod: "visual_pdf_page_verified" }],
      form: { explicitNewFrameMaterial: "PVC", explicitGlassType: "Triplo vetro basso emissivo", alsoInstalledClosures: false, sourceId: "form" },
    }, new Date("2026-08-19T10:00:00Z"));
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();

    const html = await (await fetch(url)).text();
    expect(html).toContain("APR · Infissi · preflight fonti originarie");
    expect(html).toContain("Cristina Fabbro");
    expect(html).toContain("1</strong><span>infissi distinti 1:1");
    const mapping = await (await fetch(`${url}/api/infissi-local-mapping`)).json() as { status: string; item: { caseTruth: string } };
    expect(mapping).toMatchObject({ status: "ready_for_portal_mapping", item: { caseTruth: "READY" } });
    const truth = await (await fetch(`${url}/api/case-truth?customerKey=cristina-fabbro`)).json() as { status: string; hasProblem: boolean };
    expect(truth).toMatchObject({ status: "READY", hasProblem: false });
  });

  it("espone il confronto parallelo da un endpoint separato senza cambiare la verita pubblica", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    supervisor.infissiLocalMapping.run({
      practiceId: "practice-comparison", customerKey: "fixture-comparison", displayName: "Fixture Comparison",
      invoiceDimensionSource: { sourceId: "fattura", text: "1200 mm x 1400 mm" },
      invoiceFinancialSources: [{ sourceId: "fattura", text: "TOTALE 1.000,00(EUR)" }],
      technicalDocumentSource: { sourceId: "dop", text: "WEB/24/1 - 001\nTrasmittanza termica Uw [W/m K] 1.3" },
      verifiedTechnicalPageDimensions: [{ pageId: "001", widthMm: 1200, heightMm: 1400, verificationMethod: "visual_pdf_page_verified" }],
      form: { explicitNewFrameMaterial: "PVC", explicitGlassType: "Triplo vetro basso emissivo", alsoInstalledClosures: false, sourceId: "form" },
    }, new Date("2026-08-23T20:00:00.000Z"));
    const observation = (source: AprCaseStatusObservation["source"], status: AprCaseStatusObservation["status"]): AprCaseStatusObservation => ({
      source, stage: source === "preflight_common" ? "COMMON_PREFLIGHT" : source === "product_gate" ? "PRODUCT_GATE" : source === "report_blockers" ? "EVIDENCE" : source === "checkpoint" ? "SERVER_VERIFICATION" : source === "deep_review" ? "DEEP_REVIEW" : "EXECUTION",
      customerKey: "fixture-comparison", runId: "run-comparison", status, blockerCodes: [], classification: "NONE", observedAt: "2026-08-23T20:00:00.000Z", sourceFingerprint: canonicalSha256({ source, status }),
    });
    const observations = [observation("preflight_common", "PASS"), observation("product_gate", "PASS"), observation("deep_review", "NOT_APPLICABLE"), observation("execution", "NOT_APPLICABLE"), observation("checkpoint", "NOT_APPLICABLE"), observation("report_blockers", "PASS")];
    const collected: AprCollectedCaseObservations = { status: "COLLECTED", customerKey: "fixture-comparison", runId: "run-comparison", corpusFingerprint: "corpus-comparison", sourceAggregateFingerprint: canonicalSha256(observations), observations, errors: [] };
    const comparison = compareAprParallelCaseTruth({ oldTruth: { version: "apr-case-status-truth-v1", ruleId: "system-apr-case-status-truth", customerKey: "fixture-comparison", displayName: "Fixture Comparison", status: "READY", hasProblem: false, blockerCount: 0, blockerCodes: [], statement: "ready", sourceState: "ready_local_plan", reportOutcome: "ready_local_plan" }, collected, now: new Date("2026-08-23T20:00:01.000Z") });
    new PersistentAprCaseTruthComparisonStore(directory).persist(comparison);
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();
    const truthBefore = await (await fetch(`${url}/api/case-truth?customerKey=fixture-comparison`)).json();
    const list = await (await fetch(`${url}/api/case-truth-comparison?customerKey=fixture-comparison`)).json() as { items: Array<{ artifactId: string }> };
    const detail = await (await fetch(`${url}/api/case-truth-comparison?artifactId=${comparison.artifactId}`)).json() as { artifactId: string };
    const truthAfter = await (await fetch(`${url}/api/case-truth?customerKey=fixture-comparison`)).json();
    expect(list.items.map((item) => item.artifactId)).toEqual([comparison.artifactId]);
    expect(detail.artifactId).toBe(comparison.artifactId);
    expect(truthAfter).toEqual(truthBefore);
    expect((await fetch(`${url}/api/case-truth-comparison?artifactId=../checkpoint`)).status).toBe(400);
  });

  it("ripristina il supervisore dopo crash e lease scaduta conservando la revisione runner", async () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    const runnerState = runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T14:00:00.000Z"));
    let clock = new Date("2026-08-14T14:00:01.000Z");
    const first = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 60_000, instanceId: "supervisor-a", now: () => clock });
    await first.start();
    await first.simulateCrashForTest();

    clock = new Date("2026-08-14T14:00:17.000Z");
    const restarted = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 60_000, instanceId: "supervisor-b", now: () => clock });
    runningSupervisors.push(restarted);
    const url = await restarted.start();
    const response = await fetch(`${url}/api/status`);
    const payload = await response.json() as { supervisor: { restartCount: number; instanceId: string; audit: Array<{ type: string }> }; runner: { revision: number } };

    expect(payload.supervisor).toMatchObject({ restartCount: 1, instanceId: "supervisor-b" });
    expect(payload.supervisor.audit.some((event) => event.type === "supervisor_restarted")).toBe(true);
    expect(payload.runner.revision).toBe(runnerState.revision);
    expect(runner.load().queue.map((job) => job.practice.id)).toEqual(runnerState.queue.map((job) => job.practice.id));
  });

  it("registra dalla dashboard una risposta CRM locale e riaccoda la pratica in modo persistente", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const workflow = new PersistentAprCrmIntegrationWorkflow(directory);
    workflow.ingest({ event: { eventId: "event:dashboard-case:1", practiceId: "dashboard-case", customerId: "dashboard-customer", module: "ENEA", crmRevision: 1, currentPipeline: APR_READY_PIPELINE, currentStatus: "ENEA da lavorare", dossierLocator: "local://dashboard-case" }, displayName: "Cliente Dashboard" });
    workflow.stageOutcome("dashboard-case", { status: "blocked", reason: "Unita ambigua.", operatorRequest: { field: "screenings.1.unit", question: "Le misure sono in millimetri?", evidenceText: "Fattura: 4500 × 3000", sourceIds: ["invoice-page-2"], choices: [{ value: "millimeters", label: "Sì, millimetri" }] } });
    workflow.applyPending();
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();
    const html = await (await fetch(url)).text();
    const csrf = html.match(/\/crm\/integration\/dashboard-case\/answer[\s\S]*?name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();
    expect(html).toContain("Le misure sono in millimetri?");
    const response = await fetch(`${url}/crm/integration/dashboard-case/answer`, { method: "POST", redirect: "manual", headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/x-www-form-urlencoded" }, body: `csrf=${encodeURIComponent(csrf!)}&answer=millimeters&note=Confermato` });
    expect(response.status).toBe(303);
    const result = await (await fetch(`${url}/api/crm-integration-workflow`)).json() as ReturnType<PersistentAprCrmIntegrationWorkflow["snapshot"]>;
    expect(result.items[0]).toMatchObject({ state: "resume_ready", operatorResolution: { answer: "millimeters", note: "Confermato" } });
    expect(result.simulation.customers["dashboard-customer"].pipeline).toBe(APR_READY_PIPELINE);
    expect(result.externalActionAllowed).toBe(false);
  });

  it("mostra un piano armato dopo il riavvio senza dipendere dalla chat", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const planStore = new PersistentExecutionPlanStore(directory);
    planStore.create(["Alice Molinaris", "Romeo Ropa", "Romeo Ropa"], "long-run", new Date("2026-08-14T17:00:00.000Z"));
    planStore.arm("arm-long-run", new Date("2026-08-14T17:00:01.000Z"));
    planStore.heartbeat("executor-local", new Date("2026-08-14T17:00:02.000Z"));
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();

    const plan = await (await fetch(`${url}/api/execution-plan`)).json() as { status: string; bridgeRequired: boolean; executorId: string; items: Array<{ state: string }> };
    expect(plan).toMatchObject({ status: "running", bridgeRequired: false, executorId: "executor-local" });
    expect(plan.items.map((item) => item.state)).toEqual(["queued", "queued", "duplicate_input"]);
    const html = await (await fetch(url)).text();
    expect(html).toContain("Piano locale persistente · bridge chat escluso");
    expect(html).toContain("executor-local");
    expect(html).toContain("Avvia APR");
  });

  it("abilita la presa in carico solo dal comando locale e conserva il via dopo il riavvio", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const first = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(first);
    const firstUrl = await first.start();
    const html = await (await fetch(firstUrl)).text();
    const csrf = html.match(/action="\/shadow\/control\/start"[\s\S]*?name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();

    const response = await fetch(`${firstUrl}/shadow/control/start`, { method: "POST", redirect: "manual", headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/x-www-form-urlencoded" }, body: `csrf=${encodeURIComponent(csrf!)}` });
    expect(response.status).toBe(303);
    expect(await (await fetch(`${firstUrl}/api/shadow-control`)).json()).toMatchObject({ status: "armed", intakeAllowed: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    await first.stop("Riavvio controllato test shadow.");
    runningSupervisors.splice(runningSupervisors.indexOf(first), 1);

    const restarted = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(restarted);
    const restartedUrl = await restarted.start();
    expect(await (await fetch(`${restartedUrl}/api/shadow-control`)).json()).toMatchObject({ status: "armed", intakeAllowed: true, revision: 1 });
    const restartedHtml = await (await fetch(restartedUrl)).text();
    expect(restartedHtml).toContain("APR ATTIVO");
    expect(restartedHtml).toContain("Sospendi nuove prese in carico");
  });

  it("rifiuta una seconda istanza mentre la lease del supervisore è attiva", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const first = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000, instanceId: "supervisor-primary" });
    runningSupervisors.push(first);
    await first.start();
    const second = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000, instanceId: "supervisor-secondary" });
    await expect(second.start()).rejects.toBeInstanceOf(SupervisorBusyError);
  });

  it("mantiene vietato il vecchio avvio runner anche se la dashboard espone il gate SHADOW", async () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();
    const html = await (await fetch(url)).text();
    expect(html).toContain("Avvia APR");
    expect(html).toContain("abilita soltanto la presa in carico dalla pipeline Pronte da fare");
    expect(html).not.toContain("/actions/start-runner");

    const rejected = await fetch(`${url}/actions/start-runner`, { method: "POST", redirect: "manual", headers: { Origin: url } });
    expect(rejected.status).toBe(405);
    const afterAttempt = runner.load();
    expect(afterAttempt.runner.status).toBe("off");
    expect(afterAttempt.queue[0]).toMatchObject({ executionState: "queued", selectionCount: 0 });
    expect(afterAttempt.audit.filter((event) => event.type === "job_selected")).toHaveLength(0);
  });

  it("rende visibile un Salva incerto con prove, motivo e prossima azione dopo riavvio", async () => {
    const directory = temporaryStateDirectory();
    new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const execution = new PersistentAprEneaDraftExecution(directory);
    execution.prepare({
      status: "completed",
      sourceFingerprint: "dashboard-uncertain-source",
      items: [{
        customerKey: "federica-fixture",
        displayName: "Federica Fixture",
        practiceId: "crm-federica-fixture",
        state: "ready_local_plan",
        report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-federica-fixture", requiredPortalFieldCount: 2, portalGate: { status: "ready", workflowFingerprint: "workflow-federica-fixture", supportedPages: ["Intervento"], screeningItemCount: 0 } } },
      }, {
        customerKey: "next-fixture",
        displayName: "Next Fixture",
        practiceId: "crm-next-fixture",
        state: "ready_local_plan",
        report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-next-fixture", requiredPortalFieldCount: 2, portalGate: { status: "ready", workflowFingerprint: "workflow-next-fixture", supportedPages: ["Intervento"], screeningItemCount: 0 } } },
      }],
    } as never);
    execution.recordSessionReady("session-proof", "dashboard:uncertain:session");
    execution.recordCreateIntent("federica-fixture", "dashboard:uncertain:create");
    execution.recordDraftCreated("federica-fixture", "DRAFT-DASH", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/intervento/DRAFT-DASH", "draft-proof", "dashboard:uncertain:created");
    execution.recordPagePrepared("federica-fixture", "DRAFT-DASH", "page:Intervento", "prepared-proof", "dashboard:uncertain:prepared");
    execution.recordPageSaveIntent("federica-fixture", "DRAFT-DASH", "page:Intervento", "dashboard:uncertain:save-intent");
    execution.recordUncertainPageSaveDetected("federica-fixture", "page:Intervento", "Runtime.evaluate timeout", "timeout-proof", "dashboard:uncertain:detected");
    for (const method of ["server_redirect", "persisted_fields_get", "server_metadata_get"] as const) {
      execution.recordUncertainPageSaveProbe("federica-fixture", { method, outcome: "inconclusive", evidenceId: `dashboard-${method}`, reason: "Prova fixture inconcludente." }, `dashboard:uncertain:probe:${method}`);
    }

    const supervisor = new LocalDashboardSupervisor(directory, { port: 0, heartbeatIntervalMs: 10_000 });
    runningSupervisors.push(supervisor);
    const url = await supervisor.start();
    const html = await (await fetch(url)).text();
    expect(html).toContain("Salvataggi pagina incerti");
    expect(html).toContain("Federica Fixture");
    expect(html).toContain("DRAFT-DASH");
    expect(html).toContain("operator_required");
    expect(html).toContain("server_redirect: inconclusive");
    expect(html).toContain("persisted_fields_get: inconclusive");
    expect(html).toContain("server_metadata_get: inconclusive");
    expect(html).toContain("Richiesto intervento operatore");
    expect(html).toContain("Pagine mancanti");
    expect(html).toContain("page:Intervento");
    expect(html).toContain("Una bozza conta come salvata solo con tutte le pagine e le prove server");
    const api = await (await fetch(`${url}/api/enea-draft-execution`)).json() as ReturnType<PersistentAprEneaDraftExecution["snapshot"]>;
    expect(api.items[0]).toMatchObject({ customerKey: "federica-fixture", uncertainPageSave: { status: "operator_required", probes: expect.arrayContaining([expect.objectContaining({ method: "persisted_fields_get" })]) } });
  });
});
