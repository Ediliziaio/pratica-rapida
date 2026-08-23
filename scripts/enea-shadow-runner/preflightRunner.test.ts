import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { ENEA_OPERATIONAL_REGISTRY_VERSION, USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "../../src/features/enea-shadow-crm/preflightContract";
import { renderDashboardHtml } from "./dashboard";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentEneaRunner } from "./runner";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function setupDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-preflight-runner-"));
  directories.push(directory);
  const readiness = new PersistentReadinessLease(directory);
  readiness.recordRealObservationVerifiedBeforeQueue("chrome", {
    readiness: {
      authorizedChromeVisible: true, crmDedicatedSessionVisible: true, crmAuthenticated: true,
      crmReadOnlyPageReachable: true, eneaSessionVisible: true, eneaAuthenticated: true,
      crmOriginAllowlisted: true, attachmentReadCapabilityVerified: true, eneaLeaseActive: true,
      persistentBrowserIdentityVerified: true,
    },
    keepalive: { ok: true, serverVerified: true, method: "GET", surface: "allowed_navigation", action: "reload root" },
    reason: "Readiness verde.", nextAction: "Preflight autorizzabile separatamente.",
  }, "readiness:green", new Date("2026-08-14T13:00:00.000Z"));
  return directory;
}

function conflictRun() {
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "screenings" ? "conflitto uno-a-molti" : "verificato",
    nextAction: step === "screenings" ? "operatore" : "prosegui",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  return runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true,
    requiredAssetsAcquired: true, economicSourcesClassified: true, identityPropertyComplete: true,
    datesComplete: false, financialTripleReconciled: true, screeningsReconciled: false,
    plantComplete: true, eneaMappingComplete: false, evidence,
  }, new Date("2026-08-14T13:01:00.000Z"));
}

function dateOnlyConflictRun() {
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "dates" ? "invoice-78-2025-05-06" : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? "465 giorni: gate oltre 90 giorni" : "verificato",
    nextAction: step === "dates" ? "operatore" : "prosegui",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  return runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true,
    requiredAssetsAcquired: true, economicSourcesClassified: true, identityPropertyComplete: true,
    datesComplete: false, financialTripleReconciled: true, screeningsReconciled: true,
    plantComplete: true, eneaMappingComplete: true, evidence,
  }, new Date("2026-08-14T13:02:00.000Z"));
}

function saraReadyOverrideRun(practiceId = "audit-sara-agostinelli") {
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "dates" ? "case-override:sara:date" : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? "override test Sara non propagabile" : "verificato",
    nextAction: "gate successivo",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  return runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true,
    requiredAssetsAcquired: true, economicSourcesClassified: true, identityPropertyComplete: true,
    datesComplete: true, financialTripleReconciled: true, screeningsReconciled: true,
    plantComplete: true, eneaMappingComplete: true, evidence,
    caseOverrides: [{
      id: "case-override:sara:date", practiceId, field: "intervento.data_fine_lavori", value: "2026-08-14",
      scope: "single_practice_test", propagation: "forbidden", authorizedAt: "2026-08-14T13:03:00.000Z",
      authorizationSource: "explicit_user_authorization", reason: "Solo test Sara.",
    }],
  }, new Date("2026-08-14T13:03:00.000Z"));
}

describe("preflight read-only persistente", () => {
  it("usa soltanto ID presenti nel registro unico per il ticket Sara", () => {
    expect(registryRule("authorized-10-intervento-data-fine-lavori")).not.toBeNull();
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.pergolaScreening)).not.toBeNull();
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.cristalScreening)).not.toBeNull();
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.missingCompletionDate)).not.toBeNull();
  });

  it("seleziona solo Sara, registra il ticket con regole e non avanza la coda", () => {
    const directory = setupDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T13:00:30.000Z"));
    const result = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: conflictRun(),
      sources: [{ sourceId: "form", kind: "form", verification: "verified", note: "form originario" }],
      appliedRuleIds: ["system-single-active-practice", "system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume", "core-form-first", "core-mapping-complete"],
      reason: "Conflitto reale Sara.",
      nextAction: "Fermarsi su Sara.",
    }, "preflight:sara", new Date("2026-08-14T13:01:01.000Z"));

    expect(result).toMatchObject({ revision: 1, runner: { status: "stopped", currentPracticeId: "audit-sara-agostinelli" } });
    expect(result.queue[0]).toMatchObject({ executionState: "operator_intervention", selectionCount: 1, preflightRun: { outcome: "requested_operator" } });
    expect(result.queue.slice(1).every((job) => job.executionState === "queued" && job.selectionCount === 0)).toBe(true);
    expect(result.audit.at(-1)).toMatchObject({ type: "preflight_conflict_recorded", appliedRuleIds: expect.arrayContaining(["core-form-first", "core-mapping-complete"]) });
    expect(renderDashboardHtml(result, new Date("2026-08-14T13:01:02.000Z"), null, null, new PersistentReadinessLease(directory).snapshot())).toContain("Conflitto reale Sara.");
  });

  it("è idempotente e ripristinabile senza riselezionare Sara", () => {
    const directory = setupDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const input = {
      run: conflictRun(), sources: [] as [],
      appliedRuleIds: ["system-single-active-practice", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
      reason: "Conflitto.", nextAction: "Stop Sara.",
    };
    const first = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", input, "same-command");
    const replay = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", input, "same-command");
    expect(replay.revision).toBe(first.revision);
    expect(replay.queue[0].selectionCount).toBe(1);
    expect(new PersistentEneaRunner(directory).load()).toEqual(first);
  });

  it("riesegue Sara senza riselezionarla, risolve tutte le righe e conserva solo il gate data", () => {
    const directory = setupDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: conflictRun(), sources: [],
      appliedRuleIds: ["system-single-active-practice", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
      reason: "Conflitto iniziale.", nextAction: "Stop Sara.",
    }, "sara:first", new Date("2026-08-14T13:01:00.000Z"));

    const appliedRuleIds = [
      "system-single-active-practice", "system-readonly-adapter-contract", "system-operator-block-fail-closed",
      "system-atomic-checkpoint-resume", "core-mapping-complete",
      USER_AUTHORIZED_RULE_IDS.pergolaScreening, USER_AUTHORIZED_RULE_IDS.cristalScreening,
      USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
    ];
    const result = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: dateOnlyConflictRun(),
      sources: [
        { sourceId: "invoice-78-line-1", kind: "document", verification: "verified", note: "pergola gTot 0,08" },
        { sourceId: "invoice-78-line-2", kind: "document", verification: "verified", note: "Cristal gTot 0,33" },
      ],
      appliedRuleIds,
      reason: "Righe risolte; resta solo il gate data oltre 90 giorni.",
      nextAction: "Verificare procedibilità temporale.",
    }, "sara:rules-v2", new Date("2026-08-14T13:02:00.000Z"));

    expect(result.revision).toBe(2);
    expect(result.queue[0]).toMatchObject({ executionState: "operator_intervention", selectionCount: 1, preflightRun: { outcome: "requested_operator" } });
    expect(result.queue[0].preflightRun?.steps.filter((step) => !step.ok).map((step) => step.step)).toEqual(["dates"]);
    expect(result.queue[0].practice.appliedRules).toEqual(expect.arrayContaining(appliedRuleIds));
    expect(result.audit.at(-1)).toMatchObject({ type: "preflight_conflict_recorded", appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.pergolaScreening, USER_AUTHORIZED_RULE_IDS.cristalScreening, USER_AUTHORIZED_RULE_IDS.missingCompletionDate]) });
    expect(result.queue.slice(1).every((job) => job.executionState === "queued" && job.selectionCount === 0)).toBe(true);

    const replay = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: dateOnlyConflictRun(), sources: [], appliedRuleIds,
      reason: "Righe risolte; resta solo il gate data oltre 90 giorni.", nextAction: "Verificare procedibilità temporale.",
    }, "sara:rules-v2", new Date("2026-08-14T13:03:00.000Z"));
    expect(replay.revision).toBe(2);
    expect(replay.queue[0].selectionCount).toBe(1);
  });

  it("rende verde soltanto Sara con override test non propagabile e prepara il gate successivo", () => {
    const directory = setupDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: dateOnlyConflictRun(), sources: [],
      appliedRuleIds: ["system-single-active-practice", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
      reason: "Gate data.", nextAction: "Override caso-specifico.",
    }, "sara:before-override", new Date("2026-08-14T13:02:00.000Z"));
    const input = {
      run: saraReadyOverrideRun(),
      sources: [{ sourceId: "case-override:sara:date", kind: "operator_policy" as const, verification: "verified" as const, note: "scope=single_practice_test; propagation=forbidden" }],
      appliedRuleIds: ["system-single-active-practice", "system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume", "core-mapping-complete"],
      reason: "Preflight Sara verde con override test non propagabile.",
      nextAction: "Gate successivo; non creare ENEA.",
    };
    const result = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", input, "sara:case-override", new Date("2026-08-14T13:03:00.000Z"));
    expect(result).toMatchObject({ revision: 2, runner: { status: "stopped", currentPracticeId: "audit-sara-agostinelli" } });
    expect(result.queue[0]).toMatchObject({ executionState: "checkpoint_resumable", selectionCount: 1, practice: { status: "preflight_ready", activeBlock: null }, preflightRun: { outcome: "ready", caseOverrides: [{ practiceId: "audit-sara-agostinelli", scope: "single_practice_test", propagation: "forbidden" }] } });
    expect(result.queue[0].preflightRun?.steps.every((step) => step.ok)).toBe(true);
    expect(result.audit.at(-1)?.type).toBe("preflight_ready_recorded");
    expect(result.queue.slice(1).every((job) => job.executionState === "queued" && job.selectionCount === 0 && !job.preflightRun?.caseOverrides?.length)).toBe(true);
    const replay = runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", input, "sara:case-override", new Date("2026-08-14T13:04:00.000Z"));
    expect(replay.revision).toBe(2);
    expect(replay.queue[0].selectionCount).toBe(1);
  });

  it("rifiuta un override caso-specifico riferito a un'altra pratica", () => {
    const directory = setupDirectory();
    const runner = new PersistentEneaRunner(directory);
    runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    expect(() => runner.recordAuthorizedReadOnlyPreflight("preflight", "audit-sara-agostinelli", {
      run: saraReadyOverrideRun("audit-samuele-colombo"), sources: [],
      appliedRuleIds: ["system-single-active-practice", "system-atomic-checkpoint-resume"],
      reason: "Override errato.", nextAction: "Stop.",
    }, "wrong-practice")).toThrow("Override caso-specifico non valido");
  });

  it("consente bozza salvata solo dopo preflight verde e mantiene submit fuori ambito", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    expect(()=>runner.beginAuthorizedDraft("draft","audit-sara-agostinelli","draft:too-early")).toThrow("preflight verde");
    runner.recordAuthorizedReadOnlyPreflight("preflight","audit-sara-agostinelli",{run:saraReadyOverrideRun(),sources:[],appliedRuleIds:["system-single-active-practice","system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"sara:green",new Date("2026-08-14T14:00:00Z"));
    const begun=runner.beginAuthorizedDraft("draft","audit-sara-agostinelli","draft:begin",new Date("2026-08-14T14:01:00Z"));
    expect(begun.queue[0]).toMatchObject({executionState:"draft_in_progress",draftRun:{status:"creating",policyRuleId:USER_AUTHORIZED_RULE_IDS.greenPreflightDraft}});
    runner.recordDraftCreated("draft","audit-sara-agostinelli","DRAFT-SARA-1","https://bonusfiscali.enea.it/pratiche/DRAFT-SARA-1","draft:created",new Date("2026-08-14T14:02:00Z"));
    const saved=runner.recordDraftSaved("draft","audit-sara-agostinelli","DRAFT-SARA-1","https://bonusfiscali.enea.it/pratiche/DRAFT-SARA-1",8,"draft:saved",new Date("2026-08-14T14:03:00Z"));
    expect(saved.queue[0]).toMatchObject({executionState:"draft_saved",draftRun:{status:"saved",evidenceCount:8}});
    expect(saved.runner.nextAction).toContain("Nessuna anteprima");
    expect(saved.audit.at(-1)?.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft);
    expect(saved.audit.slice(-3).map(e=>e.type)).toEqual(["draft_started","draft_created","draft_saved"]);
  });

  it("risolve il blocco CF da fatture originarie e riprende la stessa bozza senza duplicarla", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    runner.recordAuthorizedReadOnlyPreflight("preflight","audit-sara-agostinelli",{run:saraReadyOverrideRun(),sources:[],appliedRuleIds:["system-single-active-practice","system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"sara:green");
    runner.beginAuthorizedDraft("draft","audit-sara-agostinelli","draft:begin");
    runner.recordDraftCreated("draft","audit-sara-agostinelli","410713","https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/410713","draft:created");
    runner.recordDraftFailure("draft","audit-sara-agostinelli","ENEA live validation: Codice fiscale non valido","Verificare fonti.","draft:failed");
    const resolved=runner.resumeDraftAfterVerifiedFiscalCode("draft","audit-sara-agostinelli",{
      formFiscalCode:"GSTSRA67T64501O", resolvedFiscalCode:"GSTSRA67T64H501O", sourceDocumentIds:["invoice-76-2025-05-02","invoice-78-2025-05-06"],
      identity:{surname:"AGOSTINELLI",name:"SARA",birthDate:"1967-12-24",sex:"F",birthPlaceCode:"H501"},
    },"draft:resolved-cf");
    expect(resolved.queue[0]).toMatchObject({executionState:"draft_in_progress",draftRun:{status:"created",draftId:"410713",error:null},practice:{status:"preflight_ready",activeBlock:null}});
    expect(resolved.audit.at(-1)).toMatchObject({type:"draft_block_resolved",appliedRuleIds:expect.arrayContaining(["authorized-05-beneficiario-cf"])});
    expect(resolved.queue[0].practice.sources.filter(source=>source.sourceId.startsWith("sara-cf-resolution:"))).toHaveLength(2);
    const replay=runner.resumeDraftAfterVerifiedFiscalCode("draft","audit-sara-agostinelli",{formFiscalCode:"GSTSRA67T64501O",resolvedFiscalCode:"GSTSRA67T64H501O",sourceDocumentIds:["invoice-76-2025-05-02"],identity:{surname:"AGOSTINELLI",name:"SARA",birthDate:"1967-12-24",sex:"F",birthPlaceCode:"H501"}},"draft:resolved-cf");
    expect(replay.revision).toBe(resolved.revision);
    expect(replay.queue[0].draftRun?.draftId).toBe("410713");
  });

  it("fa prevalere unità=1 sui piani e riprende la stessa bozza senza duplicarla", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const practice="audit-zeno-righetti";
    runner.recordAuthorizedReadOnlyPreflight("preflight",practice,{run:saraReadyOverrideRun(practice),sources:[],appliedRuleIds:["system-single-active-practice","system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"zeno:green:initial");
    runner.beginAuthorizedDraft("draft",practice,"zeno:draft:begin");
    runner.recordDraftCreated("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/411015","zeno:draft:created");
    runner.recordDraftFailure("draft",practice,"Conflitto provvisorio piani/unità.","Rivalutare registro.","zeno:draft:failed");
    runner.recordAuthorizedReadOnlyPreflight("preflight",practice,{run:saraReadyOverrideRun(practice),sources:[],appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,"authorized-12-intervento-unita-totali-edificio","system-atomic-checkpoint-resume"],reason:"Unità unica esplicita; piani descrittivi.",nextAction:"Riprendere 411015."},"zeno:green:single-unit");
    const resumed=runner.resumeDraftAfterSingleUnitQualification("draft",practice,{draftId:"411015",totalUnits:1,floorDescription:"oltre tre piani",explicitPrimaryContradiction:false},"zeno:draft:resolved-building");
    expect(resumed.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_in_progress",draftRun:{status:"created",draftId:"411015",error:null},practice:{status:"preflight_ready",activeBlock:null}});
    expect(resumed.audit.at(-1)).toMatchObject({type:"draft_block_resolved",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,"authorized-12-intervento-unita-totali-edificio"])});
    expect(()=>runner.resumeDraftAfterSingleUnitQualification("draft",practice,{draftId:"411015",totalUnits:2,floorDescription:"oltre tre piani",explicitPrimaryContradiction:false},"zeno:draft:invalid-units")).toThrow("unità unica esplicita");
    expect(()=>runner.resumeDraftAfterSingleUnitQualification("draft",practice,{draftId:"411015",totalUnits:1,floorDescription:"oltre tre piani",explicitPrimaryContradiction:true},"zeno:draft:primary-conflict")).toThrow("unità unica esplicita");
  });

  it("riapre la stessa bozza salvata per correggere una cardinalità aggregata", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const practice="audit-zeno-righetti";
    runner.recordAuthorizedReadOnlyPreflight("preflight",practice,{run:saraReadyOverrideRun(practice),sources:[],appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,"system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"zeno:cardinality:green");
    runner.beginAuthorizedDraft("draft",practice,"zeno:cardinality:begin",new Date("2026-08-14T16:00:00Z"));
    runner.recordDraftCreated("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/411015","zeno:cardinality:created",new Date("2026-08-14T16:00:01Z"));
    runner.recordDraftSaved("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/411015",8,"zeno:cardinality:saved",new Date("2026-08-14T16:01:00Z"));
    const state=runner.load(); state.queue.find(job=>job.practice.id===practice)!.workflowTiming={startedAt:"2026-08-14T16:00:00Z",endedAt:"2026-08-14T16:01:00Z",totalDurationMs:60000,phases:[]}; state.revision+=1; runner.store.writeCheckpoint(state);
    const reopened=runner.reopenSavedDraftForCardinalityCorrection("draft",practice,{draftId:"411015",observedTechnicalRows:3,expectedTechnicalRows:5},"zeno:cardinality:reopen");
    expect(reopened.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_in_progress",draftRun:{status:"created",draftId:"411015",savedAt:null}});
    expect(reopened.audit.at(-1)).toMatchObject({type:"draft_block_resolved",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]),reason:expect.stringContaining("3→5")});
    expect(()=>runner.reopenSavedDraftForCardinalityCorrection("draft",practice,{draftId:"411015",observedTechnicalRows:5,expectedTechnicalRows:5},"zeno:cardinality:invalid")).toThrow("non coerente");
    runner.recordDraftSaved("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/411015",12,"zeno:cardinality:resaved",new Date("2026-08-14T16:02:00Z"));
    const audited=runner.recordExcludedProductCardinalityAudit("draft",practice,{
      draftId:"411015",sourceId:"invoice-fpr-374-26:row-2",product:"zanzariere",expectedPhysicalProducts:6,
      observedLedgerRows:6,excludedGrossTotal:3410,perPieceEvidence:"6 modelli/misure distinti dalla fattura originaria",
    },"zeno:excluded-cardinality:audit",new Date("2026-08-14T16:03:00Z"));
    expect(audited.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_saved",draftRun:{draftId:"411015",status:"saved"}});
    expect(audited.audit.at(-1)).toMatchObject({type:"excluded_product_cardinality_audited",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly]),reason:expect.stringContaining("6/6")});
    expect(runner.recordExcludedProductCardinalityAudit("draft",practice,{draftId:"411015",sourceId:"invoice-fpr-374-26:row-2",product:"zanzariere",expectedPhysicalProducts:6,observedLedgerRows:6,excludedGrossTotal:3410,perPieceEvidence:"6 modelli/misure distinti dalla fattura originaria"},"zeno:excluded-cardinality:audit").revision).toBe(audited.revision);
    expect(()=>runner.recordExcludedProductCardinalityAudit("draft",practice,{draftId:"411015",sourceId:"invoice-fpr-374-26:row-2",product:"zanzariere",expectedPhysicalProducts:6,observedLedgerRows:1,excludedGrossTotal:3410,perPieceEvidence:"aggregato"},"zeno:excluded-cardinality:bad")).toThrow("non riconciliato 1:1");
  });

  it("supera l'esclusione e riconcilia sei zanzariere 1:1 sulla stessa bozza", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const practice="audit-zeno-righetti";
    runner.recordAuthorizedReadOnlyPreflight("preflight",practice,{run:saraReadyOverrideRun(practice),sources:[],appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.zanzarieraScreening,USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,"system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"zeno:zanzariere:green");
    runner.beginAuthorizedDraft("draft",practice,"zeno:zanzariere:begin",new Date("2026-08-14T16:00:00Z"));
    runner.recordDraftCreated("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/411015","zeno:zanzariere:created",new Date("2026-08-14T16:00:01Z"));
    runner.recordDraftSaved("draft",practice,"411015","https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/411015",12,"zeno:zanzariere:old-saved",new Date("2026-08-14T16:01:00Z"));
    const state=runner.load(); state.queue.find(job=>job.practice.id===practice)!.workflowTiming={startedAt:"2026-08-14T16:00:00Z",endedAt:"2026-08-14T16:01:00Z",totalDurationMs:60000,phases:[]}; state.revision+=1; runner.store.writeCheckpoint(state);
    const reopened=runner.reopenSavedDraftForZanzariereInclusion("draft",practice,{draftId:"411015",existingTechnicalRows:5,zanzariereRows:6,previousQualifiedGross:8320.40,reconciledQualifiedGross:11730.40},"zeno:zanzariere:reopen",new Date("2026-08-14T16:02:00Z"));
    expect(reopened.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_in_progress",draftRun:{draftId:"411015",status:"created"}});
    expect(reopened.audit.at(-1)).toMatchObject({type:"draft_block_resolved",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.zanzarieraScreening,USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]),reason:expect.stringContaining("5→11")});
    const saved=runner.recordZanzariereDraftReconciled("draft",practice,{draftId:"411015",observedTechnicalRows:11,zanzariereRows:6,qualifiedGross:11730.40,totalScreeningAreaM2:54.887,evidenceCount:18,portalUrl:"https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/411015"},"zeno:zanzariere:saved",new Date("2026-08-14T16:03:00Z"));
    expect(saved.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_saved",draftRun:{draftId:"411015",status:"saved",evidenceCount:18}});
    expect(saved.audit.at(-1)).toMatchObject({type:"draft_saved",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.zanzarieraScreening,USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft]),reason:expect.stringContaining("11 righe fisiche")});
    const compared=runner.recordReadOnlyComparisonCompleted("comparison",practice,{draftId:"411015",startedAt:"2026-08-14T16:04:00Z",endedAt:"2026-08-14T16:05:00Z",comparedFieldCount:40,discrepancyCount:0,excludedFields:"dati impianto termico, risparmio energetico stimato, finestre protette, data fine lavori",sources:"bozza server e CRM/form/fatture originarie"},"zeno:comparison:complete",new Date("2026-08-14T16:05:00Z"));
    expect(compared.audit.at(-1)).toMatchObject({type:"readonly_comparison_completed",reason:expect.stringContaining("0 incongruenze verificabili"),appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.zanzarieraScreening,USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,"system-readonly-adapter-contract"])});
    expect(compared.queue.find(job=>job.practice.id===practice)).toMatchObject({executionState:"draft_saved",draftRun:{draftId:"411015",status:"saved"}});
    expect(()=>runner.recordZanzariereDraftReconciled("draft",practice,{draftId:"411015",observedTechnicalRows:10,zanzariereRows:6,qualifiedGross:11730.40,totalScreeningAreaM2:54.887,evidenceCount:18,portalUrl:"x"},"zeno:zanzariere:bad")).toThrow("non riconciliata");
  });

  it("disabilita anteprima e submit per ogni nuova bozza TEST salvata", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    runner.recordAuthorizedReadOnlyPreflight("preflight","audit-sara-agostinelli",{run:saraReadyOverrideRun(),sources:[],appliedRuleIds:["system-single-active-practice","system-atomic-checkpoint-resume"],reason:"Verde.",nextAction:"Bozza."},"sara:green");
    runner.beginAuthorizedDraft("draft","audit-sara-agostinelli","draft:begin");
    runner.recordDraftCreated("draft","audit-sara-agostinelli","410713","https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/410713","draft:created");
    runner.recordDraftSaved("draft","audit-sara-agostinelli","410713","https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/410713",5,"draft:saved");
    expect(()=>runner.beginAuthorizedTestFinalization("final","audit-sara-agostinelli","410713",true,"final:authorize")).toThrow("termina alla bozza completa e salvata");
  });

  it("parcheggia il legacy incerto, avvia la pratica successiva e audita le durate", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory,{allowPracticeOperationsForTest:true});
    const seeded=runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const legacy=structuredClone(seeded); legacy.revision=1; legacy.runner.currentPracticeId="audit-sara-agostinelli";
    legacy.queue[0].executionState="operator_intervention";
    legacy.queue[0].draftRun={status:"saved",preflightId:"p",policyRuleId:USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,draftId:"410713",portalUrl:"https://bonusfiscali.enea.it/pratica/ecobonus/2026/calcolo/410713",startedAt:"2026-08-14T14:00:00Z",savedAt:"2026-08-14T14:10:00Z",evidenceCount:5,error:null};
    legacy.queue[0].finalizationRun={mode:"test",policyRuleId:USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit,draftId:"410713",status:"uncertain",draftValidatedAt:"2026-08-14T14:11:00Z",validationEvidenceId:"e",previewOpenedAt:"2026-08-14T14:12:00Z",previewVerifiedAt:"2026-08-14T14:13:00Z",submitAttempts:1,submitIntentAt:"2026-08-14T14:14:00Z",serverObservedAt:"2026-08-14T14:15:00Z",cpid:null,error:"incerto"};
    runner.store.writeCheckpoint(legacy);
    const parked=runner.registerTestStopPolicyAndLegacyUncertain("workflow","audit-sara-agostinelli","legacy:park",new Date("2026-08-14T15:00:00Z"));
    expect(parked.queue[0].executionState).toBe("legacy_submit_uncertain");
    const started=runner.startAuthorizedReadOnlyPractice("workflow","audit-samuele-colombo","samuele:start",new Date("2026-08-14T15:01:00Z"));
    expect(started.runner.currentPracticeId).toBe("audit-samuele-colombo");
    runner.recordWorkflowPhase("workflow","audit-samuele-colombo",{phase:"customer_form",startedAt:"2026-08-14T15:01:00Z",endedAt:"2026-08-14T15:02:30Z",status:"completed"},"samuele:phase:form",new Date("2026-08-14T15:02:30Z"));
    const finished=runner.completeWorkflowTiming("workflow","audit-samuele-colombo","2026-08-14T15:03:00Z","samuele:timing:complete",new Date("2026-08-14T15:03:00Z"));
    expect(finished.queue[1].workflowTiming).toMatchObject({totalDurationMs:120000,phases:[{phase:"customer_form",durationMs:90000,status:"completed"}]});
  });

  it("rende non bloccante il superamento dei 90 giorni solo nel TEST e riprende il checkpoint senza override", () => {
    const directory=setupDirectory(); const runner=new PersistentEneaRunner(directory,{allowPracticeOperationsForTest:true}); runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    runner.startAuthorizedReadOnlyPractice("workflow","audit-sara-agostinelli","sara:start",new Date("2026-08-14T15:00:00Z"));
    runner.recordWorkflowPhase("workflow","audit-sara-agostinelli",{phase:"preflight",startedAt:"2026-08-14T15:00:00Z",endedAt:"2026-08-14T15:01:00Z",status:"blocked",blockReason:"148 giorni"},"sara:phase:blocked",new Date("2026-08-14T15:01:00Z"));
    runner.completeWorkflowTiming("workflow","audit-sara-agostinelli","2026-08-14T15:01:00Z","sara:timing:blocked",new Date("2026-08-14T15:01:00Z"));
    const evidence=Object.fromEntries(ENEA_PREFLIGHT_STEPS.map(step=>[step,{source:step==="dates"?"fattura + policy TEST":"fonti originarie",ruleVersion:ENEA_OPERATIONAL_REGISTRY_VERSION,reason:step==="dates"?"148 giorni: alert TEST non bloccante":"verificato",nextAction:"prosegui"}])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
    const ready=runEneaPreflight({sessionReady:true,customerFormAcquired:true,attachmentInventoryComplete:true,requiredAssetsAcquired:true,economicSourcesClassified:true,identityPropertyComplete:true,datesComplete:true,financialTripleReconciled:true,screeningsReconciled:true,plantComplete:true,eneaMappingComplete:true,evidence},new Date("2026-08-14T15:02:00Z"));
    runner.recordAuthorizedReadOnlyPreflight("workflow","audit-sara-agostinelli",{run:ready,sources:[{sourceId:"test-alert",kind:"operator_policy",verification:"verified",note:"productionPropagation=forbidden"}],appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert,USER_AUTHORIZED_RULE_IDS.missingCompletionDate,"system-atomic-checkpoint-resume"],reason:"Verde con alert TEST.",nextAction:"Bozza TEST."},"sara:green:test-alert",new Date("2026-08-14T15:02:00Z"));
    const resumed=runner.resumeWorkflowAfterTestDeadlineAlert("workflow","audit-sara-agostinelli",148,"sara:resume:test-alert",new Date("2026-08-14T15:02:01Z"));
    expect(resumed.queue[0]).toMatchObject({executionState:"checkpoint_resumable",practice:{status:"preflight_ready",activeBlock:null},workflowTiming:{endedAt:null,totalDurationMs:null,phases:[{phase:"preflight",status:"completed",blockReason:expect.stringContaining("produzione/reale esclusa")}]}});
    expect(resumed.queue[0].preflightRun?.caseOverrides ?? []).toEqual([]);
    expect(resumed.audit.at(-1)).toMatchObject({type:"workflow_resumed_after_test_alert",appliedRuleIds:expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert])});
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.missingCompletionDate)).toMatchObject({outcome:"requested_operator"});
  });
});
