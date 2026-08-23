import { describe, expect, it, vi } from "vitest";
import { IMPORT_CONFIRMATION_PHRASE, prepareSinglePracticeImport } from "./importBridge";
import { addFixtureEmailDraft, addSyntheticAttachment, applyBuildingUnitConsistencyGate, applyFiscalCodeResolutionGate, applyScreeningReconciliationGate, applyShadowWindowInputGate, applyTripleFinancialReconciliationGate, applyWorkCompletionDeadline, assignShadowCrm, canConfirmAndSubmitEnea, clearShadowCrmState, EMPTY_SHADOW_CRM_STATE, ENEA_SHADOW_CRM_STORAGE_KEY, hasOperationalRule, INTERNAL_PILOT_PROCEDURE, internalPilotCriteria, loadShadowCrmState, OFFICIAL_PILOT_FIXTURE_IDS, overrideHistoricalComparisonDeadline, pilotSessionId, prioritizeShadowCrm, protectedWindowSurface, recordEneaDescriptionPreviewConfirmed, recordEneaDescriptionPreviewOpened, recordEneaNativeConfirmAccepted, recordEneaPreflightRun, recordEneaServerOutcome, recordEneaSubmitClick, recordNonSubmittableShadowWindowResult, recordNonSubmittableShadowWindowSimulation, removeSyntheticAttachment, requestOperatorIntervention, resolveOperatorIntervention, resolveWorkDates, saveShadowCrmState, screeningReconciliationIssues, serializeShadowCrmAudit, serializeShadowCrmPractice, shadowGeneratorEfficiency, shadowGeneratorPower, shadowPlantDistribution, technicalValueWithProvenance, transitionShadowCrm, validateShadowWindowAudit } from "./workflow";
import { reconcileFinancialEvidence } from "./financialReconciliation";
import { birthNationFromProvince, deterministicProtectedWindowSurface, fiscalCodeMatchesIdentity, fiscalCodeMatchesPartialIdentity, isPortalManagedField, normalizeBuildingFingerprint, operationalRuleFor, repairFiscalCodeSingleOcrConfusable, residenceNationFromProvince, resolveBeneficiaryFiscalCode, resolveCoolingPerformance, resolveForeignBirthCountryFromFiscalCode, resolveScreeningMechanism, shadowWindowTestAssumptions, VERIFIED_FOREIGN_BIRTH_COUNTRIES, verifiedShadowWindowGlassType } from "./operationalRules";
import { ANPR_FOREIGN_COUNTRIES_SOURCE } from "./anprForeignBirthCountries.generated";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "./preflightContract";
import { ENEA_OPERATIONAL_REGISTRY_VERSION } from "./operationalRegistry";

describe("workflow CRM ombra", () => {
  const financiallyReconciledOnly = () => applyTripleFinancialReconciliationGate(EMPTY_SHADOW_CRM_STATE, reconcileFinancialEvidence([{
    sourceId: "fattura-demo", supplierId: "fornitore-demo", documentNumber: "1", documentDate: "2026-08-01",
    kind: "invoice", taxableAmount: 100, vatAmount: 22, grossTotal: 122, referencedAdvanceIds: [],
    interventionGrossAmount: 122, extractionConfidence: "certain",
  }]));
  const financiallyReconciled = () => {
    const evidence=Object.fromEntries(ENEA_PREFLIGHT_STEPS.map(step=>[step,{source:"fonti originarie",ruleVersion:ENEA_OPERATIONAL_REGISTRY_VERSION,reason:"ok",nextAction:"prosegui"}])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
    return recordEneaPreflightRun(financiallyReconciledOnly(), runEneaPreflight({sessionReady:true,customerFormAcquired:true,attachmentInventoryComplete:true,requiredAssetsAcquired:true,economicSourcesClassified:true,identityPropertyComplete:true,datesComplete:true,financialTripleReconciled:true,screeningsReconciled:true,plantComplete:true,eneaMappingComplete:true,evidence}));
  };
  it("risolve il CF solo da form valido o documento originario valido e coerente", () => {
    const valid = "RSSMRA80A01H501U";
    expect(resolveBeneficiaryFiscalCode({ formFiscalCode: valid })).toEqual({ source: "form", value: valid });

    const fromDocument = resolveBeneficiaryFiscalCode({
      formFiscalCode: "RSSMRA80A01H501X",
      originalDocumentFiscalCode: valid,
      documentCoherentWithIdentity: true,
    });
    expect(fromDocument).toEqual({ source: "original_document", value: valid });
    expect(resolveBeneficiaryFiscalCode({
      formFiscalCode: "LRSMLA52B50D122C",
      originalDocumentFiscalCode: valid,
      documentCoherentWithIdentity: true,
    })).toEqual({ source: "original_document", value: valid });
    const audited = applyFiscalCodeResolutionGate(EMPTY_SHADOW_CRM_STATE, fromDocument);
    expect(audited.audit.at(-1)?.type).toBe("valid-document-cf-over-invalid-form");

    const unresolved = resolveBeneficiaryFiscalCode({
      formFiscalCode: "RSSMRA80A01H501X",
      originalDocumentFiscalCode: valid,
      documentCoherentWithIdentity: false,
    });
    const blocked = applyFiscalCodeResolutionGate(EMPTY_SHADOW_CRM_STATE, unresolved);
    expect(blocked.operatorStatus).toBe("requested_operator");
    expect(blocked.exceptions[0]).toMatchObject({ field: "beneficiario.cf", status: "requested_operator" });
  });
  it("verifica localmente il CF documentale di Sara contro tutti i segmenti anagrafici", () => {
    const identity = { surname: "AGOSTINELLI", name: "SARA", birthDate: "1967-12-24", sex: "F" as const, birthPlaceCode: "H501" };
    expect(fiscalCodeMatchesIdentity("GSTSRA67T64H501O", identity)).toBe(true);
    expect(fiscalCodeMatchesIdentity("GSTSRA67T64501O", identity)).toBe(false);
    expect(fiscalCodeMatchesIdentity("GSTSRA67T64H501O", { ...identity, sex: "M" })).toBe(false);
  });
  it("verifica un CF di fattura contro i segmenti anagrafici del form senza inventare il codice comune", () => {
    const identity = { surname: "Lerose", name: "Amelia", birthDate: "1952-02-10", sex: "F" as const };
    expect(fiscalCodeMatchesPartialIdentity("LRSMLA52B50D122C", identity)).toBe(true);
    expect(fiscalCodeMatchesPartialIdentity("LRSMLA52B10D122C", identity)).toBe(false);
    expect(fiscalCodeMatchesPartialIdentity("LRSMLA52B50D222H", identity)).toBe(true);
    expect(fiscalCodeMatchesPartialIdentity("LRSMLA52B50D122X", identity)).toBe(false);
  });
  it("ripara un solo carattere OCR confondibile soltanto con checksum e anagrafica univoci", () => {
    expect(repairFiscalCodeSingleOcrConfusable({ fiscalCode: "RPORMO41512C075E", surname: "Ropa", name: "Romeo", birthDate: "1941-11-12" }))
      .toEqual({ original: "RPORMO41512C075E", corrected: "RPORMO41S12C075E", position: 8 });
    expect(repairFiscalCodeSingleOcrConfusable({ fiscalCode: "XXXXXXXXXXXXXXXX", surname: "Ropa", name: "Romeo", birthDate: "1941-11-12" })).toBeNull();
  });
  it("risolve soltanto i codici esteri presenti nel registro istituzionale versionato", () => {
    expect(Object.keys(VERIFIED_FOREIGN_BIRTH_COUNTRIES)).toHaveLength(196);
    expect(ANPR_FOREIGN_COUNTRIES_SOURCE).toMatchObject({
      generatedEntryCount: 196,
      sha256: "7ee819b8b1d4e7fbd80432136b7bfc45fde29d0b225cdfe3283374c1eba91687",
    });
    expect(resolveForeignBirthCountryFromFiscalCode("SKLKRZ81D47Z127F")).toMatchObject({
      placeCode: "Z127",
      country: "Polonia",
      sourceAuthority: "ANPR / MAECI",
      sourceId: "anpr-stati-esteri-maeci-z127",
    });
    expect(resolveForeignBirthCountryFromFiscalCode("LTNNRN87R57Z129Z")).toMatchObject({
      placeCode: "Z129",
      country: "Romania",
      sourceAuthority: "ANPR / MAECI",
      sourceId: "anpr-stati-esteri-maeci-z129",
    });
    expect(resolveForeignBirthCountryFromFiscalCode("BMBKNG66R44Z312Y")).toMatchObject({
      placeCode: "Z312",
      country: expect.stringContaining("Congo"),
      selectValue: "cod",
      sourceAuthority: "ANPR / MAECI",
      sourceId: "anpr-stati-esteri-maeci-z312",
    });
    expect(resolveForeignBirthCountryFromFiscalCode("MRTLNJ77L14Z600M")).toMatchObject({
      placeCode: "Z600",
      country: "Argentina",
      sourceAuthority: "ANPR / MAECI",
      sourceId: "anpr-stati-esteri-maeci-z600",
    });
    expect(resolveForeignBirthCountryFromFiscalCode("MRTLNJ77L14Z999V")).toBeNull();
    expect(resolveForeignBirthCountryFromFiscalCode("MRTLNJ77L14Z600X")).toBeNull();
  });
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
      financiallyReconciled(),
    );
    expect(transitionShadowCrm(review, "draft-email")).toBe(review);
  });

  it("registra assegnazioni e priorità sintetiche senza alterare pratiche concluse", () => {
    const assigned = assignShadowCrm(EMPTY_SHADOW_CRM_STATE, "operatore-demo-luca", new Date("2026-08-12T10:00:00Z"));
    const prioritized = prioritizeShadowCrm(assigned, "high", new Date("2026-08-12T10:00:01Z"));
    expect(prioritized).toMatchObject({ stage: "assigned", assignee: "operatore-demo-luca", priority: "high" });
    expect(prioritized.audit.map((event) => event.type)).toEqual(["assign-luca", "priority-high"]);
  });

  it("sospende sul dubbio e consente solo regola con riavvio o lavorazione manuale", () => {
    const assigned = assignShadowCrm(EMPTY_SHADOW_CRM_STATE, "operatore-demo-anna", new Date("2026-08-13T08:00:00Z"));
    const processing = transitionShadowCrm(assigned, "start", new Date("2026-08-13T08:00:01Z"));
    const waiting = requestOperatorIntervention(processing, {
      field: "schermature.0.superficie_finestrata",
      sources: ["modulo cliente", "fattura pertinente"],
      reason: "Superficie finestrata protetta non documentata.",
      options: ["Definire regola", "Da lavorare a mano"],
    }, new Date("2026-08-13T08:00:02Z"));
    expect(waiting.operatorStatus).toBe("requested_operator");
    expect(transitionShadowCrm(waiting, "review")).toBe(waiting);

    const restarted = resolveOperatorIntervention(waiting, waiting.exceptions[0].id, "rule_defined", "Data sorgente facoltativa.", new Date("2026-08-13T08:00:03Z"));
    expect(restarted).toMatchObject({ operatorStatus: "active", stage: "assigned" });
    expect(restarted.exceptions[0]).toMatchObject({ status: "rule_defined", resolutionReason: "Data sorgente facoltativa." });

    const secondWaiting = requestOperatorIntervention(restarted, { field: "campo_tecnico", sources: ["modulo cliente"], reason: "Dato assente.", options: ["Definire regola", "Da lavorare a mano"] });
    const manual = resolveOperatorIntervention(secondWaiting, secondWaiting.exceptions.at(-1)!.id, "manual_work", "Serve verifica documentale umana.");
    expect(manual.operatorStatus).toBe("manual_work");
    expect(transitionShadowCrm(manual, "start")).toBe(manual);
  });

  it("blocca oltre 90 giorni dalla fine lavori e non blocca entro il termine", () => {
    const day90 = applyWorkCompletionDeadline(EMPTY_SHADOW_CRM_STATE, "2026-05-15", new Date("2026-08-13T12:00:00Z"));
    expect(day90).toBe(EMPTY_SHADOW_CRM_STATE);
    const day92 = applyWorkCompletionDeadline(EMPTY_SHADOW_CRM_STATE, "2026-05-13", new Date("2026-08-13T12:00:00Z"));
    expect(day92.operatorStatus).toBe("requested_operator");
    expect(day92.exceptions[0]).toMatchObject({ field: "intervento.data_fine_lavori", status: "requested_operator" });
    expect(day92.exceptions[0].reason).toContain("92 giorni");
    expect(transitionShadowCrm(day92, "assign")).toBe(day92);
    expect(applyWorkCompletionDeadline(day92, "2026-05-13", new Date("2026-08-14T12:00:00Z"))).toBe(day92);
  });

  it("consente una deroga tracciata solo al confronto storico senza cambiare la regola standard", () => {
    const blocked = applyWorkCompletionDeadline(EMPTY_SHADOW_CRM_STATE, "2026-05-13", new Date("2026-08-13T12:00:00Z"));
    expect(overrideHistoricalComparisonDeadline(blocked, "", "historical_comparison")).toBe(blocked);
    const overridden = overrideHistoricalComparisonDeadline(blocked, "Caso storico autorizzato.", "historical_comparison", new Date("2026-08-13T12:01:00Z"));
    expect(overridden.operatorStatus).toBe("active");
    expect(overridden.exceptions[0]).toMatchObject({ status: "rule_defined", resolutionReason: "[OVERRIDE TEST STORICO] Caso storico autorizzato." });
    expect(overridden.audit.at(-1)?.type).toBe("historical-deadline-override");
    const freshCase = applyWorkCompletionDeadline(EMPTY_SHADOW_CRM_STATE, "2026-05-13", new Date("2026-08-13T12:02:00Z"));
    expect(freshCase.operatorStatus).toBe("requested_operator");
  });

  it("usa fonte verificata o superficie deterministica stabile per pratica+riga", () => {
    const identity = { practiceId: "CLAUDIO", rowId: "invoice-182-line-1" };
    const value = protectedWindowSurface("altra_schermatura", identity);
    expect(value).toBe(protectedWindowSurface("altra_schermatura", identity));
    expect(value).toBeGreaterThanOrEqual(1.9);
    expect(value).toBeLessThanOrEqual(3.1);
    expect(protectedWindowSurface("altra_schermatura", identity, undefined, 2.45)).toBe(2.45);
    expect(protectedWindowSurface("zanzariera", identity, { widthCm: 140, heightCm: 210 })).toBe(2.94);
    expect(protectedWindowSurface("zanzariera", identity)).toBeNull();
    expect(deterministicProtectedWindowSurface("CLAUDIO", "invoice-182-line-1")).toMatchObject({ policyVersion: "protected-window-v1", seed: "CLAUDIO:invoice-182-line-1" });
    expect(new Set(["r1", "r2", "r3", "r4"].map((rowId) => deterministicProtectedWindowSurface("P", rowId)?.value)).size).toBeGreaterThan(1);
  });

  it("deriva arganello e molla come manuali e segnala conflitti verificati", () => {
    expect(resolveScreeningMechanism("Tenda con ARGANELLO")).toMatchObject({ value: "manuale", conflict: false });
    expect(resolveScreeningMechanism("Comando a molle")).toMatchObject({ value: "manuale" });
    expect(resolveScreeningMechanism("Arganello", { value: "automatico", sourceId: "scheda-r1", verified: true }))
      .toEqual({ value: "automatico", source: "scheda-r1", conflict: true });
    expect(resolveScreeningMechanism("Schermatura senza movimentazione specificata"))
      .toEqual({ value: "manuale", source: "user_confirmed_operational_policy", conflict: false });
  });

  it("riconcilia uno-a-uno provenienza, riga fonte, area ed esposizione", () => {
    const sources = [
      { sourceKind: "invoice" as const, sourceDocumentId: "invoice-demo", sourceRowId: "line-1", areaM2: 7.6, protectedWindowAreaM2: 2.6, exposure: "sud_est" as const, mechanism: "automatico" as const },
      { sourceKind: "customer_form" as const, sourceDocumentId: "form-demo", sourceRowId: "screen-2", areaM2: 3.9, protectedWindowAreaM2: 2.4, exposure: "sud_ovest" as const, mechanism: "manuale" as const },
    ];
    const rows = [
      { rowId: "screening-1", ...sources[0] },
      { rowId: "screening-2", ...sources[1] },
    ];
    expect(screeningReconciliationIssues(sources, rows)).toEqual([]);
    const reconciled = applyScreeningReconciliationGate(EMPTY_SHADOW_CRM_STATE, sources, rows, new Date("2026-08-13T15:00:00Z"));
    expect(reconciled.operatorStatus).toBe("active");
    expect(reconciled.audit.at(-1)?.type).toBe("screening-rows-reconciled");
  });

  it("blocca quantità, area, duplicati e associazione riga-orientamento non riconciliati", () => {
    const sources = [
      { sourceKind: "invoice" as const, sourceDocumentId: "invoice-demo", sourceRowId: "line-1", areaM2: 7.6, protectedWindowAreaM2: 2.6, exposure: "sud_est" as const, mechanism: "automatico" as const },
      { sourceKind: "invoice" as const, sourceDocumentId: "invoice-demo", sourceRowId: "line-2", areaM2: 8.5, protectedWindowAreaM2: 2.8, exposure: "sud_ovest" as const, mechanism: "manuale" as const },
    ];
    const mismatched = [
      { rowId: "screening-1", ...sources[0], areaM2: 7.2, protectedWindowAreaM2: 2.2, exposure: "sud_ovest" as const, mechanism: "manuale" as const },
    ];
    const issues = screeningReconciliationIssues(sources, mismatched);
    expect(issues).toEqual(expect.arrayContaining(["quantita:2:1", "area:screening-1", "esposizione:screening-1"]));
    expect(issues).toEqual(expect.arrayContaining(["superficie-finestrata:screening-1", "meccanismo:screening-1"]));
    expect(issues.some((issue) => issue.startsWith("fonte-non-usata:"))).toBe(true);
    const blocked = applyScreeningReconciliationGate(EMPTY_SHADOW_CRM_STATE, sources, mismatched, new Date("2026-08-13T15:01:00Z"));
    expect(blocked.operatorStatus).toBe("requested_operator");
    expect(blocked.exceptions[0]).toMatchObject({ field: "schermature.righe_riconciliazione", status: "requested_operator" });
    expect(blocked.exceptions[0].reason).toContain("quantità, area, superficie finestrata, meccanismo e associazione riga-orientamento");

    const historicalPdf = [{ ...sources[0], sourceKind: "historical_enea_pdf" }] as unknown as typeof sources;
    expect(screeningReconciliationIssues(historicalPdf, [{ rowId: "screening-1", ...historicalPdf[0] }]))
      .toEqual(expect.arrayContaining([expect.stringContaining("fonte-non-valida:historical_enea_pdf:")]));
  });

  it("separa unità interessate e totale edificio e blocca incoerenze", () => {
    const ok = applyBuildingUnitConsistencyGate(EMPTY_SHADOW_CRM_STATE, { totalBuildingUnits: 12, affectedUnits: 1, buildingType: "over_three_floors", sources: ["form"] });
    expect(ok.audit.at(-1)?.type).toBe("building-units-reconciled");
    const blocked = applyBuildingUnitConsistencyGate(EMPTY_SHADOW_CRM_STATE, { totalBuildingUnits: 1, affectedUnits: 1, buildingType: "over_three_floors", sources: ["form"] });
    expect(blocked.exceptions[0]).toMatchObject({ field: "intervento.unita_edificio", status: "requested_operator" });
  });

  it("deriva inizio dal primo documento e fine dall'ultimo senza duplicarli", () => {
    expect(resolveWorkDates([
      { date: "2026-07-28", sourceDocumentId: "saldo", kind: "invoice" },
      { date: "2026-06-30", sourceDocumentId: "acconto", kind: "invoice" },
    ])).toEqual({ status: "resolved", startDate: "2026-06-30", completionDate: "2026-07-28", startSource: "acconto", completionSource: "saldo" });
    expect(resolveWorkDates([
      { date: "2026-07-29", sourceDocumentId: "form-fine", kind: "explicit_completion" },
      { date: "2026-07-28", sourceDocumentId: "saldo", kind: "invoice" },
      { date: "2026-06-30", sourceDocumentId: "acconto", kind: "invoice" },
    ])).toMatchObject({ status: "resolved", completionDate: "2026-07-29", completionSource: "form-fine" });
    expect(resolveWorkDates([
      { date: "2026-07-28", sourceDocumentId: "documento-non-fattura", kind: "pertinent_document" },
    ]).status).toBe("operator_required");
    expect(resolveWorkDates([]).status).toBe("operator_required");
  });

  it("distingue fonti verificate e fallback come assunzioni operative", () => {
    expect(technicalValueWithProvenance({ value: "centralizzato", sourceId: "form" }, { value: "autonomo", policyId: "default" }))
      .toMatchObject({ provenance: "verified_source", sourceId: "form" });
    expect(technicalValueWithProvenance(null, { value: 96.5, policyId: "policy-rendimento" }))
      .toEqual({ value: 96.5, sourceId: "policy-rendimento", provenance: "operational_assumption" });
    expect(technicalValueWithProvenance(null, null)).toBeNull();
  });

  it("accetta audit ShadoWindow solo con input completi e righe riconciliate", () => {
    const record = { version: "3.00", inputs: { province: "MI", eerOrGue: 6.2, glassType: "doppio-chiaro", protectedWindowAreaM2: 7.8, exposure: "SO", gtot: 0.15 }, outputKwhYear: 277.44, reconciledScreeningRowIds: ["r1", "r2", "r3"] };
    expect(validateShadowWindowAudit(record, ["r1", "r2", "r3"])).toEqual([]);
    expect(validateShadowWindowAudit({ ...record, inputs: {}, reconciledScreeningRowIds: ["r1"] }, ["r1", "r2"])).toEqual(expect.arrayContaining(["input:province", "righe-non-riconciliate"]));
  });

  it("usa la prima distribuzione disponibile salvo impianto a pavimento", () => {
    expect(shadowPlantDistribution("caloriferi")).toEqual({ strategy: "first_available", value: null });
    expect(shadowPlantDistribution("split")).toEqual({ strategy: "first_available", value: null });
    expect(shadowPlantDistribution("")).toEqual({ strategy: "first_available", value: null });
    expect(shadowPlantDistribution("riscaldamento_pavimento")).toEqual({ strategy: "explicit", value: "orizzontale ad anello" });
  });

  it("usa un rendimento indicativo stabile e variabile soltanto fuori da Ideal Sistem", () => {
    const first = shadowGeneratorEfficiency("CRM-PILOT-001", "Rivenditore Demo");
    const same = shadowGeneratorEfficiency("CRM-PILOT-001", "Rivenditore Demo");
    const values = Array.from({ length: 40 }, (_, index) => shadowGeneratorEfficiency(`CRM-PILOT-${index}`, "Rivenditore Demo"))
      .flatMap((result) => result.value ?? []);
    expect(first).toEqual(same);
    expect(first.source).toBe("indicative_fallback");
    expect(Math.min(...values)).toBeGreaterThanOrEqual(96.5);
    expect(Math.max(...values)).toBeLessThanOrEqual(99.1);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("non applica il fallback a Ideal Sistem o senza rivenditore verificato", () => {
    expect(shadowGeneratorEfficiency("CRM-PILOT-002", " Ideal-Sistem ")).toEqual({
      source: "operator_required", value: null, reason: "ideal_sistem",
    });
    expect(shadowGeneratorEfficiency("CRM-PILOT-002", "")).toEqual({
      source: "operator_required", value: null, reason: "missing_reseller",
    });
    expect(shadowGeneratorEfficiency("CRM-PILOT-002", "Ideal Sistem", 97.4)).toEqual({ source: "verified", value: 97.4 });
  });

  it("rende la potenza stabile per immobile e variabile tra impronte", () => {
    const building = normalizeBuildingFingerprint("Via Demo 10", "foglio 1 particella 2 sub 3");
    const sameBuilding = normalizeBuildingFingerprint(" VIA DÈMO, 10 ", "Foglio 1 - Particella 2 - Sub 3");
    expect(building).toBe(sameBuilding);
    expect(shadowGeneratorPower("PRATICA-A", building)).toEqual(shadowGeneratorPower("PRATICA-B", sameBuilding));
    expect(shadowGeneratorPower("PRATICA-A", building).source).toBe("building_fallback");
    const values = Array.from({ length: 60 }, (_, index) => shadowGeneratorPower(`PRATICA-${index}`).value);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(24.5);
    expect(Math.max(...values)).toBeLessThanOrEqual(33.5);
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(shadowGeneratorPower("PRATICA-A", null, 28.2)).toEqual({ source: "verified", value: 28.2 });
  });

  it("centralizza le regole note prima di aprire nuove eccezioni", () => {
    expect(hasOperationalRule("impianto.potenza")).toBe(true);
    expect(operationalRuleFor("impianto.rendimento")).toContain("Ideal Sistem");
    expect(hasOperationalRule("campo.nuovo")).toBe(false);
    expect(isPortalManagedField("immobile.codice_comune")).toBe(true);
    expect(isPortalManagedField("immobile.gradi_giorno")).toBe(true);
    expect(isPortalManagedField("immobile.zona_climatica")).toBe(true);
    expect(isPortalManagedField("immobile.fascia_solare")).toBe(true);
    expect(operationalRuleFor("impianto.eer_gue")).toContain("capacità frigorifera divisa per potenza elettrica");
    expect(operationalRuleFor("schermature.tipo_vetro")).toContain("policy operativa confermata dall'utente");
  });

  it("risolve gli input ShadoWindow soltanto da fonte o formula documentata", () => {
    expect(verifiedShadowWindowGlassType("vetro_doppio_basso_emissivo")).toEqual({
      source: "practice_source", value: "vetro_doppio_basso_emissivo",
    });
    expect(verifiedShadowWindowGlassType()).toEqual({
      source: "user_confirmed_operational_policy", value: "vetro_doppio_chiaro",
    });
    expect(resolveCoolingPerformance({ eer: 3.4 })).toEqual({ source: "verified_eer", value: 3.4, formula: null });
    expect(resolveCoolingPerformance({ gue: 1.25 })).toEqual({ source: "verified_gue", value: 1.25, formula: null });
    expect(resolveCoolingPerformance({ coolingCapacityKw: 7.1, absorbedPowerKw: 2 })).toEqual({
      source: "calculated_eer", value: 3.55, formula: "7.1 kW / 2 kW",
    });
    expect(resolveCoolingPerformance({ coolingCapacityKw: 7.1 })).toEqual({
      source: "user_confirmed_operational_policy", value: 6.2, formula: null,
    });
  });

  it("applica la policy operativa confermata dall'utente senza aprire ticket", () => {
    const resolved = applyShadowWindowInputGate(EMPTY_SHADOW_CRM_STATE, {
      glassType: null,
      cooling: {},
      eneaDraft: "preserved_not_submitted",
    }, new Date("2026-08-13T13:30:00Z"));
    expect(resolved.operatorStatus).toBe("active");
    expect(resolved.exceptions).toEqual([]);
    expect(resolved.audit.at(-1)).toEqual(expect.objectContaining({
      type: "shadowindow-user-confirmed-operational-policy-applied",
      at: "2026-08-13T13:30:00.000Z",
    }));
  });

  it("isola le assunzioni ShadoWindow dell'utente in modalità test non inviabile", () => {
    const assumptions = shadowWindowTestAssumptions("vetro_doppio_chiaro", 6.2);
    expect(assumptions).toEqual({
      mode: "test_not_submittable",
      glassType: "vetro_doppio_chiaro",
      coolingEfficiency: 6.2,
      suppliedBy: "user",
    });
    const audited = recordNonSubmittableShadowWindowSimulation(EMPTY_SHADOW_CRM_STATE, assumptions!);
    expect(audited.audit.at(-1)?.type).toBe("shadowindow-test-assumptions-non-submittable");
    expect(applyShadowWindowInputGate(audited, {
      glassType: assumptions!.glassType,
      cooling: { eer: assumptions!.coolingEfficiency },
      eneaDraft: "preserved_not_submitted",
    })).toBe(audited);
    const calculated = recordNonSubmittableShadowWindowResult(audited, 470.32);
    expect(calculated.audit.at(-1)?.type).toBe("shadowindow-test-result-470-32");
    expect(recordNonSubmittableShadowWindowResult(audited, Number.NaN)).toBe(audited);
    expect(shadowWindowTestAssumptions("vetro_doppio_chiaro", 0)).toBeNull();
  });

  it("abilita Conferma e invia solo dopo apertura e conferma/chiusura dell'anteprima ENEA", () => {
    expect(canConfirmAndSubmitEnea(EMPTY_SHADOW_CRM_STATE)).toBe(false);
    expect(recordEneaDescriptionPreviewConfirmed(EMPTY_SHADOW_CRM_STATE)).toBe(EMPTY_SHADOW_CRM_STATE);

    const opened = recordEneaDescriptionPreviewOpened(
      financiallyReconciled(),
      new Date("2026-08-13T14:00:00Z"),
    );
    expect(canConfirmAndSubmitEnea(opened)).toBe(false);
    expect(opened.audit.at(-1)?.type).toBe("enea-description-preview-opened");

    const confirmed = recordEneaDescriptionPreviewConfirmed(
      opened,
      new Date("2026-08-13T14:01:00Z"),
    );
    expect(canConfirmAndSubmitEnea(confirmed)).toBe(true);
    expect(confirmed.audit.at(-1)).toEqual(expect.objectContaining({
      type: "enea-description-preview-confirmed-closed",
      at: "2026-08-13T14:01:00.000Z",
    }));
    expect(recordEneaDescriptionPreviewConfirmed(confirmed)).toBe(confirmed);
  });

  it("impedisce doppio click e retry quando l'esito server è incerto", () => {
    const previewed = recordEneaDescriptionPreviewConfirmed(recordEneaDescriptionPreviewOpened(financiallyReconciled()));
    const clicked = recordEneaSubmitClick(previewed);
    expect(canConfirmAndSubmitEnea(clicked)).toBe(false);
    expect(recordEneaSubmitClick(clicked)).toBe(clicked);

    const accepted = recordEneaNativeConfirmAccepted(clicked);
    const uncertain = recordEneaServerOutcome(accepted, { status: "uncertain" });
    expect(uncertain.audit.at(-1)?.type).toBe("enea-server-outcome-uncertain-no-retry");
    expect(canConfirmAndSubmitEnea(uncertain)).toBe(false);
  });

  it("registra il successo solo dopo conferma nativa e CPID verificato", () => {
    const previewed = recordEneaDescriptionPreviewConfirmed(recordEneaDescriptionPreviewOpened(financiallyReconciled()));
    const clicked = recordEneaSubmitClick(previewed);
    expect(recordEneaServerOutcome(clicked, { status: "submitted", cpid: "CPID-DEMO" })).toBe(clicked);

    const accepted = recordEneaNativeConfirmAccepted(clicked);
    const submitted = recordEneaServerOutcome(accepted, { status: "submitted", cpid: "CPID-DEMO" });
    expect(submitted.audit.at(-1)?.type).toBe("enea-server-submitted-cpid-verified");
  });

  it("imposta Italia solo per una provincia italiana riconosciuta", () => {
    expect(birthNationFromProvince("Genova")).toEqual({ source: "italian_province", value: "Italia" });
    expect(birthNationFromProvince("GE")).toEqual({ source: "italian_province", value: "Italia" });
    expect(birthNationFromProvince("Bologna (BO)")).toEqual({ source: "italian_province", value: "Italia" });
    expect(birthNationFromProvince("Monza Brianza ")).toEqual({ source: "italian_province", value: "Italia" });
    expect(birthNationFromProvince("Estero")).toEqual({ source: "operator_required", value: null });
    expect(birthNationFromProvince("")).toEqual({ source: "operator_required", value: null });
    expect(residenceNationFromProvince("Genova")).toEqual({ source: "italian_province", value: "Italia" });
    expect(residenceNationFromProvince("non indicata")).toEqual({ source: "operator_required", value: null });
  });

  it("ammette al pilot interno soltanto allegati e bozze fixture validati", () => {
    let state = addSyntheticAttachment(financiallyReconciled(), "invoice", new Date("2026-08-12T10:00:00Z"));
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
