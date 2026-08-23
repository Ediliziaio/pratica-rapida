import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "apr-enea-draft-execution-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function preflightFixture() {
  const ready = (customerKey: string, displayName: string, practiceId: string, screenings: number) => ({
    customerKey,
    displayName,
    practiceId,
    state: "ready_local_plan",
    report: {
      eneaPayloadAudit: {
        draftReady: true,
        mappingFingerprint: `mapping-${customerKey}`,
        requiredPortalFieldCount: 50 + screenings,
        portalGate: {
          status: "ready",
          workflowFingerprint: `workflow-${customerKey}`,
          supportedPages: ["Generatore", "Beneficiario", "Immobile", "Intervento", "Impianto", "Riepilogo schermature"],
          screeningItemCount: screenings,
        },
      },
    },
  });
  return {
    status: "completed",
    sourceFingerprint: "preflight-source-v5",
    items: [
      ready("lorena-brendas", "Lorena Brendas", "crm-lorena", 4),
      ready("milena-albertoni", "Milena Albertoni", "crm-albertoni", 1),
      ready("danila-serpa", "Danila Serpa", "crm-serpa", 1),
      ready("milena-fiorini", "Milena Fiorini", "crm-fiorini", 5),
      {
        customerKey: "beatrice-ciotta",
        displayName: "Beatrice Ciotta",
        practiceId: "crm-ciotta",
        state: "deferred_operator",
        report: { outcome: "blocked_case", blockers: [{ code: "legacy-report" }] },
      },
    ],
  } as never;
}

describe("esecuzione persistente della sola bozza ENEA TEST", () => {
  it("aggiunge pacchetti Infissi a una coda Schermature gia preparata senza duplicare alcun cliente", () => {
    const runner = new PersistentAprEneaDraftExecution(temporaryDirectory());
    const screening = preflightFixture() as { items: Array<{ customerKey: string }> };
    screening.items = screening.items.filter((item) => ["lorena-brendas", "milena-albertoni"].includes(item.customerKey));
    runner.prepare(screening as never);
    const infissi: AprEneaDraftPackage = {
      module: "infissi", customerKey: "cliente-infissi", displayName: "Cliente Infissi", practiceId: "crm-infissi",
      packageFingerprint: "package-infissi", workflowFingerprint: "workflow-infissi",
      workflow: { supportedPages: ["Anagrafica Beneficiario", "Serramenti e infissi"], screeningItemCount: 1, steps: [], screeningSteps: [] },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
    const appended = runner.appendEligiblePackages([infissi], "infissi-source");
    expect(appended.items.map((item) => item.customerKey)).toEqual(["lorena-brendas", "milena-albertoni", "cliente-infissi"]);
    const revision = appended.revision;
    expect(runner.appendEligiblePackages([infissi], "infissi-source").revision).toBe(revision);
    expect(new Set(runner.snapshot().items.map((item) => item.customerKey)).size).toBe(3);
  });

  it("il keepalive non riapre una coda terminale né propone di creare una nuova pratica", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    for (const customerKey of ["lorena-brendas", "milena-albertoni", "danila-serpa", "milena-fiorini"]) {
      runner.recordSessionReady(`session-${customerKey}`, `terminal:${customerKey}:session`);
      runner.recordCreateIntent(customerKey, `terminal:${customerKey}:create`);
      runner.recordCaseBlockedAndContinue(customerKey, "Caso isolato per collaudo terminale.", `terminal:${customerKey}:evidence`, `terminal:${customerKey}:blocked`);
    }

    const maintained = runner.recordSessionReady("session-keepalive", "terminal:session:keepalive");

    expect(maintained.status).toBe("completed");
    expect(maintained.reason).toContain("coda conclusa");
    expect(maintained.nextAction).toContain("nessuna ulteriore azione ENEA");
    expect(maintained.nextAction).not.toContain("creazione della prima pratica");

    const stale = JSON.parse(readFileSync(runner.checkpointPath, "utf8"));
    stale.reason = "Sessione pronta.";
    stale.nextAction = "Registrare l'intento persistente di creazione della prima pratica in coda.";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
    const afterRestart = new PersistentAprEneaDraftExecution(directory).snapshot();
    expect(afterRestart.reason).toContain("bozze complete verificate");
    expect(afterRestart.nextAction).toContain("nessuna ulteriore azione ENEA");
  });

  it("riclassifica la GET con soli default come non salvata e autorizza un solo recupero", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-defaults", "defaults:session");
    runner.recordCreateIntent("lorena-brendas", "defaults:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-DEFAULTS", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-DEFAULTS", "defaults:draft-proof", "defaults:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-DEFAULTS", pageId, "defaults:prepared-proof", "defaults:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-DEFAULTS", pageId, "defaults:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "defaults:timeout", "defaults:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_redirect", outcome: "inconclusive", evidenceId: "defaults:redirect", reason: "Nessun redirect." }, "defaults:probe:redirect");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "defaults:fields", reason: "2/13 campi coincidono.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-DEFAULTS" }, "defaults:probe:fields");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_metadata_get", outcome: "inconclusive", evidenceId: "defaults:metadata", reason: "Metadato assente." }, "defaults:probe:metadata");

    const recovered = runner.reclassifyPersistedFieldsProbeAsNotSaved("lorena-brendas", "defaults:fields", "defaults:reclassify");

    expect(recovered).toMatchObject({ status: "ready", currentCustomerKey: null });
    expect(recovered.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "recovery_authorized", probes: expect.arrayContaining([expect.objectContaining({ method: "persisted_fields_get", outcome: "not_saved" })]) } });
    expect(recovered.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "defaults:fields" });
    expect(runner.reclassifyPersistedFieldsProbeAsNotSaved("lorena-brendas", "defaults:fields", "defaults:reclassify").revision).toBe(recovered.revision);
  });

  it("accoda il caso verde di una coorte da due e isola il caso bloccato senza fermare la coda", () => {
    const directory = temporaryDirectory();
    const base = preflightFixture() as unknown as { status: string; sourceFingerprint: string; items: any[] };
    const preflight = {
      ...base,
      sourceFingerprint: "preflight-one-ready-one-blocked",
      items: [
        base.items[0],
        {
          customerKey: "case-blocked",
          displayName: "Case Blocked",
          practiceId: "crm-case-blocked",
          state: "blocked_case",
          report: { outcome: "blocked_case", blockers: [{ code: "source_ambiguous" }] },
        },
      ],
    } as never;

    const prepared = new PersistentAprEneaDraftExecution(directory).prepare(preflight);

    expect(prepared).toMatchObject({ status: "ready" });
    expect(prepared.items.map((item) => item.customerKey)).toEqual(["lorena-brendas"]);
    expect(prepared.reason).toContain("1 verdi accodati e 1 isolati");
  });

  it("accoda una sola pratica soltanto quando il seed autorizza il repeat-test singolo", () => {
    const directory = temporaryDirectory();
    const base = preflightFixture() as unknown as { status: string; sourceFingerprint: string; items: any[] };
    const single = { ...base, sourceFingerprint: "preflight-single-regression", items: [base.items[0]] } as never;
    expect(new PersistentAprEneaDraftExecution(directory).prepare(single)).toMatchObject({ status: "blocked_preflight", items: [] });
    const seedDirectory = path.join(directory, "cohort-seed");
    mkdirSync(seedDirectory, { recursive: true });
    writeFileSync(path.join(seedDirectory, "checkpoint.json"), JSON.stringify({ audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }] }));
    const prepared = new PersistentAprEneaDraftExecution(directory).prepare(single);
    expect(prepared).toMatchObject({ status: "ready", items: [{ customerKey: "lorena-brendas", state: "queued" }] });
    expect(prepared.audit.at(-1)?.appliedRuleIds).toContain("user-2026-08-18-single-case-regression-test");
  });

  it("riaccoda un errore pacchetto avvenuto prima di qualunque comando esterno", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    const preflight = preflightFixture();
    runner.prepare(preflight);
    runner.recordSessionReady("session-proof", "session:package-repair");
    runner.recordCreateIntent("lorena-brendas", "package-repair:intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready", "local-package-error", "package-repair:block");
    const repaired = runner.resumePreExternalPackageFailures(preflight, "package-repair:requeue");
    expect(repaired.items.find((item) => item.customerKey === "lorena-brendas")).toMatchObject({ state: "queued", draftId: null, portalUrl: null, createAttemptCount: 0, saveAttemptCount: 0 });
    expect(repaired.audit.at(-1)).toMatchObject({ type: "pre_external_package_failure_requeued", commandId: "package-repair:requeue" });
    expect(runner.resumePreExternalPackageFailures(preflight, "package-repair:requeue").revision).toBe(repaired.revision);
  });

  it("attende il pacchetto Infissi stabile e riprende la stessa bozza senza duplicarla", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    const draftPackage: AprEneaDraftPackage = {
      module: "infissi",
      customerKey: "lorena-brendas",
      displayName: "Lorena Brendas",
      practiceId: "crm-lorena",
      packageFingerprint: "infissi-package-stable",
      workflowFingerprint: "infissi-workflow-stable",
      workflow: {
        supportedPages: ["Anagrafica Beneficiario", "Serramenti e infissi"],
        screeningItemCount: 1,
        steps: [
          { id: "beneficiary", pageName: "Anagrafica Beneficiario", markerIds: [], fields: [], successMessage: "ok" },
          { id: "infissi", pageName: "Serramenti e infissi", markerIds: [], fields: [], successMessage: "ok" },
        ],
        screeningSteps: [{ id: "infissi-row", pageName: "Serramenti e infissi", markerIds: [], fields: [], successMessage: "ok" }],
      },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
    runner.preparePackages([draftPackage, { ...draftPackage, customerKey: "milena-albertoni", displayName: "Milena Albertoni", practiceId: "crm-albertoni", packageFingerprint: "infissi-package-2" }], "stable-source");
    runner.recordSessionReady("session-proof", "infissi-race:session");
    runner.recordCreateIntent("lorena-brendas", "infissi-race:intent");
    runner.recordDraftCreated("lorena-brendas", "424864", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/424864", "server-draft-proof", "infissi-race:created");
    const firstPage = runner.snapshot().items[0].pageCheckpoints[0].pageId;
    runner.recordPagePrepared("lorena-brendas", "424864", firstPage, "prepared-no-save", "infissi-race:prepared");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready", "local-package-race", "infissi-race:blocked");

    const recovered = runner.resumeInfissiPackageAvailabilityFailures([draftPackage], "all-validations-stable", "infissi-race:recover");

    expect(recovered).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(recovered.items[0]).toMatchObject({ state: "created", draftId: "424864", createAttemptCount: 1, saveAttemptCount: 0, mappingFingerprint: "infissi-package-stable" });
    expect(recovered.items[0].pageCheckpoints.every((page) => page.state === "pending" && page.saveAttemptCount === 0)).toBe(true);
    expect(recovered.audit.at(-1)).toMatchObject({ type: "infissi_package_availability_failure_requeued" });
    expect(runner.resumeInfissiPackageAvailabilityFailures([draftPackage], "all-validations-stable", "infissi-race:recover").revision).toBe(recovered.revision);
  });
  it("riaccoda sullo stesso tentativo un pacchetto ricostruito localmente prima di qualunque chiamata ENEA", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-rebuild", "session:ready:rebuild");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:rebuild");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: crm_enea_draft_package_rebuild_blocked", "local-package-rebuild", "lorena:blocked:rebuild");

    const recovered = runner.requeueUnmaterializedCreateIntents(["lorena-brendas"], "local-package-rebuilt-and-verified", "lorena:recover:rebuild-v1");
    expect(recovered.items[0]).toMatchObject({ state: "queued", draftId: null, createAttemptCount: 1, recoverableCreateIntent: true });
    expect(() => runner.requeueUnmaterializedCreateIntents(["lorena-brendas"], "local-package-rebuilt-and-verified", "lorena:recover:rebuild-v1")).not.toThrow();
  });
  it("mantiene dieci casi ordinati e dopo un blocco riparte dal successivo senza duplicazioni", () => {
    const directory = temporaryDirectory();
    const ready = (index: number) => ({
      customerKey: `lunedi-${index}`,
      displayName: `Lunedì ${index}`,
      practiceId: `crm-lunedi-${index}`,
      state: "ready_local_plan",
      report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `mapping-${index}`, requiredPortalFieldCount: 2, portalGate: { status: "ready", workflowFingerprint: `workflow-${index}`, supportedPages: ["Beneficiario"], screeningItemCount: 0 } } },
    });
    const preflight = { status: "completed", sourceFingerprint: "preflight-ten-monday", items: Array.from({ length: 10 }, (_, index) => ready(index + 1)) } as never;
    let execution = new PersistentAprEneaDraftExecution(directory);
    const prepared = execution.prepare(preflight, new Date("2026-08-16T08:00:00Z"));
    expect(prepared.items.map((item) => item.customerKey)).toEqual(Array.from({ length: 10 }, (_, index) => `lunedi-${index + 1}`));

    execution.recordSessionReady("session-ten-proof", "ten:session:1");
    execution.recordCreateIntent("lunedi-1", "ten:first:create");
    execution.recordCaseBlockedAndContinue("lunedi-1", "Caso ambiguo isolato dal test.", "ten:first:block-proof", "ten:first:block");

    execution = new PersistentAprEneaDraftExecution(directory);
    const afterRestart = execution.snapshot();
    expect(afterRestart).toMatchObject({ status: "ready", progress: { total: 10, queued: 9, blocked: 1, saved: 0 } });
    expect(afterRestart.items.filter((item) => item.customerKey === "lunedi-1")).toHaveLength(1);
    expect(afterRestart.items.find((item) => item.customerKey === "lunedi-1")).toMatchObject({ state: "operator_intervention", createAttemptCount: 1 });
    execution.recordSessionReady("session-ten-proof-2", "ten:session:2");
    const second = execution.recordCreateIntent("lunedi-2", "ten:second:create");
    expect(second.currentCustomerKey).toBe("lunedi-2");
    expect(second.items.find((item) => item.customerKey === "lunedi-2")).toMatchObject({ state: "create_intent_recorded", createAttemptCount: 1 });
    expect(second.items.slice(2).every((item) => item.state === "queued" && item.createAttemptCount === 0)).toBe(true);
  });

  it("accoda almeno due casi verdi e lascia fuori i blocker per-pratica senza fermare il lotto", () => {
    const directory = temporaryDirectory();
    const fixture = preflightFixture() as { items: Array<Record<string, unknown>> };
    for (const customerKey of ["danila-serpa", "milena-fiorini"]) {
      const item = fixture.items.find((candidate) => candidate.customerKey === customerKey)!;
      item.state = "blocked_case";
      item.report = { outcome: "blocked_case", blockers: [{ code: "source-blocked" }] };
    }
    const prepared = new PersistentAprEneaDraftExecution(directory).prepare(fixture as never);
    expect(prepared.status).toBe("ready");
    expect(prepared.items.map((item) => item.customerKey)).toEqual(["lorena-brendas", "milena-albertoni", "beatrice-ciotta"]);
    expect(prepared.items.filter((item) => item.state === "queued")).toHaveLength(2);
    expect(prepared.items.some((item) => item.customerKey === "danila-serpa")).toBe(false);
  });

  it("accoda una sola volta i casi diventati verdi dopo una revisione e li conserva al riavvio", () => {
    const directory = temporaryDirectory();
    const initial = preflightFixture() as { validationRevisionsApplied?: string[]; items: Array<Record<string, unknown>> };
    for (const customerKey of ["danila-serpa", "milena-fiorini"]) {
      const item = initial.items.find((candidate) => candidate.customerKey === customerKey)!;
      item.state = "blocked_case";
      item.report = { outcome: "blocked_case", blockers: [{ code: "source-blocked" }] };
    }
    initial.validationRevisionsApplied = ["validation-before-repair-v1"];
    let runner = new PersistentAprEneaDraftExecution(directory);
    const prepared = runner.prepare(initial as never);
    expect(prepared.items.filter((item) => item.state === "queued").map((item) => item.customerKey)).toEqual(["lorena-brendas", "milena-albertoni"]);

    const revised = preflightFixture() as { validationRevisionsApplied?: string[] };
    revised.validationRevisionsApplied = ["validation-before-repair-v1", "validation-after-repair-v2"];
    const appended = runner.appendNewEligibleFromValidation(revised as never, "validation-after-repair-v2");
    expect(appended.sourceFingerprint).toBe(prepared.sourceFingerprint);
    expect(appended.items.filter((item) => item.customerKey === "danila-serpa")).toHaveLength(1);
    expect(appended.items.filter((item) => item.customerKey === "milena-fiorini")).toHaveLength(1);
    expect(appended.items.find((item) => item.customerKey === "beatrice-ciotta")).toMatchObject({ state: "deferred_operator" });
    expect(appended.audit.at(-1)).toMatchObject({ type: "validation_eligible_cases_appended" });
    expect(appended.sourceRevisionFingerprints).toHaveLength(1);

    const revision = appended.revision;
    expect(runner.appendNewEligibleFromValidation(revised as never, "validation-after-repair-v2").revision).toBe(revision);
    runner = new PersistentAprEneaDraftExecution(directory);
    const restarted = runner.snapshot();
    expect(restarted.revision).toBe(revision);
    expect(new Set(restarted.items.map((item) => item.customerKey)).size).toBe(restarted.items.length);
    expect(restarted.items.filter((item) => item.state === "queued")).toHaveLength(4);
  });

  it("riprende dopo riavvio senza creare o salvare due volte e conserva Beatrice esclusa", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const prepared = runner.prepare(preflightFixture(), new Date("2026-08-15T18:00:00Z"));
    expect(prepared).toMatchObject({ status: "ready", previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    expect(prepared.items[0].expectedPageIds.slice(0, 5)).toEqual(["page:Beneficiario", "page:Immobile", "page:Intervento", "page:Generatore", "page:Impianto"]);
    expect(prepared.items[0].expectedPageIds.indexOf("screening:1")).toBeLessThan(prepared.items[0].expectedPageIds.indexOf("page:Riepilogo schermature"));
    expect(prepared.items.find((item) => item.customerKey === "beatrice-ciotta")).toMatchObject({ state: "deferred_operator", createAttemptCount: 0 });

    runner.recordSessionReady("dom-server-auth-1", "session:ready:1", new Date("2026-08-15T18:00:01Z"));
    const intent = runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1", new Date("2026-08-15T18:00:02Z"));
    expect(intent.items[0]).toMatchObject({ state: "create_intent_recorded", createAttemptCount: 1, draftId: null });

    runner = new PersistentAprEneaDraftExecution(directory);
    expect(runner.resumeDecision()).toEqual({ action: "discover_existing_draft_readonly", customerKey: "lorena-brendas", draftId: null });
    expect(runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1").revision).toBe(intent.revision);
    expect(() => runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:2")).toThrow("enea_session_not_ready");

    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1", new Date("2026-08-15T18:00:03Z"));
    runner.recordRequiredPageDiscovered("lorena-brendas", "DRAFT-100", "page:Calcolo costi e detrazioni", "server-calculation-required", "lorena:calculation:discovered", new Date("2026-08-15T18:00:03Z"));
    runner = new PersistentAprEneaDraftExecution(directory);
    expect(runner.resumeDecision()).toEqual({ action: "resume_existing_draft", customerKey: "lorena-brendas", draftId: "DRAFT-100" });

    const expectedPages = runner.load().items[0].expectedPageIds;
    expectedPages.forEach((pageId, index) => {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, `prepared-${index}`, `lorena:page:prepared:${index}`, new Date(1_787_000_004_000 + index * 3));
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, `lorena:page:save-intent:${index}`, new Date(1_787_000_005_000 + index * 3));
      runner = new PersistentAprEneaDraftExecution(directory);
      expect(runner.resumeDecision()).toMatchObject({ action: "verify_page_saved_state_readonly", customerKey: "lorena-brendas", draftId: "DRAFT-100", pageId });
      runner.recordPageSaved("lorena-brendas", "DRAFT-100", pageId, `saved-${index}`, `lorena:page:saved:${index}`, new Date(1_787_000_006_000 + index * 3));
    });
    const beforeSave = runner.load();
    expect(beforeSave.items[0]).toMatchObject({ state: "filling", completedPageIds: expectedPages });
    expect(beforeSave.items[0].pageCheckpoints.every(({ state, saveAttemptCount }) => state === "saved" && saveAttemptCount === 1)).toBe(true);
    runner.recordSaveIntent("lorena-brendas", "DRAFT-100", "lorena:save:intent:1", new Date("2026-08-15T18:01:00Z"));

    runner = new PersistentAprEneaDraftExecution(directory);
    expect(runner.resumeDecision()).toEqual({ action: "verify_saved_state_readonly", customerKey: "lorena-brendas", draftId: "DRAFT-100" });
    const saved = runner.recordDraftSaved("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-100", "server-saved-100", "lorena:saved:1", new Date("2026-08-15T18:01:01Z"));
    expect(saved.items[0]).toMatchObject({ state: "saved", createAttemptCount: 1, saveAttemptCount: 1 });
    expect(saved.currentCustomerKey).toBeNull();
    expect(saved.items.filter((item) => item.draftId === "DRAFT-100")).toHaveLength(1);
  });

  it("riprende soltanto la verifica finale da una catena server già acquisita senza ripetere Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "session:proof");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:final-proof");
    runner.recordDraftCreated("lorena-brendas", "411950", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/411950", "created-proof", "lorena:created:final-proof");
    const pages = runner.snapshot().items.find((item) => item.customerKey === "lorena-brendas")!.expectedPageIds;
    pages.forEach((pageId, index) => {
      runner.recordPagePrepared("lorena-brendas", "411950", pageId, `prepared-${index}`, `prepared:final:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "411950", pageId, `intent:final:${index}`);
      runner.recordPageSaved("lorena-brendas", "411950", pageId, `saved-${index}`, `saved:final:${index}`);
    });
    runner.recordSaveIntent("lorena-brendas", "411950", "final:save:intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Bozza completa e salvata non dimostrabile lato server; nessun retry.", "old-inconclusive", "final:isolated");

    const resumed = runner.resumeFinalDraftVerificationFromServerEvidence("lorena-brendas", "riepilogo-server-proof", "final:server-chain:resume");
    expect(resumed.items.find((item) => item.customerKey === "lorena-brendas")).toMatchObject({ state: "save_intent_recorded", draftId: "411950", createAttemptCount: 1, saveAttemptCount: 1 });
    expect(resumed.currentCustomerKey).toBe("lorena-brendas");
    expect(runner.resumeDecision()).toEqual({ action: "verify_saved_state_readonly", customerKey: "lorena-brendas", draftId: "411950" });
    expect(() => runner.resumeFinalDraftVerificationFromServerEvidence("lorena-brendas", "second-proof", "final:server-chain:second")).toThrow("enea_final_draft_evidence_recovery_active_case_present");
  });

  it("normalizza al riavvio un checkpoint legacy mettendo il generatore prima dell'impianto senza perdere stato", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const prepared = runner.prepare(preflightFixture());
    const checkpoint = JSON.parse(readFileSync(runner.checkpointPath, "utf8"));
    const item = checkpoint.items.find((candidate: { customerKey: string }) => candidate.customerKey === "lorena-brendas");
    const generator = item.expectedPageIds.find((pageId: string) => /Generatore/.test(pageId));
    const plant = item.expectedPageIds.find((pageId: string) => /Impianto/.test(pageId) && !/Generatore/.test(pageId));
    item.expectedPageIds = item.expectedPageIds.filter((pageId: string) => pageId !== generator && pageId !== plant);
    item.expectedPageIds.splice(3, 0, plant, generator);
    item.pageCheckpoints = item.expectedPageIds.map((pageId: string) => item.pageCheckpoints.find((page: { pageId: string }) => page.pageId === pageId));
    writeFileSync(runner.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);

    runner = new PersistentAprEneaDraftExecution(directory);
    const normalized = runner.snapshot();
    const normalizedItem = normalized.items.find((candidate) => candidate.customerKey === "lorena-brendas")!;
    expect(normalizedItem.expectedPageIds.indexOf(generator)).toBeLessThan(normalizedItem.expectedPageIds.indexOf(plant));
    expect(normalizedItem.pageCheckpoints.map((page) => page.pageId)).toEqual(normalizedItem.expectedPageIds);
    expect(normalizedItem).toMatchObject({ state: "queued", createAttemptCount: 0, draftId: null });
    expect(normalized.revision).toBe(prepared.revision);
  });

  it("vieta salvataggio incompleto, ordine coda, anteprima, submit e comunicazioni", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    expect(() => runner.recordCreateIntent("milena-albertoni", "albertoni:create:intent:1")).toThrow("enea_draft_queue_order_violation");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    expect(() => runner.recordSaveIntent("lorena-brendas", "DRAFT-100", "lorena:save:intent:1")).toThrow("enea_draft_save_state_invalid");
    expect(() => runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Anteprima", "evidence", "lorena:preview-page")).toThrow("enea_draft_page_not_allowlisted");
    const firstPage = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", firstPage, "prepared-1", "lorena:prepared:1");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", firstPage, "lorena:page-save-intent:1");
    expect(() => runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", firstPage, "lorena:page-save-intent:2")).toThrow("enea_draft_page_save_state_invalid");
    for (const action of ["preview", "anteprima", "submit", "invia", "email", "ricevuta", "comunicazione"]) {
      expect(() => runner.assertActionAllowed(action)).toThrow("enea_test_action_forbidden_by_policy");
    }
    expect(runner.assertActionAllowed("readonly_discovery")).toBe(true);
    expect(runner.assertActionAllowed("fill_allowlisted_field")).toBe(true);
  });

  it("distingue login globale da un blocco pratica e lo conserva al riavvio", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordLoginRequired("Redirect server reale al provider OpenID ENEA.", "openid-redirect-evidence", "session:login-required:1");
    runner = new PersistentAprEneaDraftExecution(directory);
    const snapshot = runner.snapshot();
    expect(snapshot).toMatchObject({ status: "login_required", currentCustomerKey: null, progress: { queued: 4, active: 0, saved: 0, blocked: 0, deferred: 1 }, resume: { action: "login_required" } });
    expect(snapshot.items.every((item) => item.state !== "operator_intervention")).toBe(true);
  });

  it("riprende una bozza già creata dopo la correzione ordine senza incrementare il tentativo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_page_navigation_not_found:page:Generatore", "page-order-error", "lorena:blocked:page-order");
    const resumed = runner.resumeCreatedDraftAfterPageOrderCorrection("lorena-brendas", "page-order-error", "lorena:resume:beneficiary-first");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0 });
    expect(resumed.items[0].expectedPageIds[0]).toBe("page:Beneficiario");
  });

  it("riprende il generatore dopo il mount React senza ripetere pagine o creare una bozza", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-generator", "session:ready:generator");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:generator");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-102", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-102", "server-draft-102", "lorena:created:generator");
    for (const [index, pageId] of ["page:Beneficiario", "page:Immobile", "page:Intervento"].entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-102", pageId, `prepared-${index}`, `lorena:prepared:generator:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-102", pageId, `lorena:save-intent:generator:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-102", pageId, `saved-${index}`, `lorena:saved:generator:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_generator_activation_failed:page:Generatore", "generator-mount-error", "lorena:blocked:generator-mount");
    const resumed = runner.resumeCreatedDraftAfterGeneratorActivationCorrection("lorena-brendas", "generator-surface-proof", "lorena:resume:generator-mount");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-102", createAttemptCount: 1, completedPageIds: ["page:Beneficiario", "page:Immobile", "page:Intervento"] });
    expect(resumed.items[0].pageCheckpoints.find(({ pageId }) => pageId === "page:Generatore")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
  });

  it("riprende un rimontaggio pre-Salva sulla stessa bozza preservando le pagine già salvate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-remount", "session:ready:remount");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:remount");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-REMOUNT", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-REMOUNT", "server-draft-remount", "lorena:created:remount");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-REMOUNT", "page:Beneficiario", "prepared-beneficiary", "lorena:prepared:beneficiary:remount");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-REMOUNT", "page:Beneficiario", "lorena:save-intent:beneficiary:remount");
    runner.recordPageSaved("lorena-brendas", "DRAFT-REMOUNT", "page:Beneficiario", "saved-beneficiary", "lorena:saved:beneficiary:remount");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-REMOUNT", "page:Immobile", "prepared-immobile", "lorena:prepared:immobile:remount");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-REMOUNT", "page:Immobile", "lorena:save-intent:immobile:remount");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_pre_save_field_contract_not_ready:id-comune,id-indirizzo", "pre-save-remount-proof", "lorena:blocked:pre-save-remount");

    const resumed = runner.resumeCreatedDraftAfterPreSaveRemount("lorena-brendas", "prepared-immobile", "lorena:resume:pre-save-remount");
    const item = resumed.items.find((candidate) => candidate.customerKey === "lorena-brendas")!;
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "filling", draftId: "DRAFT-REMOUNT", createAttemptCount: 1, completedPageIds: ["page:Beneficiario"] });
    expect(item.pageCheckpoints.find(({ pageId }) => pageId === "page:Beneficiario")).toMatchObject({ state: "saved", saveAttemptCount: 1, savedEvidenceId: "saved-beneficiary" });
    expect(item.pageCheckpoints.find(({ pageId }) => pageId === "page:Immobile")).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "prepared-immobile", preparedEvidenceId: null, savedEvidenceId: null });
  });

  it("recepisce un redirect server perso per collisione checkpoint senza ripetere Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-collision", "session:ready:collision");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:collision");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-COLLISION", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-COLLISION", "server-draft-collision", "lorena:created:collision");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-COLLISION", "page:Beneficiario", "prepared-collision", "lorena:prepared:collision");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: enea_draft_page_save_intent_missing", "checkpoint-collision", "lorena:blocked:collision");

    const resumed = runner.resumePageSavedAfterCheckpointCollision("lorena-brendas", "page:Beneficiario", "redirect-collision", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/immobile/DRAFT-COLLISION", "lorena:resume:collision");
    const item = resumed.items.find((candidate) => candidate.customerKey === "lorena-brendas")!;
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item.pageCheckpoints.find(({ pageId }) => pageId === "page:Beneficiario")).toMatchObject({ state: "saved", saveAttemptCount: 1, savedEvidenceId: "redirect-collision" });
    expect(item.completedPageIds).toContain("page:Beneficiario");
  });

  it("riaccoda un controllo Salva non cliccato senza consumare un secondo tentativo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-unclicked", "session:ready:unclicked");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:unclicked");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-UNCLICKED", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-UNCLICKED", "server-draft-unclicked", "lorena:created:unclicked");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-UNCLICKED", "page:Beneficiario", "prepared-unclicked", "lorena:prepared:unclicked");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-UNCLICKED", "page:Beneficiario", "lorena:save-intent:unclicked");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_unique_enabled_save_button_not_found:page:Beneficiario", "unclicked-control", "lorena:blocked:unclicked");

    const resumed = runner.resumeUnclickedPageAfterSaveControlCorrection("lorena-brendas", "page:Beneficiario", "prepared-unclicked", "lorena:resume:unclicked");
    const page = resumed.items.find((candidate) => candidate.customerKey === "lorena-brendas")!.pageCheckpoints.find((candidate) => candidate.pageId === "page:Beneficiario")!;
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(page).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "prepared-unclicked", savedEvidenceId: null });
  });

  it("riprende il generatore dopo il riallineamento read-only dell'impronta senza duplicare la bozza", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-generator-mapping", "session:ready:generator-mapping");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:generator-mapping");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-103", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-103", "server-draft-103", "lorena:created:generator-mapping");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_mapping_missing", "generator-mapping-error", "lorena:blocked:generator-mapping");
    const resumed = runner.resumeCreatedDraftAfterGeneratorActivationCorrection("lorena-brendas", "generator-mapping-rebind-proof", "lorena:resume:generator-mapping");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-103", createAttemptCount: 1, saveAttemptCount: 0 });
  });

  it("riprende la stessa bozza quando Beneficiario precede il mount React", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-beneficiary", "session:ready:beneficiary");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:beneficiary");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-101", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-101", "server-draft-101", "lorena:created:beneficiary");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_page_navigation_not_found:page:Anagrafica Beneficiario", "beneficiary-mount-error", "lorena:blocked:beneficiary-mount");
    const resumed = runner.resumeCreatedDraftAfterPageOrderCorrection("lorena-brendas", "beneficiary-mount-error", "lorena:resume:beneficiary-mount");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-101", createAttemptCount: 1, saveAttemptCount: 0 });
  });

  it("riaccoda un intento mai arrivato al portale dopo la rivalidazione locale del pacchetto", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: crm_enea_draft_package_fingerprint_mismatch", "local-package-old", "lorena:blocked:package");
    const recovered = runner.requeueUnmaterializedCreateIntents(["lorena-brendas"], "local-preflight-package-new", "lorena:recover:package-v2");
    expect(recovered).toMatchObject({ status: "ready", currentCustomerKey: null });
    expect(recovered.items[0]).toMatchObject({ state: "queued", createAttemptCount: 1, recoverableCreateIntent: true, draftId: null });
    runner.recordSessionReady("dom-server-auth-2", "session:ready:2");
    const reclaimed = runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:resume");
    expect(reclaimed.items[0]).toMatchObject({ state: "create_intent_recorded", createAttemptCount: 1, recoverableCreateIntent: false });
  });

  it("riaccoda sullo stesso contatore un discovery locale respinto perché appartiene a un'altra pratica", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: enea_draft_id_duplicate", "duplicate-discovery", "lorena:blocked:duplicate-discovery");

    const recovered = runner.requeueUnmaterializedCreateIntents(["lorena-brendas"], "duplicate-mapping-discarded", "lorena:recover:duplicate-discovery");
    expect(recovered.items[0]).toMatchObject({ state: "queued", draftId: null, createAttemptCount: 1, recoverableCreateIntent: true });
    runner.recordSessionReady("dom-server-auth-2", "session:ready:2");
    expect(runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:resume").items[0]).toMatchObject({ state: "create_intent_recorded", createAttemptCount: 1 });
  });

  it("riprende la stessa bozza dopo la correzione della verifica select Nazione", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-nazione_nascita,id-nazione_residenza", "nation-select-error", "lorena:blocked:nation-select");
    const resumed = runner.resumeCreatedDraftAfterFieldVerificationCorrection("lorena-brendas", "nation-select-error", "lorena:resume:nation-select");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0 });
  });

  it("riprende la stessa bozza dopo la correzione degli autocomplete Comune", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-comune_nascita,id-comune_residenza", "municipality-autocomplete-error", "lorena:blocked:municipality-autocomplete");
    const resumed = runner.resumeCreatedDraftAfterFieldVerificationCorrection("lorena-brendas", "municipality-autocomplete-error", "lorena:resume:municipality-autocomplete");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0 });
  });

  it("riprende la stessa bozza dopo il riallineamento read-only dell'impronta prima di qualunque Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_mapping_missing", "mapping-rebind-get", "lorena:blocked:mapping");
    const resumed = runner.resumeCreatedDraftAfterFieldVerificationCorrection("lorena-brendas", "mapping-rebind-get", "lorena:resume:mapping-v57");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [] });
  });

  it("riprende una bozza dopo timeout Runtime.evaluate solo se nessun Salva è stato tentato", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate", "pre-save-timeout", "lorena:blocked:runtime-evaluate");
    const resumed = runner.resumeCreatedDraftAfterTransientReadOnlyTimeout("lorena-brendas", "pre-save-timeout", "lorena:resume:runtime-evaluate-60s");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [] });
    expect(resumed.items[0].pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)).toBe(true);
  });

  it("riprende dopo timeout pre-Salva della pagina pendente preservando le pagine già verificate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-timeout-mid-draft", "session:ready:timeout-mid-draft");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:timeout-mid-draft");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-103", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-103", "server-draft-103", "lorena:created:timeout-mid-draft");
    for (const [index, pageId] of ["page:Beneficiario", "page:Immobile", "page:Intervento"].entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-103", pageId, `prepared-timeout-${index}`, `lorena:prepared:timeout-mid-draft:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-103", pageId, `lorena:save-intent:timeout-mid-draft:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-103", pageId, `saved-timeout-${index}`, `lorena:saved:timeout-mid-draft:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate", "pre-save-timeout-generator", "lorena:blocked:timeout-mid-draft");
    const resumed = runner.resumeCreatedDraftAfterTransientReadOnlyTimeout("lorena-brendas", "pre-save-timeout-generator", "lorena:resume:timeout-mid-draft");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-103", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario", "page:Immobile", "page:Intervento"] });
    expect(resumed.items[0].pageCheckpoints.filter((checkpoint) => checkpoint.state === "pending").every((checkpoint) => checkpoint.saveAttemptCount === 0)).toBe(true);
  });

  it("riprende la stessa bozza dopo chiusura CDP precedente a qualunque Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_connection_closed", "cdp-closed", "lorena:blocked:cdp-closed");
    const resumed = runner.resumeCreatedDraftAfterTransientReadOnlyTimeout("lorena-brendas", "cdp-reconnected", "lorena:resume:cdp-closed");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas", items: expect.arrayContaining([expect.objectContaining({ state: "created", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [] })]) });
  });

  it("riprende la stessa bozza quando il target naviga durante una lettura precedente al Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-target", "session:ready:target");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:target");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-104", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-104", "server-draft-104", "lorena:created:target");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_protocol_error:-32000:Inspected target navigated or closed", "cdp-target-navigated", "lorena:blocked:target-navigated");
    const resumed = runner.resumeCreatedDraftAfterTransientReadOnlyTimeout("lorena-brendas", "cdp-target-stable", "lorena:resume:target-navigated");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas", items: expect.arrayContaining([expect.objectContaining({ state: "created", draftId: "DRAFT-104", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [] })]) });
  });

  it("sposta le righe schermatura prima del costo disabilitato e conserva le pagine già salvate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    for (const [index, pageId] of runner.load().items[0].expectedPageIds.slice(0, 5).entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, `prepared-${index}`, `prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, `intent:${index}`);
      if (/Generatore/.test(pageId)) runner.recordNestedPageStaged("lorena-brendas", "DRAFT-100", pageId, `staged-${index}`, `staged:${index}`);
      else runner.recordPageSaved("lorena-brendas", "DRAFT-100", pageId, `saved-${index}`, `saved:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-costo", "disabled-cost", "blocked:disabled-cost");
    const resumed = runner.resumeCreatedDraftAfterScreeningOrderCorrection("lorena-brendas", "dom-disabled-cost-proof", "resume:screenings-before-summary");
    const item = resumed.items[0];
    expect(item).toMatchObject({ state: "filling", draftId: "DRAFT-100", completedPageIds: expect.arrayContaining(["page:Beneficiario", "page:Immobile", "page:Intervento", "page:Generatore", "page:Impianto"]), createAttemptCount: 1, saveAttemptCount: 0 });
    expect(item.expectedPageIds.indexOf("screening:1")).toBeLessThan(item.expectedPageIds.indexOf("page:Riepilogo schermature"));
    expect(item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:1")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
  });

  it("riprende la stessa bozza dopo la correzione dell'apertura Aggiungi schermatura", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    for (const [index, pageId] of runner.load().items[0].expectedPageIds.slice(0, 5).entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, `prepared-${index}`, `prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, `intent:${index}`);
      if (/Generatore/.test(pageId)) runner.recordNestedPageStaged("lorena-brendas", "DRAFT-100", pageId, `staged-${index}`, `staged:${index}`);
      else runner.recordPageSaved("lorena-brendas", "DRAFT-100", pageId, `saved-${index}`, `saved:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_page_navigation_not_found:screening:1", "screening-navigation", "blocked:screening-navigation");
    const resumed = runner.resumeCreatedDraftAfterScreeningNavigationCorrection("lorena-brendas", "fixture-screening-reload-proof", "resume:screening-navigation-v20");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-100", completedPageIds: expect.arrayContaining(["page:Beneficiario", "page:Immobile", "page:Intervento", "page:Generatore", "page:Impianto"]), createAttemptCount: 1, saveAttemptCount: 0 });
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:1")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
  });

  it("riprende una schermatura non cliccata dopo un contratto React tardivo senza duplicare righe o bozza", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-react", "session:ready:react");
    runner.recordCreateIntent("lorena-brendas", "react:create:intent");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-REACT", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-REACT", "server-draft-react", "react:created");
    const priorPageIds = runner.load().items[0].expectedPageIds.slice(0, runner.load().items[0].expectedPageIds.indexOf("screening:4"));
    for (const [index, pageId] of priorPageIds.entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-REACT", pageId, `prepared-react-${index}`, `react:prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-REACT", pageId, `react:intent:${index}`);
      if (/Generatore/.test(pageId) || pageId.startsWith("screening:")) runner.recordNestedPageStaged("lorena-brendas", "DRAFT-REACT", pageId, `saved-react-${index}`, `react:staged:${index}`);
      else runner.recordPageSaved("lorena-brendas", "DRAFT-REACT", pageId, `saved-react-${index}`, `react:saved:${index}`);
    }
    runner.recordPagePrepared("lorena-brendas", "DRAFT-REACT", "screening:4", "prepared-screening-react-4", "react:prepared:screening:4");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-REACT", "screening:4", "react:intent:screening:4");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_screening_react_contract_not_ready:screening:4", "prepared-screening-react-4", "react:blocked:4");
    expect(runner.snapshot().items[0]).toMatchObject({ state: "operator_intervention", draftId: "DRAFT-REACT", createAttemptCount: 1, saveAttemptCount: 0, reason: "Errore circoscritto alla pratica: apr_cdp_enea_screening_react_contract_not_ready:screening:4", pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId: "screening:4", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0, preparedEvidenceId: "prepared-screening-react-4", savedEvidenceId: null })]) });

    const resumed = runner.requeueScreeningAfterUnclickedReactContractFailure("lorena-brendas", "screening:4", "prepared-screening-react-4", "react:resume:4");
    const item = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "filling", draftId: "DRAFT-REACT", createAttemptCount: 1, saveAttemptCount: 0 });
    expect(item.pageCheckpoints.filter((checkpoint) => ["screening:1", "screening:2", "screening:3"].includes(checkpoint.pageId))).toEqual([
      expect.objectContaining({ pageId: "screening:1", state: "saved", saveAttemptCount: 1 }),
      expect.objectContaining({ pageId: "screening:2", state: "saved", saveAttemptCount: 1 }),
      expect.objectContaining({ pageId: "screening:3", state: "saved", saveAttemptCount: 1 }),
    ]);
    expect(item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:4")).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "prepared-screening-react-4", preparedEvidenceId: null, savedEvidenceId: null });
    expect(item.completedPageIds.filter((pageId) => pageId.startsWith("screening:"))).toEqual(["screening:1", "screening:2", "screening:3"]);
    expect(resumed.audit.at(-1)).toMatchObject({ type: "screening_react_contract_requeued_preclick", appliedRuleIds: expect.arrayContaining(["system-atomic-checkpoint-resume", "system-single-active-practice"]) });

    runner = new PersistentAprEneaDraftExecution(directory);
    expect(runner.snapshot().items[0]).toMatchObject({ draftId: "DRAFT-REACT", state: "filling" });
    expect(runner.requeueScreeningAfterUnclickedReactContractFailure("lorena-brendas", "screening:4", "prepared-screening-react-4", "react:resume:4").revision).toBe(resumed.revision);

    const legacy = runner.snapshot();
    const legacyItem = legacy.items[0];
    legacyItem.reason = "Stessa bozza riattivata: il journal prova che screening:4 non ha emesso alcun click Salva; le righe precedenti restano invariate.";
    legacyItem.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:4")!.recoveryAuthorizedEvidenceId = null;
    writeFileSync(runner.checkpointPath, `${JSON.stringify(legacy, null, 2)}\n`);
    const repairedGeneration = runner.requeueScreeningAfterUnclickedReactContractFailure("lorena-brendas", "screening:4", "prepared-screening-react-new-generation", "react:repair-generation:4");
    expect(repairedGeneration.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:4")).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "prepared-screening-react-new-generation" });
    expect(repairedGeneration).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
  });

  it("accetta la prova read-only univoca successiva all'unico Salva e prosegue senza un secondo click", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-screening-post-save", "post-save:session");
    runner.recordCreateIntent("lorena-brendas", "post-save:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-POST-SAVE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/schermature/DRAFT-POST-SAVE", "post-save-created", "post-save:created");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-POST-SAVE", "screening:1", "post-save-prepared", "post-save:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-POST-SAVE", "screening:1", "post-save:intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", "screening:1", "timeout della sola verifica", "post-save-uncertain", "post-save:detected");
    const resolved = runner.recordScreeningStagedFromPostSaveReadOnly("lorena-brendas", "screening:1", "post-save-unique-row-proof", "post-save:resolved");
    expect(resolved).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resolved.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-POST-SAVE", completedPageIds: ["screening:1"], uncertainPageSave: { pageId: "screening:1", status: "resolved_saved" } });
    expect(resolved.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:1")).toMatchObject({ state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, savedEvidenceId: "post-save-unique-row-proof" });
    expect(runner.recordScreeningStagedFromPostSaveReadOnly("lorena-brendas", "screening:1", "post-save-unique-row-proof", "post-save:resolved").revision).toBe(resolved.revision);
  });

  it("ripristina una sola volta le righe staged perse soltanto dopo prova server Nessun elemento", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-empty-summary", "session:ready:empty-summary");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:empty-summary");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-105", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-105", "server-draft-105", "lorena:created:empty-summary");
    const item = runner.load().items[0];
    for (const [index, pageId] of item.expectedPageIds.filter((pageId) => pageId.startsWith("screening:")).entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-105", pageId, `prepared-screening-${index}`, `prepared:screening:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-105", pageId, `intent:screening:${index}`);
      runner.recordNestedPageStaged("lorena-brendas", "DRAFT-105", pageId, `staged-screening-${index}`, `staged:screening:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-costo", "empty-summary", "blocked:empty-summary");
    const resumed = runner.resumeScreeningRowsAfterEmptyServerSummary("lorena-brendas", "server-empty-summary-proof", "resume:empty-summary");
    const recovered = resumed.items[0];
    expect(recovered).toMatchObject({ state: "filling", draftId: "DRAFT-105", createAttemptCount: 1, saveAttemptCount: 0 });
    expect(recovered.completedPageIds.some((pageId) => pageId.startsWith("screening:"))).toBe(false);
    expect(recovered.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")).every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && checkpoint.recoveryAuthorizedEvidenceId === "server-empty-summary-proof")).toBe(true);
    const first = recovered.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:1")!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-105", first.pageId, "prepared-recovery-screening-1", "prepared:recovery:screening:1");
    const recoveryIntent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-105", first.pageId, "intent:recovery:screening:1");
    expect(recoveryIntent.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === first.pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "server-empty-summary-proof" });
    const verifiedRecovery = runner.recordScreeningRecoveryStagedFromPostSaveReadOnly("lorena-brendas", first.pageId, "server-unique-recovery-row", "verify:recovery:screening:1");
    expect(verifiedRecovery).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(verifiedRecovery.items[0]).toMatchObject({ state: "filling", uncertainPageSave: { pageId: "screening:1", status: "resolved_saved" } });
    expect(verifiedRecovery.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === first.pageId)).toMatchObject({ state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 1, savedEvidenceId: "server-unique-recovery-row" });
  });

  it("ripristina tutte le righe annidate quando il crash sull'ultima lascia il riepilogo server vuoto", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "empty-nested:session");
    runner.recordCreateIntent("lorena-brendas", "empty-nested:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-EMPTY", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-EMPTY", "draft-proof", "empty-nested:created");
    const screenings = runner.load().items[0].expectedPageIds.filter((pageId) => pageId.startsWith("screening:"));
    for (const [index, pageId] of screenings.entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-EMPTY", pageId, `prepared-${pageId}`, `empty-nested:prepared:${pageId}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-EMPTY", pageId, `empty-nested:intent:${pageId}`);
      if (index < screenings.length - 1) runner.recordNestedPageStaged("lorena-brendas", "DRAFT-EMPTY", pageId, `staged-${pageId}`, `empty-nested:staged:${pageId}`);
      else runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo click", "timeout-last-row", "empty-nested:uncertain");
    }

    const resumed = runner.resumeScreeningRowsAfterEmptyServerSummary("lorena-brendas", "canonical-zero-rows", "empty-nested:resume");
    const item = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "filling", uncertainPageSave: { status: "recovery_authorized" } });
    expect(item.completedPageIds.some((pageId) => pageId.startsWith("screening:"))).toBe(false);
    expect(item.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")).every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && checkpoint.recoveryAuthorizedEvidenceId === "canonical-zero-rows")).toBe(true);
  });

  it("riprende il ripristino 1:1 dopo un timeout transitorio senza duplicare le righe gia verificate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "restage-timeout:session");
    runner.recordCreateIntent("lorena-brendas", "restage-timeout:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-RESTAGE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-RESTAGE", "draft-proof", "restage-timeout:created");
    const initial = runner.load().items[0];
    for (const [index, pageId] of initial.expectedPageIds.filter((pageId) => pageId.startsWith("screening:")).entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-RESTAGE", pageId, `prepared-${index}`, `restage-timeout:prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-RESTAGE", pageId, `restage-timeout:intent:${index}`);
      runner.recordNestedPageStaged("lorena-brendas", "DRAFT-RESTAGE", pageId, `staged-${index}`, `restage-timeout:staged:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-costo", "empty-summary", "restage-timeout:blocked");
    runner.resumeScreeningRowsAfterEmptyServerSummary("lorena-brendas", "canonical-zero-rows", "restage-timeout:authorize");

    const state = runner.load();
    const item = state.items[0];
    const screening = item.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:"));
    for (const checkpoint of screening.slice(0, 2)) {
      checkpoint.state = "saved";
      checkpoint.recoverySaveAttemptCount = 1;
      checkpoint.savedEvidenceId = `verified-${checkpoint.pageId}`;
      if (!item.completedPageIds.includes(checkpoint.pageId)) item.completedPageIds.push(checkpoint.pageId);
    }
    item.state = "operator_intervention";
    item.reason = "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate";
    item.uncertainPageSave = {
      pageId: screening.at(-1)!.pageId,
      status: "resolved_saved",
      detectedAt: new Date().toISOString(),
      detectedEvidenceId: "timeout-proof",
      probes: [],
      operatorDecision: null,
      reason: "GET canonica del riepilogo tecnico mostra zero righe: autorizzato un solo ripristino 1:1 dello staging perso.",
      nextAction: "Ripristinare tutte le righe una sola volta e salvarle con il riepilogo esterno.",
    };
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const resumed = runner.resumeAuthorizedScreeningRestageAfterTransientTimeout("lorena-brendas", "canonical-zero-rows", "restage-timeout:resume");
    const recovered = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(recovered).toMatchObject({ state: "filling", draftId: "DRAFT-RESTAGE" });
    expect(recovered.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")).slice(0, 2).every((checkpoint) => checkpoint.state === "saved" && checkpoint.recoverySaveAttemptCount === 1)).toBe(true);
    expect(recovered.pageCheckpoints.find((checkpoint) => checkpoint.pageId === screening[2].pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-zero-rows" });
    expect(runner.resumeAuthorizedScreeningRestageAfterTransientTimeout("lorena-brendas", "canonical-zero-rows", "restage-timeout:resume").revision).toBe(resumed.revision);
  });

  it("accetta una riga Infissi gia presente nella tabella post-click senza ripetere Salva", () => {
    const runner = new PersistentAprEneaDraftExecution(temporaryDirectory());
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "infissi-post-click:session");
    runner.recordCreateIntent("lorena-brendas", "infissi-post-click:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-INFISSI-ROW", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-INFISSI-ROW", "draft-proof", "infissi-post-click:created");
    const state = runner.load();
    const item = state.items[0];
    item.expectedPageIds = ["screening:1", "screening:2", "screening:3", "screening:4", "page:Serramenti e infissi"];
    item.completedPageIds = ["screening:1", "screening:2", "screening:3"];
    item.pageCheckpoints = [1, 2, 3].map((index) => ({ pageId: `screening:${index}`, state: "saved" as const, saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: `prepared-${index}`, savedEvidenceId: `saved-${index}` }));
    item.pageCheckpoints.push({ pageId: "screening:4", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: "prepared-4", savedEvidenceId: null });
    item.pageCheckpoints.push({ pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
    item.state = "operator_intervention";
    item.reason = "Richiesto intervento operatore sulla pagina screening:4: Tre prove read-only completate senza esito conclusivo.";
    item.uncertainPageSave = { pageId: "screening:4", status: "operator_required", detectedAt: new Date().toISOString(), detectedEvidenceId: "uncertain-proof", probes: [], operatorDecision: null, reason: "Tre prove read-only completate senza esito conclusivo.", nextAction: "Verificare la tabella." };
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const recovered = runner.recordInfissiRowStagedFromPostClickTable("lorena-brendas", "screening:4", 4, "post-click-four-rows", "infissi-post-click:accept");
    expect(recovered).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(recovered.items[0]).toMatchObject({ state: "filling", uncertainPageSave: { pageId: "screening:4", status: "resolved_saved" } });
    expect(recovered.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:4")).toMatchObject({ state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, savedEvidenceId: "post-click-four-rows" });
    expect(recovered.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Serramenti e infissi")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
    expect(() => runner.recordInfissiRowStagedFromPostClickTable("lorena-brendas", "screening:4", 3, "wrong-row-count", "infissi-post-click:reject")).toThrow("enea_infissi_post_click_table_evidence_invalid");
  });

  it("ripristina solo il prefisso Infissi staged perso quando la GET canonica prova zero righe", () => {
    const runner = new PersistentAprEneaDraftExecution(temporaryDirectory());
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "infissi-prefix:session");
    runner.recordCreateIntent("lorena-brendas", "infissi-prefix:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-INFISSI-PREFIX", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-INFISSI-PREFIX", "draft-proof", "infissi-prefix:created");
    const state = runner.load();
    const item = state.items[0];
    item.expectedPageIds = ["screening:1", "screening:2", "screening:3", "screening:4", "screening:5", "screening:6", "screening:7", "page:Serramenti e infissi"];
    item.completedPageIds = ["screening:1", "screening:2", "screening:3", "screening:4"];
    item.pageCheckpoints = [1, 2, 3, 4].map((index) => ({ pageId: `screening:${index}`, state: "saved" as const, saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: `prepared-${index}`, savedEvidenceId: `saved-${index}` }));
    item.pageCheckpoints.push({ pageId: "screening:5", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: "prepared-5", savedEvidenceId: null });
    for (const index of [6, 7]) item.pageCheckpoints.push({ pageId: `screening:${index}`, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
    item.pageCheckpoints.push({ pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
    item.state = "operator_intervention";
    item.reason = "Richiesto intervento operatore sulla pagina screening:5: Tre prove read-only completate senza esito conclusivo.";
    item.uncertainPageSave = { pageId: "screening:5", status: "operator_required", detectedAt: new Date().toISOString(), detectedEvidenceId: "uncertain-proof", probes: [], operatorDecision: null, reason: "Tre prove read-only completate senza esito conclusivo.", nextAction: "Verificare la tabella." };
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const recovered = runner.resumePartialInfissiRowsAfterEmptyCanonicalSummary("lorena-brendas", "canonical-zero-rows", "infissi-prefix:resume");
    expect(recovered).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    const checkpoints = recovered.items[0].pageCheckpoints;
    expect(checkpoints.filter((checkpoint) => /^screening:[1-5]$/.test(checkpoint.pageId)).every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && checkpoint.recoveryAuthorizedEvidenceId === "canonical-zero-rows")).toBe(true);
    expect(checkpoints.filter((checkpoint) => /^screening:[67]$/.test(checkpoint.pageId)).every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0 && checkpoint.recoverySaveAttemptCount === 0 && checkpoint.recoveryAuthorizedEvidenceId === null)).toBe(true);
    expect(recovered.items[0].completedPageIds.some((pageId) => pageId.startsWith("screening:"))).toBe(false);
  });

  it("ripristina generatore e Impianto quando la tabella post-click prova che lo staging annidato e andato perso", () => {
    const runner = new PersistentAprEneaDraftExecution(temporaryDirectory());
    runner.prepare(preflightFixture());
    const state = runner.load();
    const item = state.items[0];
    const generatorPageId = item.expectedPageIds.find((pageId) => /Generatore/.test(pageId))!;
    const plantPageId = item.expectedPageIds.find((pageId) => !/Generatore/.test(pageId) && /Impianto/.test(pageId))!;
    item.state = "operator_intervention";
    item.draftId = "DRAFT-GEN-EMPTY";
    item.portalUrl = "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-GEN-EMPTY";
    item.createAttemptCount = 1;
    item.completedPageIds = [generatorPageId];
    item.pageCheckpoints = item.expectedPageIds.map((pageId) => ({
      pageId,
      state: pageId === generatorPageId ? "saved" as const : pageId === plantPageId ? "save_intent_recorded" as const : "pending" as const,
      saveAttemptCount: pageId === generatorPageId || pageId === plantPageId ? 1 : 0,
      recoverySaveAttemptCount: pageId === plantPageId ? 1 : 0,
      recoveryAuthorizedEvidenceId: pageId === plantPageId ? "old-not-saved" : null,
      preparedEvidenceId: pageId === plantPageId ? "plant-prepared" : null,
      savedEvidenceId: pageId === generatorPageId ? "generator-staged" : null,
    }));
    item.reason = "La GET canonica dimostra che anche l'unico recupero non è persistito.";
    item.uncertainPageSave = { pageId: plantPageId, status: "operator_required", detectedAt: new Date().toISOString(), detectedEvidenceId: "plant-uncertain", probes: [], operatorDecision: null, reason: item.reason, nextAction: "Verificare la causa." };
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const resumed = runner.resumeGeneratorAndPlantAfterEmptyGeneratorSummary("lorena-brendas", "empty-generator-table", "generator-empty:resume");
    const resumedItem = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumedItem.pageCheckpoints.find((page) => page.pageId === generatorPageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "empty-generator-table", savedEvidenceId: null });
    expect(resumedItem.pageCheckpoints.find((page) => page.pageId === plantPageId)).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, savedEvidenceId: null });
    expect(resumedItem.completedPageIds).not.toContain(generatorPageId);
    expect(resumedItem.serverEvidenceIds).toContain("empty-generator-table");
    expect(runner.resumeGeneratorAndPlantAfterEmptyGeneratorSummary("lorena-brendas", "empty-generator-table", "generator-empty:resume").revision).toBe(resumed.revision);
  });

  it("riapre una sola generazione Infissi dopo doppia prova del classificatore corretto e zero righe server", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "classifier-v2:session");
    runner.recordCreateIntent("lorena-brendas", "classifier-v2:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-INFISSI", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-INFISSI", "draft-proof", "classifier-v2:created");
    const state = runner.load();
    const item = state.items[0];
    item.state = "operator_intervention";
    item.expectedPageIds = ["screening:1", "screening:2", "page:Serramenti e infissi"];
    item.completedPageIds = ["screening:1"];
    item.pageCheckpoints = [
      { pageId: "screening:1", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "old-empty-proof", preparedEvidenceId: "prepared-1", savedEvidenceId: "staged-1" },
      { pageId: "screening:2", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "old-empty-proof", preparedEvidenceId: "prepared-2", savedEvidenceId: null },
      { pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null },
    ];
    item.uncertainPageSave = { pageId: "screening:2", status: "operator_required", detectedAt: new Date().toISOString(), detectedEvidenceId: "old-uncertain", probes: [], operatorDecision: null, reason: "verifica precedente inconcludente", nextAction: "attesa correzione" };
    item.reason = "La verifica read-only dopo l'unico recupero resta inconcludente.";
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const resumed = new PersistentAprEneaDraftExecution(directory).resumeInfissiRowsAfterStagingClassifierCorrection("lorena-brendas", "canonical-zero-rows-v2", "filled-react-contract-v2", "classifier-v2:resume");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-INFISSI", uncertainPageSave: { status: "recovery_authorized", probes: [] } });
    expect(resumed.items[0].completedPageIds).toEqual([]);
    expect(resumed.items[0].pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")).every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 0 && checkpoint.recoveryAuthorizedEvidenceId === "canonical-zero-rows-v2")).toBe(true);
    expect(resumed.audit.at(-1)).toMatchObject({ type: "infissi_rows_requeued_after_staging_classifier_correction" });
  });

  it("riapre la stessa bozza con valore oltre massimo auditato e 1,3 nel campo ENEA dopo prova server vuota", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "transmittance:session");
    runner.recordCreateIntent("lorena-brendas", "transmittance:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-INFISSI-131", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-INFISSI-131", "draft-proof", "transmittance:created");
    const state = runner.load();
    const item = state.items[0];
    item.state = "operator_intervention";
    item.expectedPageIds = ["page:Beneficiario", "screening:1", "screening:2", "screening:3", "page:Serramenti e infissi"];
    item.completedPageIds = ["page:Beneficiario", "screening:1"];
    item.pageCheckpoints = [
      { pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: "common-prepared", savedEvidenceId: "common-server" },
      { pageId: "screening:1", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "old-empty", preparedEvidenceId: "prepared-1", savedEvidenceId: "staged-1" },
      { pageId: "screening:2", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "old-empty", preparedEvidenceId: "prepared-2", savedEvidenceId: null },
      { pageId: "screening:3", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null },
      { pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null },
    ];
    item.uncertainPageSave = { pageId: "screening:2", status: "operator_required", detectedAt: new Date().toISOString(), detectedEvidenceId: "old-uncertain", probes: [], operatorDecision: null, reason: "1,6 respinto", nextAction: "attesa regola" };
    item.reason = "La verifica read-only dopo l'unico recupero resta inconcludente.";
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const upgradedPackage = {
      module: "infissi",
      customerKey: "lorena-brendas",
      packageFingerprint: "mapping-infissi-131-to-13",
      workflowFingerprint: "workflow-infissi-131-to-13",
      workflow: {
        supportedPages: ["Beneficiario", "Serramenti e infissi"],
        screeningItemCount: 3,
        steps: [{ fields: [] }, { fields: [{ portalId: "id-costo", value: "1000,00" }] }],
        screeningSteps: [
          { fields: [{ portalId: "id-u_post", value: "1,2" }] },
          { fields: [{ portalId: "id-u_post", value: "1,3" }] },
          { fields: [{ portalId: "id-u_post", value: "1,2" }] },
        ],
      },
      infissiPayload: {
        windows: [
          { sourceNewWindowThermalTransmittanceWm2K: 1.2, newWindowThermalTransmittanceWm2K: 1.2 },
          { sourceNewWindowThermalTransmittanceWm2K: 1.6, newWindowThermalTransmittanceWm2K: 1.3 },
          { sourceNewWindowThermalTransmittanceWm2K: 1.2, newWindowThermalTransmittanceWm2K: 1.2 },
        ],
        audit: { appliedRuleIds: ["user-2026-08-23-infissi-portal-transmittance-over-max-to-1-3-v1"] },
      },
    } as never;
    const resumed = new PersistentAprEneaDraftExecution(directory).resumeInfissiRowsAfterAuthorizedTransmittanceCorrection(
      "lorena-brendas", "canonical-zero-rows", "enea-rejected-over-max", "transmittance:resume", upgradedPackage,
    );
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({
      state: "filling",
      draftId: "DRAFT-INFISSI-131",
      mappingFingerprint: "mapping-infissi-131-to-13",
      workflowFingerprint: "workflow-infissi-131-to-13",
      completedPageIds: ["page:Beneficiario"],
      uncertainPageSave: { status: "recovery_authorized" },
    });
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Beneficiario")).toMatchObject({ state: "saved", savedEvidenceId: "common-server" });
    expect(resumed.items[0].pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")).map((checkpoint) => ({ pageId: checkpoint.pageId, state: checkpoint.state, saveAttemptCount: checkpoint.saveAttemptCount, recoverySaveAttemptCount: checkpoint.recoverySaveAttemptCount, recoveryAuthorizedEvidenceId: checkpoint.recoveryAuthorizedEvidenceId }))).toEqual([
      { pageId: "screening:1", state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-zero-rows" },
      { pageId: "screening:2", state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-zero-rows" },
      { pageId: "screening:3", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-zero-rows" },
    ]);
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Calcolo costi e detrazioni")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
    expect(resumed.audit.at(-1)).toMatchObject({
      type: "infissi_rows_requeued_after_authorized_transmittance_correction",
      appliedRuleIds: expect.arrayContaining(["user-2026-08-23-infissi-portal-transmittance-over-max-to-1-3-v1"]),
    });
  });

  it("riaccoda la stessa bozza Infissi quando il luogo estero corretto sostituisce un payload non persistito", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "foreign-place:session");
    runner.recordCreateIntent("lorena-brendas", "foreign-place:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-FOREIGN", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-FOREIGN", "draft-proof", "foreign-place:created");
    const pageId = runner.snapshot().items[0].expectedPageIds.find((page) => /beneficiario/i.test(page))!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-FOREIGN", pageId, "primary-prepared", "foreign-place:primary-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-FOREIGN", pageId, "foreign-place:primary-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "invalid birth place", "primary-timeout", "foreign-place:primary-uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "primary-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-FOREIGN" }, "foreign-place:primary-probe");
    runner.recordSessionReady("session-proof-2", "foreign-place:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "foreign-place:claim-recovery");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-FOREIGN", pageId, "recovery-prepared", "foreign-place:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-FOREIGN", pageId, "foreign-place:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "invalid birth place", "recovery-timeout", "foreign-place:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "recovery-empty", reason: "Pagina ancora vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-FOREIGN" }, "foreign-place:recovery-probe");
    const upgradedPackage = {
      module: "infissi", customerKey: "lorena-brendas", packageFingerprint: "package-foreign-place-corrected", workflowFingerprint: "workflow-foreign-place-corrected",
      workflow: { supportedPages: ["Beneficiario", "Serramenti e infissi", "Calcolo costi e detrazioni"], screeningItemCount: 2, steps: [{ pageName: "Beneficiario", fields: [{ portalId: "id-comune_nascita", value: "Bacau" }] }, { pageName: "Serramenti e infissi", fields: [] }, { pageName: "Calcolo costi e detrazioni", fields: [] }], screeningSteps: [{ fields: [] }, { fields: [] }] },
    } as never;

    const resumed = runner.requeueVerifiedInfissiPackageCorrection(upgradedPackage, "lorena-brendas", "mapping-get-proof", "foreign-place:requeue");
    expect(resumed.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-FOREIGN", mappingFingerprint: "package-foreign-place-corrected", workflowFingerprint: "workflow-foreign-place-corrected", uncertainPageSave: { status: "recovery_authorized" } });
    expect(resumed.items[0].expectedPageIds).toEqual(expect.arrayContaining(["screening:1", "screening:2", "page:Serramenti e infissi", "page:Calcolo costi e detrazioni"]));
    expect(resumed.items[0].pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)).toBe(true);
  });

  it("applica il pacchetto Infissi senza falso cointestatario prima di consumare un recupero", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "self-co:session");
    runner.recordCreateIntent("lorena-brendas", "self-co:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-SELF-CO", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SELF-CO", "draft-proof", "self-co:created");
    const pageId = runner.snapshot().items[0].expectedPageIds.find((page) => /beneficiario/i.test(page))!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-SELF-CO", pageId, "prepared", "self-co:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SELF-CO", pageId, "self-co:intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "uncertain", "self-co:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_redirect", outcome: "inconclusive", evidenceId: "redirect", reason: "Nessun redirect." }, "self-co:redirect");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "primary-empty", reason: "1/13 campi coincidono.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SELF-CO" }, "self-co:fields");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_metadata_get", outcome: "inconclusive", evidenceId: "metadata", reason: "Metadato assente." }, "self-co:metadata");
    const correctedPackage = {
      module: "infissi", customerKey: "lorena-brendas", packageFingerprint: "package-without-self-co", workflowFingerprint: "workflow-without-self-co",
      workflow: { supportedPages: ["Beneficiario", "Serramenti e infissi"], screeningItemCount: 1, steps: [{ pageName: "Beneficiario", fields: [{ portalId: "id-codice_fiscale", value: "RSSMRA80A01H501U" }] }, { pageName: "Serramenti e infissi", fields: [] }], screeningSteps: [{ fields: [] }] },
    } as never;
    const resumed = runner.requeueVerifiedInfissiPackageCorrectionAfterPrimaryNotSaved(correctedPackage, "lorena-brendas", "primary-empty", "self-co:requeue");
    expect(resumed.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-SELF-CO", mappingFingerprint: "package-without-self-co", uncertainPageSave: { status: "recovery_authorized", probes: expect.arrayContaining([expect.objectContaining({ method: "persisted_fields_get", outcome: "not_saved" })]) } });
    expect(resumed.items[0].pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0 && checkpoint.recoverySaveAttemptCount === 0)).toBe(true);
    expect(resumed.audit.at(-1)).toMatchObject({ type: "verified_infissi_package_correction_requeued", appliedRuleIds: expect.arrayContaining(["user-2026-08-16-invoice-identity-over-customer-form", "user-2026-08-17-invoice-co-beneficiary-person-flow"]) });
  });

  it("aggiorna un checkpoint Infissi legacy inserendo le righe 1:1 prima del riepilogo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "legacy-rows:session");
    runner.recordCreateIntent("lorena-brendas", "legacy-rows:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-LEGACY-ROWS", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-LEGACY-ROWS", "draft-proof", "legacy-rows:created");
    const state = runner.snapshot();
    const item = state.items[0];
    item.expectedPageIds = ["page:Beneficiario", "page:Immobile", "page:Serramenti e infissi"];
    item.completedPageIds = ["page:Beneficiario", "page:Immobile"];
    item.pageCheckpoints = [
      { pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: "p1", savedEvidenceId: "s1" },
      { pageId: "page:Immobile", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: "p2", savedEvidenceId: "s2" },
      { pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null },
    ];
    item.state = "operator_intervention";
    item.reason = "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-costo";
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const upgradedPackage = {
      module: "infissi", customerKey: "lorena-brendas", packageFingerprint: "package-legacy-rows", workflowFingerprint: "workflow-legacy-rows",
      workflow: { supportedPages: ["Beneficiario", "Immobile", "Serramenti e infissi", "Calcolo costi e detrazioni"], screeningItemCount: 2, steps: [{ pageName: "Beneficiario", fields: [] }, { pageName: "Immobile", fields: [] }, { pageName: "Serramenti e infissi", fields: [] }, { pageName: "Calcolo costi e detrazioni", fields: [] }], screeningSteps: [{ fields: [] }, { fields: [] }] },
    } as never;

    const resumed = new PersistentAprEneaDraftExecution(directory).resumeLegacyInfissiRowsBeforeSummary("lorena-brendas", "canonical-zero-rows", "legacy-rows:resume", upgradedPackage);
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-LEGACY-ROWS", completedPageIds: ["page:Beneficiario", "page:Immobile"] });
    expect(resumed.items[0].expectedPageIds).toEqual(expect.arrayContaining(["screening:1", "screening:2", "page:Serramenti e infissi", "page:Calcolo costi e detrazioni"]));
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Beneficiario")).toMatchObject({ state: "saved", savedEvidenceId: "s1" });
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "screening:1")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
  });

  it("ripara il checkpoint Infissi legacy aggiungendo soltanto Calcolo senza valorizzare il risparmio", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "final-calculation:session");
    runner.recordCreateIntent("lorena-brendas", "final-calculation:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-INFISSI-CALC", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-INFISSI-CALC", "draft-proof", "final-calculation:created");
    const state = runner.snapshot();
    const item = state.items[0];
    item.expectedPageIds = ["screening:1", "page:Serramenti e infissi"];
    item.completedPageIds = [...item.expectedPageIds];
    item.pageCheckpoints = item.expectedPageIds.map((pageId, index) => ({ pageId, state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: `prepared-${index}`, savedEvidenceId: `saved-${index}` }));
    item.state = "operator_intervention";
    item.reason = "Errore circoscritto alla pratica: enea_draft_final_calculation_page_missing";
    state.currentCustomerKey = null;
    state.status = "completed";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const upgradedPackage = {
      module: "infissi",
      customerKey: "lorena-brendas",
      packageFingerprint: "package-infissi-final-calculation",
      workflowFingerprint: "workflow-infissi-final-calculation",
      workflow: {
        supportedPages: ["Serramenti e infissi", "Calcolo costi e detrazioni"],
        screeningItemCount: 1,
        steps: [
          { pageName: "Serramenti e infissi", fields: [{ portalId: "id-costo", value: "1000,00" }] },
          { pageName: "Calcolo costi e detrazioni", markerIds: ["id-risp"], fields: [] },
        ],
        screeningSteps: [{ fields: [{ portalId: "id-u_post", value: "1,3" }] }],
      },
      infissiPayload: { audit: { appliedRuleIds: ["user-2026-08-19-infissi-portal-managed-energy-savings-v1"] } },
    } as never;
    const resumed = new PersistentAprEneaDraftExecution(directory).resumeInfissiFinalCalculationAfterCheckpointRepair(
      "lorena-brendas", "server-redirect-calcolo", "final-calculation:repair", upgradedPackage,
    );
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-INFISSI-CALC" });
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Calcolo costi e detrazioni")).toMatchObject({ state: "pending", saveAttemptCount: 0, recoveryAuthorizedEvidenceId: "server-redirect-calcolo" });
    expect(resumed.items[0].pageCheckpoints.filter((checkpoint) => checkpoint.pageId !== "page:Calcolo costi e detrazioni").every((checkpoint) => checkpoint.state === "saved")).toBe(true);
    expect(resumed.audit.at(-1)).toMatchObject({ type: "infissi_final_calculation_requeued_after_checkpoint_repair", appliedRuleIds: expect.arrayContaining(["user-2026-08-19-infissi-portal-managed-energy-savings-v1"]) });
  });

  it("riprende la pagina pendente dopo un confronto select corretto senza toccare la pagina già salvata", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Beneficiario", "prepared-beneficiary", "lorena:beneficiary:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Beneficiario", "lorena:beneficiary:save-intent");
    runner.recordPageSaved("lorena-brendas", "DRAFT-100", "page:Beneficiario", "saved-beneficiary", "lorena:beneficiary:saved");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-possesso,id-tipologia", "immobile-field-contract", "lorena:blocked:immobile-contract");
    const resumed = runner.resumeCreatedDraftAfterFieldVerificationCorrection("lorena-brendas", "immobile-field-options-proof", "lorena:resume:immobile-select-value");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", completedPageIds: ["page:Beneficiario"], createAttemptCount: 1, saveAttemptCount: 0 });
    expect(resumed.items[0].pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Beneficiario")).toMatchObject({ state: "saved", saveAttemptCount: 1 });
  });

  it("ricontrolla con GET un salvataggio già tentato senza incrementarne il contatore", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Beneficiario", "prepared-beneficiary", "lorena:beneficiary:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Beneficiario", "lorena:beneficiary:save-intent");
    runner.recordPageSaved("lorena-brendas", "DRAFT-100", "page:Beneficiario", "save-click-evidence", "lorena:beneficiary:saved");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_page_navigation_not_found:page:Immobile", "immobile-navigation-error", "lorena:blocked:immobile-navigation");
    const resumed = runner.resumeReadOnlyVerificationOfPriorPageSave("lorena-brendas", "page:Beneficiario", "immobile-navigation-error", "lorena:verify-beneficiary-save");
    const item = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "save_intent_recorded", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [] });
    expect(item.pageCheckpoints[0]).toMatchObject({ pageId: "page:Beneficiario", state: "save_intent_recorded", saveAttemptCount: 1 });
  });

  it("riprende un salvataggio pagina incerto soltanto in GET e conserva l'unico tentativo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Beneficiario", "prepared-beneficiary", "lorena:beneficiary:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Beneficiario", "lorena:beneficiary:save-intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Esito salvataggio pagina page:Beneficiario non dimostrabile dopo click-evidence; nessun retry.", "uncertain-page", "lorena:blocked:uncertain-page");
    const resumed = runner.resumeReadOnlyVerificationOfUncertainPageSave("lorena-brendas", "page:Beneficiario", "uncertain-page", "lorena:verify-uncertain-page");
    const item = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "save_intent_recorded", createAttemptCount: 1, saveAttemptCount: 0 });
    expect(item.pageCheckpoints[0]).toMatchObject({ pageId: "page:Beneficiario", state: "save_intent_recorded", saveAttemptCount: 1 });
  });

  it("riprende in sola lettura anche il checkpoint incerto generato dal worker reale", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    const pageId = runner.load().items[0].expectedPageIds.find((candidate) => /Generatore/.test(candidate))!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, "generator-prepared", "lorena:generator:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, "lorena:generator:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "generator-timeout", "lorena:generator:uncertain");

    const resumed = runner.resumeReadOnlyVerificationOfUncertainPageSave("lorena-brendas", pageId, "generator-summary-get", "lorena:generator:verify-get");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "save_intent_recorded", uncertainPageSave: { status: "probing" } });
    expect(resumed.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1 });
  });

  it("registra il generatore come staged e rinvia la prova server al Salva impianto", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    const generatorPageId = runner.load().items[0].expectedPageIds.find((pageId) => /Generatore/.test(pageId))!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", generatorPageId, "generator-prepared", "lorena:generator:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", generatorPageId, "lorena:generator:save-intent");
    const staged = runner.recordNestedPageStaged("lorena-brendas", "DRAFT-100", generatorPageId, "generator-staged-dom", "lorena:generator:staged");
    const item = staged.items[0];
    expect(item).toMatchObject({ state: "filling", completedPageIds: [generatorPageId], saveAttemptCount: 0 });
    expect(item.reason).toContain("prova server ancora obbligatoria");
    expect(item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === generatorPageId)).toMatchObject({ state: "saved", saveAttemptCount: 1, savedEvidenceId: "generator-staged-dom" });
    expect(staged.audit.at(-1)).toMatchObject({ type: "nested_page_staged" });
  });

  it("sostituisce la prova staged dell'allocazione 36% con la prova server dopo il Salva Calcolo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare({
      status: "completed",
      sourceFingerprint: "allocation-staged-source",
      items: [{
        customerKey: "allocation-case",
        displayName: "Allocation Case",
        practiceId: "crm-allocation",
        state: "ready_local_plan",
        report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-allocation", requiredPortalFieldCount: 2, portalGate: { status: "ready", workflowFingerprint: "workflow-allocation", supportedPages: ["Allocazione costi e detrazioni", "Calcolo costi e detrazioni"], screeningItemCount: 0 } } },
      }, {
        customerKey: "allocation-isolated-fixture",
        displayName: "Allocation Isolated Fixture",
        practiceId: "crm-allocation-isolated",
        state: "blocked_case",
        report: { outcome: "blocked_case", blockers: [{ code: "fixture" }] },
      }],
    } as never);
    runner.recordSessionReady("session", "allocation:session");
    runner.recordCreateIntent("allocation-case", "allocation:create");
    runner.recordDraftCreated("allocation-case", "DRAFT-36", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-36", "draft-created", "allocation:created");
    runner.recordPagePrepared("allocation-case", "DRAFT-36", "page:Allocazione costi e detrazioni", "allocation-prepared", "allocation:prepared");
    runner.recordPageSaveIntent("allocation-case", "DRAFT-36", "page:Allocazione costi e detrazioni", "allocation:intent");
    runner.recordNestedPageStaged("allocation-case", "DRAFT-36", "page:Allocazione costi e detrazioni", "modal-click-staged", "allocation:staged");
    expect(runner.snapshot().items[0].serverEvidenceIds).not.toContain("modal-click-staged");
    runner.recordPagePrepared("allocation-case", "DRAFT-36", "page:Calcolo costi e detrazioni", "calculation-prepared", "calculation:prepared");
    runner.recordPageSaveIntent("allocation-case", "DRAFT-36", "page:Calcolo costi e detrazioni", "calculation:intent");

    const verified = runner.recordNestedPageServerVerifiedAfterOuterSave("allocation-case", "DRAFT-36", "page:Allocazione costi e detrazioni", "page:Calcolo costi e detrazioni", "allocation-server-get", "allocation:server-verified");
    const item = verified.items[0];
    expect(item.pageCheckpoints.find((page) => page.pageId === "page:Allocazione costi e detrazioni")).toMatchObject({ state: "saved", saveAttemptCount: 1, savedEvidenceId: "allocation-server-get" });
    expect(item.pageCheckpoints.find((page) => page.pageId === "page:Calcolo costi e detrazioni")).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1 });
    expect(verified.audit.at(-1)).toMatchObject({ type: "nested_page_server_verified_after_outer_save" });
  });

  it("accetta come prova il redirect server Beneficiario→Immobile della stessa bozza senza nuovo Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Beneficiario", "prepared-beneficiary", "lorena:beneficiary:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Beneficiario", "lorena:beneficiary:save-intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Esito salvataggio pagina page:Beneficiario non dimostrabile; nessun retry.", "uncertain-page", "lorena:blocked:uncertain-page");
    const resumed = runner.recordPageSavedFromServerRedirect("lorena-brendas", "page:Beneficiario", "server-redirect", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/immobile/DRAFT-100", "lorena:server-redirect");
    const item = resumed.items[0];
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(item).toMatchObject({ state: "filling", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"] });
    expect(item.pageCheckpoints[0]).toMatchObject({ pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1, savedEvidenceId: "server-redirect" });
  });

  it("accetta come prova il redirect server Immobile→Intervento conservando un Salva per pagina", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Beneficiario", "prepared-beneficiary", "lorena:beneficiary:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Beneficiario", "lorena:beneficiary:save-intent");
    runner.recordPageSaved("lorena-brendas", "DRAFT-100", "page:Beneficiario", "beneficiary-redirect", "lorena:beneficiary:saved");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Immobile", "prepared-property", "lorena:property:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Immobile", "lorena:property:save-intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Esito salvataggio pagina page:Immobile non dimostrabile; nessun retry.", "uncertain-property", "lorena:blocked:uncertain-property");
    const resumed = runner.recordPageSavedFromServerRedirect("lorena-brendas", "page:Immobile", "property-redirect", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/intervento/DRAFT-100", "lorena:property:server-redirect");
    const item = resumed.items[0];
    expect(item).toMatchObject({ state: "filling", completedPageIds: ["page:Beneficiario", "page:Immobile"] });
    expect(item.pageCheckpoints.slice(0, 2)).toEqual([expect.objectContaining({ pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1 }), expect.objectContaining({ pageId: "page:Immobile", state: "saved", saveAttemptCount: 1 })]);
  });

  it("accetta il redirect tecnico Intervento→Impianto ma rifiuta rotte mutative o di errore", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    for (const [index, pageId] of ["page:Beneficiario", "page:Immobile"].entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, `prepared-${index}`, `prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, `intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-100", pageId, `saved-${index}`, `saved:${index}`);
    }
    runner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Intervento", "prepared-intervention", "prepared:intervention");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Intervento", "intent:intervention");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Esito salvataggio pagina page:Intervento non dimostrabile; nessun retry.", "uncertain-intervention", "blocked:intervention");
    const resumed = runner.recordPageSavedFromServerRedirect("lorena-brendas", "page:Intervento", "intervention-redirect", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/impianto_esistente/DRAFT-100", "redirect:intervention");
    expect(resumed.items[0]).toMatchObject({ state: "filling", completedPageIds: ["page:Beneficiario", "page:Immobile", "page:Intervento"] });
  });

  it("riaccoda una nuova generazione solo dopo cancellazione operatore e assenza server verificate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "424544", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/424544", "server-created-424544", "lorena:created:1");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Salvataggio non persistito; nessun ulteriore tentativo.", "server-not-saved", "lorena:blocked:not-saved");

    const requeued = runner.requeueAfterVerifiedDraftDeletion(
      "lorena-brendas",
      "424544",
      "server-dashboard-absence-424544",
      "operator-confirmed-deletion-424544",
      "lorena:requeue-after-deletion:v1",
    );
    expect(requeued).toMatchObject({ status: "ready", currentCustomerKey: null, sessionEvidenceId: null });
    expect(requeued.items[0]).toMatchObject({
      state: "queued",
      draftId: null,
      portalUrl: null,
      createAttemptCount: 0,
      saveAttemptCount: 0,
      completedPageIds: [],
      uncertainPageSave: null,
    });
    expect(requeued.items[0].pageCheckpoints.every((page) => page.state === "pending" && page.saveAttemptCount === 0 && page.recoverySaveAttemptCount === 0)).toBe(true);
    expect(requeued.items[0].serverEvidenceIds).toEqual(expect.arrayContaining(["server-created-424544", "server-not-saved", "server-dashboard-absence-424544", "operator-confirmed-deletion-424544"]));
    expect(requeued.audit.at(-1)).toMatchObject({ type: "verified_deleted_draft_requeued", commandId: "lorena:requeue-after-deletion:v1" });

    const replayed = runner.requeueAfterVerifiedDraftDeletion("lorena-brendas", "424544", "different-server-proof", "different-operator-proof", "lorena:requeue-after-deletion:v1");
    expect(replayed.revision).toBe(requeued.revision);
    runner.recordSessionReady("dom-server-auth-2", "session:ready:2");
    expect(runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:2").items[0]).toMatchObject({ state: "create_intent_recorded", createAttemptCount: 1, draftId: null });
  });

  it("riaccoda anche una bozza terminale salvata dopo cancellazione e assenza server verificate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "saved-delete:session");
    runner.recordCreateIntent("lorena-brendas", "saved-delete:create-intent");
    runner.recordDraftCreated("lorena-brendas", "424544", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/424544", "saved-delete:created", "saved-delete:created-command");
    for (const [index, pageId] of runner.snapshot().items[0]!.expectedPageIds.entries()) {
      runner.recordPagePrepared("lorena-brendas", "424544", pageId, `saved-delete:prepared:${index}`, `saved-delete:prepared-command:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "424544", pageId, `saved-delete:intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "424544", pageId, `saved-delete:saved:${index}`, `saved-delete:saved-command:${index}`);
    }
    runner.recordSaveIntent("lorena-brendas", "424544", "saved-delete:final-intent");
    runner.recordDraftSaved("lorena-brendas", "424544", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/424544", "saved-delete:final-proof", "saved-delete:final-saved");

    const requeued = runner.requeueAfterVerifiedDraftDeletion("lorena-brendas", "424544", "saved-delete:server-absence", "saved-delete:operator-confirmation", "saved-delete:requeue");
    expect(requeued.items[0]).toMatchObject({ state: "queued", draftId: null, createAttemptCount: 0, saveAttemptCount: 0, completedPageIds: [] });
    expect(requeued.items[0].pageCheckpoints.every((page) => page.state === "pending" && page.savedEvidenceId === null)).toBe(true);
  });

  it("riprende una route diretta pendente preservando ID bozza e pagine già salvate", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    runner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    for (const [index, pageId] of ["page:Beneficiario", "page:Immobile"].entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-100", pageId, `prepared-${index}`, `prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", pageId, `intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-100", pageId, `saved-${index}`, `saved:${index}`);
    }
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_page_navigation_not_found:page:Intervento", "direct-route-error", "blocked:direct-route");
    const resumed = runner.resumeCreatedDraftAfterDirectRouteCorrection("lorena-brendas", "direct-route-proof", "resume:direct-route:v46");
    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-100", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario", "page:Immobile"] });
    expect(resumed.items[0].pageCheckpoints.slice(0, 2)).toEqual([expect.objectContaining({ state: "saved", saveAttemptCount: 1 }), expect.objectContaining({ state: "saved", saveAttemptCount: 1 })]);
  });

  it("riprende solo la pagina Infissi dopo discovery preservando le pagine già salvate", () => {
    const directory = temporaryDirectory();
    mkdirSync(path.join(directory, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(directory, "cohort-seed", "checkpoint.json"), JSON.stringify({ audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }] }));
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare({ status: "completed", sourceFingerprint: "infissi-source", items: [{ customerKey: "katarzyna", displayName: "Katarzyna", practiceId: "crm-katarzyna", state: "ready_local_plan", report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: "mapping-katarzyna", requiredPortalFieldCount: 42, portalGate: { status: "ready", workflowFingerprint: "workflow-katarzyna", supportedPages: ["Beneficiario", "Immobile", "Serramenti e infissi"], screeningItemCount: 0 } } } }] } as never);
    runner.recordSessionReady("session-infissi", "infissi:session");
    runner.recordCreateIntent("katarzyna", "infissi:create");
    runner.recordDraftCreated("katarzyna", "424632", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/424632", "created-424632", "infissi:created");
    for (const pageId of ["page:Beneficiario", "page:Immobile"]) {
      runner.recordPagePrepared("katarzyna", "424632", pageId, `prepared-${pageId}`, `infissi:prepared:${pageId}`);
      runner.recordPageSaveIntent("katarzyna", "424632", pageId, `infissi:intent:${pageId}`);
      runner.recordPageSaved("katarzyna", "424632", pageId, `saved-${pageId}`, `infissi:saved:${pageId}`);
    }
    runner.recordCaseBlockedAndContinue("katarzyna", "Errore circoscritto alla pratica: apr_cdp_enea_infissi_contract_discovered:contract-v1", "contract-v1", "infissi:discovered");

    const resumed = runner.resumeCreatedDraftAfterInfissiContractDiscovery("katarzyna", "contract-v1", "infissi:resume:v2");

    expect(resumed).toMatchObject({ status: "running", currentCustomerKey: "katarzyna" });
    expect(resumed.items[0]).toMatchObject({ state: "filling", draftId: "424632", completedPageIds: ["page:Beneficiario", "page:Immobile"] });
    expect(resumed.items[0].pageCheckpoints).toEqual([
      expect.objectContaining({ pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1 }),
      expect.objectContaining({ pageId: "page:Immobile", state: "saved", saveAttemptCount: 1 }),
      expect.objectContaining({ pageId: "page:Serramenti e infissi", state: "pending", saveAttemptCount: 0 }),
    ]);
    expect(runner.resumeCreatedDraftAfterInfissiContractDiscovery("katarzyna", "different", "infissi:resume:v2").revision).toBe(resumed.revision);
  });

  it("accetta Schermature→Calcolo come prova server e tratta un timeout post-intento solo in lettura", () => {
    const redirectDirectory = temporaryDirectory();
    const redirectRunner = new PersistentAprEneaDraftExecution(redirectDirectory);
    const redirectFixture = preflightFixture() as { items: Array<{ customerKey: string; report?: { eneaPayloadAudit?: { portalGate?: { supportedPages?: string[] } } } }> };
    redirectFixture.items.find((item) => item.customerKey === "lorena-brendas")!.report!.eneaPayloadAudit!.portalGate!.supportedPages = ["Anagrafica Beneficiario", "Immobile", "Intervento", "Generatore dell'impianto termico", "Impianto termico esistente", "Schermature solari", "Calcolo costi e detrazioni"];
    redirectRunner.prepare(redirectFixture as never);
    redirectRunner.recordSessionReady("dom-server-auth-1", "session:ready:1");
    redirectRunner.recordCreateIntent("lorena-brendas", "lorena:create:intent:1");
    redirectRunner.recordDraftCreated("lorena-brendas", "DRAFT-100", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-100", "server-draft-100", "lorena:created:1");
    redirectRunner.recordPagePrepared("lorena-brendas", "DRAFT-100", "page:Schermature solari", "screenings-prepared", "screenings:prepared");
    redirectRunner.recordPageSaveIntent("lorena-brendas", "DRAFT-100", "page:Schermature solari", "screenings:save-intent");
    redirectRunner.recordCaseBlockedAndContinue("lorena-brendas", "Esito salvataggio pagina page:Schermature solari non dimostrabile; nessun retry.", "screenings-uncertain", "screenings:blocked");
    const redirected = redirectRunner.recordPageSavedFromServerRedirect("lorena-brendas", "page:Schermature solari", "screenings-server-redirect", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-100", "screenings:redirect");
    expect(redirected.items[0].pageCheckpoints.find((page) => page.pageId === "page:Schermature solari")).toMatchObject({ state: "saved", saveAttemptCount: 1, savedEvidenceId: "screenings-server-redirect" });

    const timeoutDirectory = temporaryDirectory();
    const timeoutRunner = new PersistentAprEneaDraftExecution(timeoutDirectory);
    timeoutRunner.prepare(preflightFixture());
    timeoutRunner.recordSessionReady("dom-server-auth-2", "session:ready:2");
    timeoutRunner.recordCreateIntent("lorena-brendas", "timeout:create:intent");
    timeoutRunner.recordDraftCreated("lorena-brendas", "DRAFT-101", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-101", "server-draft-101", "timeout:created");
    timeoutRunner.recordPagePrepared("lorena-brendas", "DRAFT-101", "page:Intervento", "intervention-prepared", "intervention:prepared");
    timeoutRunner.recordPageSaveIntent("lorena-brendas", "DRAFT-101", "page:Intervento", "intervention:save-intent");
    timeoutRunner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate", "timeout-after-intent", "intervention:timeout");
    const readonly = timeoutRunner.resumeReadOnlyVerificationOfUncertainPageSave("lorena-brendas", "page:Intervento", "timeout-after-intent", "intervention:readonly-only");
    expect(readonly.items[0].pageCheckpoints.find((page) => page.pageId === "page:Intervento")).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1 });
  });

  it("conserva tre prove inconcludenti dopo riavvio e lascia proseguire la coda senza un secondo Salva", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "uncertain:session");
    runner.recordCreateIntent("lorena-brendas", "uncertain:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U1", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U1", "draft-proof", "uncertain:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U1", pageId, "prepared-proof", "uncertain:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U1", pageId, "uncertain:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "timeout-proof", "uncertain:detected");
    for (const method of ["server_redirect", "persisted_fields_get", "server_metadata_get"] as const) {
      runner.recordUncertainPageSaveProbe("lorena-brendas", { method, outcome: "inconclusive", evidenceId: `probe-${method}`, reason: "Fixture senza prova conclusiva." }, `uncertain:probe:${method}`);
    }

    runner = new PersistentAprEneaDraftExecution(directory);
    const snapshot = runner.snapshot();
    expect(snapshot).toMatchObject({ status: "ready", currentCustomerKey: null, progress: { queued: 3, recoveryQueued: 0, blocked: 1 } });
    expect(snapshot.items[0]).toMatchObject({
      state: "operator_intervention",
      draftId: "DRAFT-U1",
      uncertainPageSave: { pageId, status: "operator_required", nextAction: expect.stringMatching(/bozza DRAFT-U1.*senza premere Salva.*SALVATA.*NON SALVATA.*INDETERMINABILE/), probes: expect.arrayContaining([
        expect.objectContaining({ method: "server_redirect", outcome: "inconclusive" }),
        expect.objectContaining({ method: "persisted_fields_get", outcome: "inconclusive" }),
        expect.objectContaining({ method: "server_metadata_get", outcome: "inconclusive" }),
      ]) },
      pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId, state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 })]),
    });
    const stale = JSON.parse(readFileSync(runner.checkpointPath, "utf8"));
    stale.items[0].uncertainPageSave.nextAction = "Operatore: confermare salvata, non salvata oppure indeterminabile allegando una prova.";
    stale.items[0].nextAction = stale.items[0].uncertainPageSave.nextAction;
    writeFileSync(runner.checkpointPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
    const upgraded = new PersistentAprEneaDraftExecution(directory).upgradeUncertainPageSaveOperatorInstructions("operator-instruction:v1");
    expect(upgraded.items[0].nextAction).toMatch(/bozza DRAFT-U1.*senza premere Salva.*SALVATA.*NON SALVATA.*INDETERMINABILE/);
    expect(upgraded.audit.at(-1)).toMatchObject({ type: "operator_instruction_upgraded" });
    expect(runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_metadata_get", outcome: "inconclusive", evidenceId: "probe-server_metadata_get", reason: "Fixture senza prova conclusiva." }, "uncertain:probe:server_metadata_get").revision).toBe(upgraded.revision);
    expect(() => runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_metadata_get", outcome: "saved", evidenceId: "different-proof", reason: "Duplicata." }, "uncertain:probe:duplicate")).toThrow("enea_uncertain_page_save_probe_method_already_recorded");
  });

  it("ripete una sola sonda read-only dopo timeout senza autorizzare o contare un secondo Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "transient-probe:session");
    runner.recordCreateIntent("lorena-brendas", "transient-probe:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-TP", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-TP", "draft-proof", "transient-probe:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-TP", pageId, "prepared-proof", "transient-probe:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-TP", pageId, "transient-probe:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "timeout-proof", "transient-probe:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", {
      method: "persisted_fields_get",
      outcome: "inconclusive",
      evidenceId: "transport-timeout",
      reason: "La sonda read-only non ha risposto: apr_cdp_command_timeout:Runtime.evaluate",
    }, "transient-probe:first-read");

    const requeued = runner.requeueTransientUncertainPageSaveProbe("lorena-brendas", "persisted_fields_get", "transient-probe:requeue");
    expect(requeued.items[0]).toMatchObject({
      state: "operator_intervention",
      uncertainPageSave: { status: "probing", probes: [] },
      pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId, state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 })]),
    });
    expect(requeued.audit.at(-1)).toMatchObject({ type: "uncertain_page_save_transient_probe_requeued" });
    expect(runner.requeueTransientUncertainPageSaveProbe("lorena-brendas", "persisted_fields_get", "transient-probe:requeue").revision).toBe(requeued.revision);
    expect(() => runner.requeueTransientUncertainPageSaveProbe("lorena-brendas", "persisted_fields_get", "transient-probe:requeue-other")).toThrow("enea_uncertain_page_save_transient_probe_requeue_state_invalid");
  });

  it("riapre le sole sonde Infissi dopo la correzione del classificatore N-1 senza ripetere Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "infissi-classifier:session");
    runner.recordCreateIntent("lorena-brendas", "infissi-classifier:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-IC", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-IC", "draft-proof", "infissi-classifier:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-IC", pageId, "prepared-proof", "infissi-classifier:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-IC", pageId, "infissi-classifier:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "timeout-proof", "infissi-classifier:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_redirect", outcome: "inconclusive", evidenceId: "redirect", reason: "Nessun redirect server conclusivo osservato." }, "infissi-classifier:redirect");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "fields", reason: "0/9 campi coincidono: prova non conclusiva." }, "infissi-classifier:fields");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "server_metadata_get", outcome: "inconclusive", evidenceId: "metadata", reason: "Metadato server assente." }, "infissi-classifier:metadata");
    const current = runner.load();
    current.items[0].uncertainPageSave!.pageId = "screening:10";
    current.items[0].pageCheckpoints[0].pageId = "screening:10";
    current.items[0].expectedPageIds[0] = "screening:10";
    current.items[0].completedPageIds = current.items[0].completedPageIds.filter((id) => id !== pageId);
    writeFileSync(runner.checkpointPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");

    const resumed = new PersistentAprEneaDraftExecution(directory);
    const requeued = resumed.requeueUncertainInfissiRowProbesAfterClassifierCorrection("lorena-brendas", "row-count-nine-proof", "infissi-classifier:requeue");
    expect(requeued.items[0]).toMatchObject({
      state: "operator_intervention",
      uncertainPageSave: { pageId: "screening:10", status: "probing", probes: [] },
      pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId: "screening:10", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 })]),
    });
  });

  it("rimette in coda un intento reclamato mentre il portale conserva il sotto-checkpoint di un altro caso", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "pending-order:session");
    runner.recordCreateIntent("lorena-brendas", "pending-order:create");

    const deferred = runner.deferActiveCreateIntentBehindPendingPortalIntent(
      "lorena-brendas",
      "samuele-colombo",
      "wizard-pending-proof",
      "pending-order:defer:v1",
    );

    expect(deferred).toMatchObject({ status: "ready", currentCustomerKey: null });
    expect(deferred.items[0]).toMatchObject({
      customerKey: "lorena-brendas",
      state: "queued",
      createAttemptCount: 1,
      recoverableCreateIntent: true,
      serverEvidenceIds: expect.arrayContaining(["wizard-pending-proof"]),
    });
    expect(deferred.audit.at(-1)).toMatchObject({
      type: "create_intent_deferred_behind_pending_portal_intent",
      commandId: "pending-order:defer:v1",
    });
  });

  it("migra un checkpoint legacy già verificato senza ripetere Salva né perdere idempotenza al riavvio", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "legacy:session");
    runner.recordCreateIntent("lorena-brendas", "legacy:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-L1", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-L1", "draft-proof", "legacy:created");
    const pageId = "page:Intervento";
    runner.recordPagePrepared("lorena-brendas", "DRAFT-L1", pageId, "prepared-proof", "legacy:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-L1", pageId, "legacy:first-save-intent");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate", "timeout-proof", "legacy:blocked");

    const migrated = runner.migrateLegacyUncertainPageSave("lorena-brendas", pageId, "timeout-proof", "legacy:migrate:v1");
    expect(migrated.items[0]).toMatchObject({
      state: "operator_intervention",
      createAttemptCount: 1,
      saveAttemptCount: 0,
      uncertainPageSave: { pageId, status: "probing", detectedEvidenceId: "timeout-proof", probes: [] },
      pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId, state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 })]),
    });
    expect(migrated.audit.at(-1)).toMatchObject({ type: "legacy_uncertain_page_save_migrated", commandId: "legacy:migrate:v1" });

    runner = new PersistentAprEneaDraftExecution(directory);
    const revisionAfterRestart = runner.snapshot().revision;
    expect(runner.migrateLegacyUncertainPageSave("lorena-brendas", pageId, "timeout-proof", "legacy:migrate:v1").revision).toBe(revisionAfterRestart);
    const resolved = runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "saved", evidenceId: "persisted-server-proof", reason: "La GET canonica coincide integralmente." }, "legacy:probe:persisted");
    expect(resolved.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "resolved_saved" } });
    expect(resolved.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0 });
  });

  it("ripete soltanto le sonde legacy dopo il ripristino auditato della mappatura", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "mapping:session");
    runner.recordCreateIntent("lorena-brendas", "mapping:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-M1", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-M1", "draft-proof", "mapping:created");
    const pageId = runner.snapshot().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-M1", pageId, "prepared-proof", "mapping:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-M1", pageId, "mapping:first-save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "timeout-proof", "mapping:detected");
    for (const method of ["server_redirect", "persisted_fields_get", "server_metadata_get"] as const) {
      runner.recordUncertainPageSaveProbe("lorena-brendas", { method, outcome: "inconclusive", evidenceId: `mapping-error-${method}`, reason: "La sonda legacy read-only non ha risposto: apr_cdp_enea_mapping_missing" }, `mapping:error:${method}`);
    }
    const before = runner.snapshot();
    const repaired = runner.requeueLegacyUncertainPageSaveProbesAfterMappingRepair("lorena-brendas", "mapping-server-proof", "mapping:repair:v1");
    expect(repaired.items[0]).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "probing", probes: [] } });
    expect(repaired.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 });
    expect(repaired.items[0].serverEvidenceIds).toContain("mapping-server-proof");
    expect(runner.requeueLegacyUncertainPageSaveProbesAfterMappingRepair("lorena-brendas", "mapping-server-proof", "mapping:repair:v1").revision).toBe(repaired.revision);
    expect(repaired.revision).toBe(before.revision + 1);
  });

  it("riprende la stessa bozza senza risalvare quando una prova read-only dimostra la persistenza", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "resolved:session");
    runner.recordCreateIntent("lorena-brendas", "resolved:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U2", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U2", "draft-proof", "resolved:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U2", pageId, "prepared-proof", "resolved:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U2", pageId, "resolved:save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "connessione chiusa dopo il click", "connection-proof", "resolved:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "saved", evidenceId: "persisted-get-proof", reason: "Tutti i valori coincidono." }, "resolved:probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    expect(runner.snapshot()).toMatchObject({ status: "ready", progress: { queued: 4, recoveryQueued: 1 } });
    runner.recordSessionReady("session-proof-2", "resolved:session-2");
    const resumed = runner.claimUncertainPageSaveRecovery("lorena-brendas", "resolved:claim");
    expect(resumed).toMatchObject({ currentCustomerKey: "lorena-brendas", status: "running" });
    expect(resumed.items[0]).toMatchObject({
      state: "filling",
      draftId: "DRAFT-U2",
      createAttemptCount: 1,
      uncertainPageSave: { status: "resolved_saved" },
      pageCheckpoints: expect.arrayContaining([expect.objectContaining({ pageId, state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0 })]),
    });
  });

  it("consente un solo recupero soltanto dopo prova operatore di non persistenza e non lo duplica al riavvio", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "retry:session");
    runner.recordCreateIntent("lorena-brendas", "retry:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U3", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U3", "draft-proof", "retry:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U3", pageId, "prepared-proof", "retry:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U3", pageId, "retry:first-save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "timeout-proof", "retry:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "empty-server-form", reason: "Tutti i campi significativi sono vuoti." }, "retry:not-saved-probe");
    runner.recordUncertainPageSaveOperatorDecision("lorena-brendas", "not_saved", "operatore-test", "operator-proof", "Pagina verificata vuota nella stessa bozza.", "retry:operator-decision");

    runner = new PersistentAprEneaDraftExecution(directory);
    runner.recordSessionReady("session-proof-2", "retry:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "retry:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U3", pageId, "recovery-prepared-proof", "retry:recovery-prepared");
    const intent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U3", pageId, "retry:recovery-save-intent");
    expect(intent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1, recoveryAuthorizedEvidenceId: "operator-proof" });

    runner = new PersistentAprEneaDraftExecution(directory);
    expect(() => runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U3", pageId, "retry:forbidden-third-intent")).toThrow();
    const saved = runner.recordPageSaved("lorena-brendas", "DRAFT-U3", pageId, "recovery-server-proof", "retry:recovery-saved");
    expect(saved.items[0]).toMatchObject({ state: "filling", uncertainPageSave: { status: "resolved_saved" } });
    expect(saved.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1, state: "saved" });
  });

  it("autorizza un solo recupero senza operatore quando la GET canonica prova che la stessa bozza è vuota", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "auto-retry:session");
    runner.recordCreateIntent("lorena-brendas", "auto-retry:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U5", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U5", "draft-proof", "auto-retry:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U5", pageId, "prepared-proof", "auto-retry:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U5", pageId, "auto-retry:first-save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout dopo il click", "timeout-proof", "auto-retry:detected");
    const authorized = runner.recordUncertainPageSaveProbe("lorena-brendas", {
      method: "persisted_fields_get",
      outcome: "not_saved",
      evidenceId: "canonical-empty-server-form",
      reason: "Tutti i campi significativi sono vuoti.",
      url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U5",
    }, "auto-retry:not-saved-probe");

    expect(authorized.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "recovery_authorized", operatorDecision: null } });
    expect(authorized.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-empty-server-form" });
    expect(authorized.audit.at(-1)).toMatchObject({ type: "uncertain_page_save_recovery_auto_authorized", appliedRuleIds: expect.arrayContaining(["system-atomic-checkpoint-resume"]) });

    runner = new PersistentAprEneaDraftExecution(directory);
    runner.recordSessionReady("session-proof-2", "auto-retry:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "auto-retry:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U5", pageId, "auto-recovery-prepared-proof", "auto-retry:recovery-prepared");
    const intent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U5", pageId, "auto-retry:single-recovery-intent");
    expect(intent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1 });
    expect(() => runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U5", pageId, "auto-retry:forbidden-extra-intent")).toThrow();
  });

  it("migra una prova server conclusiva già persistita verso il recupero automatico senza azzerare i contatori", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "legacy-proof:session");
    runner.recordCreateIntent("lorena-brendas", "legacy-proof:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U6", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U6", "draft-proof", "legacy-proof:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U6", pageId, "prepared-proof", "legacy-proof:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U6", pageId, "legacy-proof:first-save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "timeout-proof", "legacy-proof:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "legacy-empty-proof", reason: "Pagina vuota." }, "legacy-proof:probe");
    const checkpoint = JSON.parse(readFileSync(runner.checkpointPath, "utf8"));
    checkpoint.items[0].uncertainPageSave.probes[0].url = "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U6";
    writeFileSync(runner.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);

    runner = new PersistentAprEneaDraftExecution(directory);
    const migrated = runner.authorizeUncertainPageSaveRecoveryFromServerProof("lorena-brendas", "legacy-proof:auto-authorize:v1");
    expect(migrated.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "recovery_authorized", operatorDecision: null } });
    expect(migrated.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "legacy-empty-proof" });
    const revision = migrated.revision;
    expect(runner.authorizeUncertainPageSaveRecoveryFromServerProof("lorena-brendas", "legacy-proof:auto-authorize:v1").revision).toBe(revision);
  });

  it("riprende un recupero autorizzato dopo il solo riallineamento read-only della mappatura", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "mapping-recovery:session");
    runner.recordCreateIntent("lorena-brendas", "mapping-recovery:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-MAP", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-MAP", "draft-proof", "mapping-recovery:created");
    const pageId = runner.snapshot().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-MAP", pageId, "prepared-proof", "mapping-recovery:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-MAP", pageId, "mapping-recovery:first-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "timeout-proof", "mapping-recovery:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "canonical-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-MAP" }, "mapping-recovery:probe");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_enea_mapping_missing", "mapping-error-proof", "mapping-recovery:blocked");

    const resumed = runner.resumeAuthorizedRecoveryAfterMappingRepair("lorena-brendas", "canonical-rebind-proof", "mapping-recovery:resume:v1");
    expect(resumed.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-MAP", uncertainPageSave: { status: "recovery_authorized" } });
    expect(resumed.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-empty" });
    expect(resumed.audit.at(-1)).toMatchObject({ type: "authorized_recovery_mapping_rebound", commandId: "mapping-recovery:resume:v1" });
    expect(runner.resumeAuthorizedRecoveryAfterMappingRepair("lorena-brendas", "canonical-rebind-proof", "mapping-recovery:resume:v1").revision).toBe(resumed.revision);
  });

  it("riprende la stessa bozza quando il pacchetto torna disponibile senza ampliare il recupero autorizzato", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    const draftPackage: AprEneaDraftPackage = {
      module: "infissi",
      customerKey: "lorena-brendas",
      displayName: "Lorena Brendas",
      practiceId: "crm-lorena",
      packageFingerprint: "package-recovered",
      workflowFingerprint: "workflow-recovered",
      workflow: {
        supportedPages: ["Anagrafica Beneficiario"],
        screeningItemCount: 0,
        steps: [{ id: "beneficiary", pageName: "Anagrafica Beneficiario", markerIds: [], fields: [], successMessage: "ok" }],
        screeningSteps: [],
      },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
    runner.preparePackages([draftPackage, { ...draftPackage, customerKey: "milena-albertoni", displayName: "Milena Albertoni", practiceId: "crm-albertoni", packageFingerprint: "package-second" }], "package-source-v1");
    runner.recordSessionReady("session-proof", "package-recovery:session");
    runner.recordCreateIntent(draftPackage.customerKey, "package-recovery:create");
    runner.recordDraftCreated(draftPackage.customerKey, "DRAFT-PACKAGE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-PACKAGE", "draft-proof", "package-recovery:created");
    const pageId = runner.snapshot().items[0].expectedPageIds[0];
    runner.recordPagePrepared(draftPackage.customerKey, "DRAFT-PACKAGE", pageId, "prepared-proof", "package-recovery:prepared");
    runner.recordPageSaveIntent(draftPackage.customerKey, "DRAFT-PACKAGE", pageId, "package-recovery:first-intent");
    runner.recordUncertainPageSaveDetected(draftPackage.customerKey, pageId, "timeout", "timeout-proof", "package-recovery:uncertain");
    runner.recordUncertainPageSaveProbe(draftPackage.customerKey, { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "canonical-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-PACKAGE" }, "package-recovery:probe");
    runner.recordCaseBlockedAndContinue(draftPackage.customerKey, "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready", "package-error", "package-recovery:blocked");

    const resumed = runner.resumeAuthorizedRecoveryAfterPackageAvailability(draftPackage, draftPackage.packageFingerprint, "canonical-rebind-proof", "package-recovery:resume:v1");
    expect(resumed.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-PACKAGE", createAttemptCount: 1, saveAttemptCount: 0, uncertainPageSave: { status: "recovery_authorized" } });
    expect(resumed.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-empty" });
    expect(resumed.audit.at(-1)).toMatchObject({ type: "authorized_recovery_package_available", commandId: "package-recovery:resume:v1" });
    expect(runner.resumeAuthorizedRecoveryAfterPackageAvailability(draftPackage, draftPackage.packageFingerprint, "canonical-rebind-proof", "package-recovery:resume:v1").revision).toBe(resumed.revision);
  });

  it("riaccoda il recupero autorizzato dopo timeout pre-click senza consumarlo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "timeout-recovery:session");
    runner.recordCreateIntent("lorena-brendas", "timeout-recovery:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-TIMEOUT", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-TIMEOUT", "draft-proof", "timeout-recovery:created");
    const pageId = runner.snapshot().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-TIMEOUT", pageId, "prepared-proof", "timeout-recovery:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-TIMEOUT", pageId, "timeout-recovery:first-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "timeout-proof", "timeout-recovery:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "canonical-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-TIMEOUT" }, "timeout-recovery:probe");
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate", "runtime-timeout", "timeout-recovery:blocked");

    const resumed = runner.resumeAuthorizedRecoveryAfterTransientReadOnlyTimeout("lorena-brendas", "runtime-timeout", "timeout-recovery:resume:v1");
    expect(resumed.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-TIMEOUT", uncertainPageSave: { status: "recovery_authorized" } });
    expect(resumed.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "canonical-empty" });
    expect(runner.resumeAuthorizedRecoveryAfterTransientReadOnlyTimeout("lorena-brendas", "runtime-timeout", "timeout-recovery:resume:v1").revision).toBe(resumed.revision);
  });

  it("ricompila prima del recupero quando il controllo Salva manca e nessun click è stato emesso", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "preclick:session");
    runner.recordCreateIntent("lorena-brendas", "preclick:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U7", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U7", "draft-proof", "preclick:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U7", pageId, "prepared-proof", "preclick:prepared-primary");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U7", pageId, "preclick:first-save-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "timeout-proof", "preclick:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "empty-server-proof", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U7" }, "preclick:probe");
    runner.recordSessionReady("session-proof-2", "preclick:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "preclick:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U7", pageId, "prepared-recovery-proof", "preclick:prepared-recovery");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U7", pageId, "preclick:recovery-intent-old-generation");
    runner.recordCaseBlockedAndContinue("lorena-brendas", `Errore circoscritto alla pratica: apr_cdp_enea_unique_enabled_save_button_not_found:${pageId}`, "driver-error-preclick", "preclick:blocked");

    const requeued = runner.requeueUnclickedUncertainPageSaveRecovery("lorena-brendas", "driver-error-preclick", "preclick:requeue:v1");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-U7", uncertainPageSave: { status: "recovery_authorized" } });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, preparedEvidenceId: null, recoveryAuthorizedEvidenceId: "empty-server-proof" });

    runner = new PersistentAprEneaDraftExecution(directory);
    runner.recordSessionReady("session-proof-3", "preclick:session-3");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "preclick:claim-2");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U7", pageId, "prepared-recovery-proof-2", "preclick:prepared-recovery:new-generation");
    const intent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U7", pageId, "preclick:recovery-intent:new-generation");
    expect(intent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1 });
    expect(runner.requeueUnclickedUncertainPageSaveRecovery("lorena-brendas", "driver-error-preclick", "preclick:requeue:v1").revision).toBe(intent.revision);
  });

  it("chiude in fail-safe un recupero ancora incerto e vieta qualunque terzo tentativo", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "failure:session");
    runner.recordCreateIntent("lorena-brendas", "failure:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-U4", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U4", "draft-proof", "failure:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U4", pageId, "prepared-proof", "failure:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U4", pageId, "failure:first-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout primo tentativo", "timeout-proof", "failure:detected");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "empty-form-proof", reason: "Pagina vuota." }, "failure:probe");
    runner.recordUncertainPageSaveOperatorDecision("lorena-brendas", "not_saved", "operatore-test", "operator-proof", "Pagina verificata vuota.", "failure:operator");
    runner.recordSessionReady("session-proof-2", "failure:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "failure:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-U4", pageId, "failure-recovery-prepared-proof", "failure:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U4", pageId, "failure:recovery-intent");
    const blocked = runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "timeout recupero", "recovery-timeout-proof", "failure:recovery-failed");

    expect(blocked.items[0]).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "operator_required", reason: expect.stringContaining("unico recupero") } });
    expect(blocked.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1 });
    expect(() => runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U4", pageId, "failure:forbidden-third-intent")).toThrow();

    const resolved = runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "saved", evidenceId: "recovery-get-proof", reason: "La GET canonica coincide integralmente.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-U4" }, "failure:recovery-readonly-proof");
    expect(resolved.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "resolved_saved" } });
    expect(resolved.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 1, savedEvidenceId: "recovery-get-proof" });
    expect(() => runner.recordPageSaveIntent("lorena-brendas", "DRAFT-U4", pageId, "failure:still-forbidden-third-intent")).toThrow();
  });

  it("riaccoda una sola volta la stessa allocazione 36% dopo l'upgrade collaudato del contratto input", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const fixture = preflightFixture() as unknown as { items: Array<{ report: { eneaPayloadAudit: { portalGate: { supportedPages: string[] } } } }> };
    fixture.items[0].report.eneaPayloadAudit.portalGate.supportedPages.push("Allocazione costi e detrazioni");
    runner.prepare(fixture as never);
    runner.recordSessionReady("session-proof", "allocation-contract:session");
    runner.recordCreateIntent("lorena-brendas", "allocation-contract:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-36", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-36", "draft-proof", "allocation-contract:created");
    const pageId = "page:Allocazione costi e detrazioni";
    runner.recordPagePrepared("lorena-brendas", "DRAFT-36", pageId, "primary-prepared-proof", "allocation-contract:primary-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-36", pageId, "allocation-contract:primary-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout primo tentativo", "primary-timeout-proof", "allocation-contract:primary-uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "primary-empty-proof", reason: "Campo 36% vuoto.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-36" }, "allocation-contract:primary-probe");
    runner.recordSessionReady("session-proof-2", "allocation-contract:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "allocation-contract:claim-recovery");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-36", pageId, "recovery-prepared-proof", "allocation-contract:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-36", pageId, "allocation-contract:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "timeout recupero", "recovery-timeout-proof", "allocation-contract:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "recovery-empty-proof", reason: "Campo 36% ancora vuoto.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-36" }, "allocation-contract:recovery-probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    const requeued = runner.requeueCalculationAllocationAfterInputContractUpgrade("lorena-brendas", "software-contract:calculation-36-real-browser-input-v2", "allocation-contract:auto-requeue:v2");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-36", uncertainPageSave: { status: "recovery_authorized" } });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, preparedEvidenceId: null, savedEvidenceId: null, recoveryAuthorizedEvidenceId: "software-contract:calculation-36-real-browser-input-v2" });
    expect(requeued.audit.at(-1)).toMatchObject({ type: "calculation_allocation_input_contract_requeued", commandId: "allocation-contract:auto-requeue:v2" });

    runner = new PersistentAprEneaDraftExecution(directory);
    const revision = runner.snapshot().revision;
    expect(runner.requeueCalculationAllocationAfterInputContractUpgrade("lorena-brendas", "software-contract:calculation-36-real-browser-input-v2", "allocation-contract:auto-requeue:v2").revision).toBe(revision);
    runner.recordSessionReady("session-proof-3", "allocation-contract:session-3");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "allocation-contract:claim-v2");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-36", pageId, "v2-prepared-proof", "allocation-contract:v2-prepared");
    const intent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-36", pageId, "allocation-contract:v2-intent");
    expect(intent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 });
  });

  it("riaccoda la stessa pagina standard dopo l'upgrade collaudato della consegna Salva senza duplicare la bozza", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "save-delivery:session");
    runner.recordCreateIntent("lorena-brendas", "save-delivery:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-SAVE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SAVE", "draft-proof", "save-delivery:created");
    const pageId = runner.load().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-SAVE", pageId, "primary-prepared", "save-delivery:primary-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SAVE", pageId, "save-delivery:primary-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "nessuna richiesta", "primary-timeout", "save-delivery:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "primary-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SAVE" }, "save-delivery:primary-probe");
    runner.recordSessionReady("session-proof-2", "save-delivery:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "save-delivery:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-SAVE", pageId, "recovery-prepared", "save-delivery:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SAVE", pageId, "save-delivery:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "nessuna richiesta", "recovery-timeout", "save-delivery:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "recovery-empty", reason: "Pagina ancora vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SAVE" }, "save-delivery:recovery-probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    const requeued = runner.requeueStandardPageAfterSaveDeliveryContractUpgrade("lorena-brendas", "software-contract:trusted-enter-zero-mutation-v1", "save-delivery:auto-requeue:v1");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-SAVE", createAttemptCount: 1, uncertainPageSave: { status: "recovery_authorized" } });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "software-contract:trusted-enter-zero-mutation-v1" });
    expect(requeued.audit.at(-1)).toMatchObject({ type: "standard_save_delivery_contract_requeued", commandId: "save-delivery:auto-requeue:v1" });
    expect(runner.requeueStandardPageAfterSaveDeliveryContractUpgrade("lorena-brendas", "software-contract:trusted-enter-zero-mutation-v1", "save-delivery:auto-requeue:v1").revision).toBe(requeued.revision);
  });

  it("riaccoda una sola volta l'Anagrafica dopo la selezione autorevole dei Comuni senza duplicare la bozza", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const fixture = preflightFixture() as unknown as { items: Array<{ report?: { eneaPayloadAudit?: { portalGate?: { supportedPages: string[] } } } }> };
    fixture.items[0].report!.eneaPayloadAudit!.portalGate!.supportedPages[1] = "Anagrafica Beneficiario";
    runner.prepare(fixture as never);
    runner.recordSessionReady("session-proof", "municipality:session");
    runner.recordCreateIntent("lorena-brendas", "municipality:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-COMUNE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-COMUNE", "draft-proof", "municipality:created");
    const pageId = "page:Anagrafica Beneficiario";
    runner.recordPagePrepared("lorena-brendas", "DRAFT-COMUNE", pageId, "primary-prepared", "municipality:primary-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-COMUNE", pageId, "municipality:primary-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "Comune non persistito", "primary-timeout", "municipality:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "primary-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-COMUNE" }, "municipality:primary-probe");
    runner.recordSessionReady("session-proof-2", "municipality:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "municipality:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-COMUNE", pageId, "recovery-prepared", "municipality:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-COMUNE", pageId, "municipality:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "Comune non persistito", "recovery-timeout", "municipality:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "recovery-empty", reason: "Pagina ancora vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-COMUNE" }, "municipality:recovery-probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    const requeued = runner.requeueBeneficiaryAfterMunicipalityAutocompleteContractUpgrade("lorena-brendas", "software-contract:authoritative-istat-v68", "municipality:auto-requeue:v68");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-COMUNE", createAttemptCount: 1, uncertainPageSave: { status: "recovery_authorized" } });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "software-contract:authoritative-istat-v68" });
    expect(requeued.audit.at(-1)).toMatchObject({ type: "municipality_autocomplete_contract_requeued", commandId: "municipality:auto-requeue:v68" });
    expect(runner.requeueBeneficiaryAfterMunicipalityAutocompleteContractUpgrade("lorena-brendas", "software-contract:authoritative-istat-v68", "municipality:auto-requeue:v68").revision).toBe(requeued.revision);
  });

  it("isola una bozza parziale quando la validazione rileva oltre 90 giorni e conserva ID e pagine", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    const fixture = preflightFixture() as unknown as { status: string; items: Array<Record<string, any>> };
    runner.prepare(fixture as never);
    runner.recordSessionReady("session-proof", "date-gate:session");
    runner.recordCreateIntent("lorena-brendas", "date-gate:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-DATE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-DATE", "draft-proof", "date-gate:created");
    const firstPage = runner.snapshot().items[0].expectedPageIds[0];
    runner.recordPagePrepared("lorena-brendas", "DRAFT-DATE", firstPage, "prepared-proof", "date-gate:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-DATE", firstPage, "date-gate:intent");
    runner.recordPageSaved("lorena-brendas", "DRAFT-DATE", firstPage, "saved-proof", "date-gate:saved");
    fixture.items[0].state = "blocked_case";
    fixture.items[0].report.blockers = [{ code: "completion_over_90_days_operator_required", field: "dates.completion", reason: "Fine lavori 2026-01-09: 226 giorni prima della lavorazione, oltre il limite di 90 giorni.", sourceIds: ["fattura"], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.completionOver90OperatorGate] }];
    for (const pageId of runner.snapshot().items[0].expectedPageIds.filter((pageId) => pageId !== firstPage)) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-DATE", pageId, `prepared-${pageId}`, `date-gate:prepared:${pageId}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-DATE", pageId, `date-gate:intent:${pageId}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-DATE", pageId, `saved-${pageId}`, `date-gate:saved:${pageId}`);
    }
    runner.recordSaveIntent("lorena-brendas", "DRAFT-DATE", "date-gate:final-intent");
    runner.recordDraftSaved("lorena-brendas", "DRAFT-DATE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-DATE", "final-proof", "date-gate:draft-saved");
    const gated = runner.applyValidationOperatorGates(fixture as never, "completion-date-operator-gate-v46");
    expect(gated.items[0]).toMatchObject({ state: "operator_intervention", draftId: "DRAFT-DATE" });
    expect(gated.items[0].operatorGateBlockers).toEqual([expect.objectContaining({
      code: "completion_over_90_days_operator_required",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.completionOver90OperatorGate],
    })]);
    expect(gated.items[0].completedPageIds).toHaveLength(gated.items[0].expectedPageIds.length);
    expect(gated.items[0].reason).toContain("226 giorni");
    expect(gated.items[0].nextAction).toContain("portale ENEA dell'anno corretto");
    expect(gated.audit.at(-1)).toMatchObject({ type: "validation_operator_gate_applied" });
    expect(runner.applyValidationOperatorGates(fixture as never, "completion-date-operator-gate-v46").revision).toBe(gated.revision);

    fixture.items[0].state = "ready_local_plan";
    fixture.items[0].report.blockers = [];
    const released = runner.releaseResolvedDateOperatorGates(["lorena-brendas"], "enea-2026-june25-deadline-window-v1");
    expect(released.items[0]).toMatchObject({ state: "saved", draftId: "DRAFT-DATE", operatorGateBlockers: [] });
    expect(released.items[0].completedPageIds).toHaveLength(released.items[0].expectedPageIds.length);
    expect(released.audit.at(-1)).toMatchObject({ type: "validation_operator_gate_released" });
    expect(runner.releaseResolvedDateOperatorGates(["lorena-brendas"], "enea-2026-june25-deadline-window-v1").revision).toBe(released.revision);
  });

  it("ripete solo la verifica read-only se la falsa prova not_saved proveniva da una tabella React assente", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const fixture = preflightFixture() as unknown as { items: Array<{ report: { eneaPayloadAudit: { portalGate: { supportedPages: string[] } } } }> };
    fixture.items[0].report.eneaPayloadAudit.portalGate.supportedPages.push("Allocazione costi e detrazioni");
    runner.prepare(fixture as never);
    runner.recordSessionReady("session-proof", "transient:session");
    runner.recordCreateIntent("lorena-brendas", "transient:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-TRANSIENT", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-TRANSIENT", "draft-proof", "transient:created");
    const pageId = "page:Allocazione costi e detrazioni";
    runner.recordPagePrepared("lorena-brendas", "DRAFT-TRANSIENT", pageId, "prepared", "transient:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-TRANSIENT", pageId, "transient:intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "verifica scaduta", "uncertain", "transient:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "missing-surface-primary", reason: "campi assenti", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-TRANSIENT" }, "transient:primary-probe");
    runner.recordSessionReady("session-proof-2", "transient:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "transient:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-TRANSIENT", pageId, "prepared-recovery", "transient:prepared-recovery");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-TRANSIENT", pageId, "transient:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "verifica scaduta", "recovery-uncertain", "transient:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "missing-surface-recovery", reason: "campi assenti", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-TRANSIENT" }, "transient:recovery-probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    const resumed = runner.resumeCalculationAllocationReadOnlyVerificationAfterTransientSurface("lorena-brendas", "missing-surface-recovery", "transient:resume-readonly");
    expect(resumed.items[0]).toMatchObject({ state: "operator_intervention", uncertainPageSave: { status: "probing", probes: [] } });
    expect(resumed.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1, state: "save_intent_recorded" });
    expect(resumed.audit.at(-1)).toMatchObject({ type: "calculation_allocation_transient_surface_reclassified" });
  });

  it("autorizza un solo recupero v8 dopo la prova reale del campo React e conserva consumato il tentativo primario", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const fixture = preflightFixture() as unknown as { items: Array<{ report: { eneaPayloadAudit: { portalGate: { supportedPages: string[] } } } }> };
    fixture.items[0].report.eneaPayloadAudit.portalGate.supportedPages.push("Allocazione costi e detrazioni");
    runner.prepare(fixture as never);
    runner.recordSessionReady("session", "v8:session");
    runner.recordCreateIntent("lorena-brendas", "v8:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-V8", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-V8", "created", "v8:created");
    const pageId = "page:Allocazione costi e detrazioni";
    runner.recordPagePrepared("lorena-brendas", "DRAFT-V8", pageId, "prepared", "v8:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-V8", pageId, "v8:intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "incerto", "uncertain", "v8:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "old-primary", reason: "50%=totale", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-V8" }, "v8:primary-probe");
    runner.recordSessionReady("session-2", "v8:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "v8:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-V8", pageId, "prepared-2", "v8:prepared-2");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-V8", pageId, "v8:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "incerto", "uncertain-2", "v8:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "inconclusive", evidenceId: "persisted-mismatch", reason: "50%=totale, 36%=0", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-V8" }, "v8:recovery-probe");

    runner = new PersistentAprEneaDraftExecution(directory);
    const requeued = runner.requeueCalculationAllocationAfterTrustedInputContractUpgrade("lorena-brendas", "modal-contract-v7", "persisted-mismatch", "v8:trusted-input");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", uncertainPageSave: { status: "recovery_authorized" } });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ state: "pending", saveAttemptCount: 1, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "modal-contract-v7" });
    runner.recordSessionReady("session-3", "v8:session-3");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "v8:claim-final");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-V8", pageId, "prepared-final", "v8:prepared-final");
    const intent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-V8", pageId, "v8:intent-final");
    expect(intent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 1 });
  });

  it("riusa la stessa bozza una sola volta quando un payload anagrafico corretto sostituisce dati provati non persistiti", () => {
    const directory = temporaryDirectory();
    let runner = new PersistentAprEneaDraftExecution(directory);
    const original = preflightFixture();
    runner.prepare(original);
    runner.recordSessionReady("session-proof", "payload-fix:session");
    runner.recordCreateIntent("lorena-brendas", "payload-fix:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-PAYLOAD", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-PAYLOAD", "draft-proof", "payload-fix:created");
    const pageId = runner.snapshot().items[0].expectedPageIds.find((page) => /beneficiario/i.test(page))!;
    runner.recordPagePrepared("lorena-brendas", "DRAFT-PAYLOAD", pageId, "primary-prepared", "payload-fix:primary-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-PAYLOAD", pageId, "payload-fix:primary-intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", pageId, "timeout", "primary-timeout", "payload-fix:primary-uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "primary-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-PAYLOAD" }, "payload-fix:primary-probe");
    runner.recordSessionReady("session-proof-2", "payload-fix:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "payload-fix:claim-recovery");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-PAYLOAD", pageId, "recovery-prepared", "payload-fix:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-PAYLOAD", pageId, "payload-fix:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", pageId, "timeout recupero", "recovery-timeout", "payload-fix:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "recovery-empty", reason: "Pagina ancora vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-PAYLOAD" }, "payload-fix:recovery-probe");

    const corrected = structuredClone(original) as any;
    corrected.items[0].report.eneaPayloadAudit.mappingFingerprint = "mapping-lorena-corrected";
    corrected.items[0].report.eneaPayloadAudit.portalGate.workflowFingerprint = "workflow-lorena-corrected";
    const requeued = runner.requeueVerifiedPayloadCorrection(corrected, "lorena-brendas", "readonly-rebind-proof", "payload-fix:requeue:v1");
    expect(requeued.items[0]).toMatchObject({
      state: "recovery_queued",
      draftId: "DRAFT-PAYLOAD",
      createAttemptCount: 1,
      mappingFingerprint: "mapping-lorena-corrected",
      workflowFingerprint: "workflow-lorena-corrected",
      uncertainPageSave: { status: "recovery_authorized" },
    });
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({
      state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "readonly-rebind-proof",
    });
    expect(requeued.audit.at(-1)).toMatchObject({ type: "verified_payload_correction_requeued", appliedRuleIds: expect.arrayContaining(["user-2026-08-16-fiscal-code-identity-cross-check"]) });
    expect(runner.requeueVerifiedPayloadCorrection(corrected, "lorena-brendas", "readonly-rebind-proof", "payload-fix:requeue:v1").revision).toBe(requeued.revision);

    runner = new PersistentAprEneaDraftExecution(directory);
    runner.recordSessionReady("session-proof-3", "payload-fix:session-3");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "payload-fix:claim-corrected");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-PAYLOAD", pageId, "corrected-prepared", "payload-fix:corrected-prepared");
    const correctedIntent = runner.recordPageSaveIntent("lorena-brendas", "DRAFT-PAYLOAD", pageId, "payload-fix:corrected-intent");
    expect(correctedIntent.items[0].pageCheckpoints.find((page) => page.pageId === pageId)).toMatchObject({ saveAttemptCount: 1, recoverySaveAttemptCount: 0 });
  });

  it("conserva le pagine precedenti quando corregge edificio a unita unica dopo GET vuota di Immobile", () => {
    const directory = temporaryDirectory();
    const original = preflightFixture() as any;
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(original);
    runner.recordSessionReady("session-proof", "single-unit:session");
    runner.recordCreateIntent("lorena-brendas", "single-unit:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-SINGLE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SINGLE", "draft-proof", "single-unit:created");
    const item = runner.snapshot().items[0];
    const immobile = item.expectedPageIds.find((page) => page === "page:Immobile")!;
    for (const [index, pageId] of item.expectedPageIds.slice(0, item.expectedPageIds.indexOf(immobile)).entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-SINGLE", pageId, `prepared-${index}`, `single-unit:prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SINGLE", pageId, `single-unit:intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-SINGLE", pageId, `saved-${index}`, `single-unit:saved:${index}`);
    }
    runner.recordPagePrepared("lorena-brendas", "DRAFT-SINGLE", immobile, "immobile-primary-prepared", "single-unit:immobile:prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SINGLE", immobile, "single-unit:immobile:intent");
    runner.recordUncertainPageSaveDetected("lorena-brendas", immobile, "timeout", "immobile-timeout", "single-unit:immobile:uncertain");
    runner.recordUncertainPageSaveProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "immobile-empty", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/immobile/DRAFT-SINGLE" }, "single-unit:immobile:probe");
    runner.recordSessionReady("session-proof-2", "single-unit:session-2");
    runner.claimUncertainPageSaveRecovery("lorena-brendas", "single-unit:claim");
    runner.recordPagePrepared("lorena-brendas", "DRAFT-SINGLE", immobile, "immobile-recovery-prepared", "single-unit:immobile:recovery-prepared");
    runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SINGLE", immobile, "single-unit:immobile:recovery-intent");
    runner.recordUncertainPageSaveRecoveryFailed("lorena-brendas", immobile, "timeout recupero", "immobile-recovery-timeout", "single-unit:immobile:recovery-failed");
    runner.recordUncertainPageSaveRecoveryProbe("lorena-brendas", { method: "persisted_fields_get", outcome: "not_saved", evidenceId: "immobile-recovery-empty", reason: "Pagina ancora vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/immobile/DRAFT-SINGLE" }, "single-unit:immobile:recovery-probe");

    const corrected = structuredClone(original) as any;
    corrected.items[0].report.buildingQualification = "single_unit";
    corrected.items[0].report.buildingUnitCount = 1;
    corrected.items[0].report.eneaPayloadAudit.mappingFingerprint = "mapping-lorena-single-unit";
    corrected.items[0].report.eneaPayloadAudit.portalGate.workflowFingerprint = "workflow-lorena-single-unit";
    const before = runner.snapshot().items[0].completedPageIds;
    const requeued = runner.requeueVerifiedRemainingPayloadCorrection(corrected, "lorena-brendas", "readonly-single-unit-rebind", "single-unit:requeue:v1");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-SINGLE", mappingFingerprint: "mapping-lorena-single-unit" });
    expect(requeued.items[0].completedPageIds).toEqual(before);
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === immobile)).toMatchObject({ state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: "readonly-single-unit-rebind" });
  });

  it("riapre soltanto Immobile su una bozza completa quando la GET isola la vecchia tipologia edificio", () => {
    const directory = temporaryDirectory();
    const original = preflightFixture() as any;
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(original);
    runner.recordSessionReady("session-proof", "saved-single:session");
    runner.recordCreateIntent("lorena-brendas", "saved-single:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-SAVED-SINGLE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-SAVED-SINGLE", "draft-proof", "saved-single:created");
    const pages = runner.snapshot().items[0].expectedPageIds;
    for (const [index, pageId] of pages.entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-SAVED-SINGLE", pageId, `prepared-${index}`, `saved-single:prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-SAVED-SINGLE", pageId, `saved-single:intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-SAVED-SINGLE", pageId, `saved-${index}`, `saved-single:saved:${index}`);
    }
    runner.recordSaveIntent("lorena-brendas", "DRAFT-SAVED-SINGLE", "saved-single:final-intent");
    runner.recordDraftSaved("lorena-brendas", "DRAFT-SAVED-SINGLE", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/DRAFT-SAVED-SINGLE", "final-server-proof", "saved-single:final-saved");

    const corrected = structuredClone(original) as any;
    corrected.items[0].report.buildingQualification = "single_unit";
    corrected.items[0].report.buildingUnitCount = 1;
    corrected.items[0].report.eneaPayloadAudit.mappingFingerprint = "mapping-lorena-saved-single";
    corrected.items[0].report.eneaPayloadAudit.portalGate.workflowFingerprint = "workflow-lorena-saved-single";
    const requeued = runner.requeueSavedDraftPageAfterVerifiedPayloadCorrection(corrected, "lorena-brendas", "page:Immobile", "readonly-old-building-type", "saved-single:requeue:v1");
    expect(requeued.items[0]).toMatchObject({ state: "recovery_queued", draftId: "DRAFT-SAVED-SINGLE", saveAttemptCount: 0, savedAt: null, mappingFingerprint: "mapping-lorena-saved-single" });
    expect(requeued.items[0].completedPageIds).not.toContain("page:Immobile");
    expect(requeued.items[0].pageCheckpoints.find((page) => page.pageId === "page:Immobile")).toMatchObject({ state: "pending", saveAttemptCount: 0, recoveryAuthorizedEvidenceId: "readonly-old-building-type" });
    expect(requeued.items[0].pageCheckpoints.filter((page) => page.pageId !== "page:Immobile").every((page) => page.state === "saved")).toBe(true);

    runner.recordSessionReady("session-proof-correction", "saved-single:session-correction");
    const claimed = runner.claimVerifiedPayloadCorrectionRecovery("lorena-brendas", "saved-single:claim-correction");
    expect(claimed).toMatchObject({ status: "running", currentCustomerKey: "lorena-brendas" });
    expect(claimed.items[0]).toMatchObject({ state: "filling", draftId: "DRAFT-SAVED-SINGLE" });
    expect(claimed.items[0].pageCheckpoints.find((page) => page.pageId === "page:Immobile")).toMatchObject({ state: "pending", saveAttemptCount: 0 });
  });

  it("recupera il gate finale dalla prova per-pagina durevole senza ripetere Salva", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    runner.prepare(preflightFixture());
    runner.recordSessionReady("session-proof", "checkpoint-final:session");
    runner.recordCreateIntent("lorena-brendas", "checkpoint-final:create");
    runner.recordDraftCreated("lorena-brendas", "DRAFT-CHECKPOINT", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-CHECKPOINT", "draft-proof", "checkpoint-final:created");
    const pages = runner.snapshot().items[0].expectedPageIds;
    for (const [index, pageId] of pages.entries()) {
      runner.recordPagePrepared("lorena-brendas", "DRAFT-CHECKPOINT", pageId, `prepared-${index}`, `checkpoint-final:prepared:${index}`);
      runner.recordPageSaveIntent("lorena-brendas", "DRAFT-CHECKPOINT", pageId, `checkpoint-final:intent:${index}`);
      runner.recordPageSaved("lorena-brendas", "DRAFT-CHECKPOINT", pageId, `saved-${index}`, `checkpoint-final:saved:${index}`);
    }
    runner.recordSaveIntent("lorena-brendas", "DRAFT-CHECKPOINT", "checkpoint-final:final-intent");
    const finalEvidenceId = runner.snapshot().items[0].pageCheckpoints.find((page) => page.pageId === "page:Calcolo costi e detrazioni")!.savedEvidenceId!;
    runner.recordCaseBlockedAndContinue("lorena-brendas", "Bozza completa e salvata non dimostrabile lato server; nessun retry.", "uncertain-draft", "checkpoint-final:isolated");

    const recovered = runner.recordDraftSavedFromDurableCheckpoint(
      "lorena-brendas",
      "https://bonusfiscali.enea.it/pratica/ecobonus/2026/riepilogo/DRAFT-CHECKPOINT",
      finalEvidenceId,
      "checkpoint-final:recovered",
      new Date("2026-08-18T08:30:00.000Z"),
    );
    expect(recovered.items[0]).toMatchObject({ state: "saved", draftId: "DRAFT-CHECKPOINT", savedAt: "2026-08-18T08:30:00.000Z", saveAttemptCount: 1 });
    expect(recovered.audit.at(-1)).toMatchObject({ type: "draft_saved_from_durable_checkpoint" });
  });

  it("rende sempre obbligatoria la pagina Calcolo per le schermature e rifiuta checkpoint falsamente conclusi", () => {
    const directory = temporaryDirectory();
    const runner = new PersistentAprEneaDraftExecution(directory);
    const prepared = runner.prepare(preflightFixture());
    const item = prepared.items.find((candidate) => candidate.customerKey === "lorena-brendas")!;
    expect(item.expectedPageIds).toContain("page:Calcolo costi e detrazioni");
    expect(item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Calcolo costi e detrazioni")).toMatchObject({ state: "pending", saveAttemptCount: 0 });

    const corrupted = JSON.parse(readFileSync(runner.checkpointPath, "utf8"));
    const corruptedItem = corrupted.items.find((candidate: { customerKey: string }) => candidate.customerKey === "lorena-brendas");
    corruptedItem.expectedPageIds = corruptedItem.expectedPageIds.filter((pageId: string) => pageId !== "page:Calcolo costi e detrazioni");
    corruptedItem.pageCheckpoints = corruptedItem.pageCheckpoints.filter((checkpoint: { pageId: string }) => checkpoint.pageId !== "page:Calcolo costi e detrazioni").map((checkpoint: Record<string, unknown>) => ({ ...checkpoint, state: "saved", saveAttemptCount: 1, savedEvidenceId: "server-proof" }));
    corruptedItem.completedPageIds = [...corruptedItem.expectedPageIds];
    corruptedItem.state = "saved";
    corruptedItem.draftId = "DRAFT-FALSE-COMPLETE";
    corruptedItem.savedAt = "2026-08-17T20:00:00.000Z";
    corruptedItem.serverEvidenceIds = ["server-proof"];
    writeFileSync(runner.checkpointPath, `${JSON.stringify(corrupted, null, 2)}\n`);

    const failClosed = new PersistentAprEneaDraftExecution(directory).load(new Date("2026-08-17T20:01:00.000Z"));
    expect(failClosed).toMatchObject({ status: "blocked_preflight", items: [] });
  });
});
