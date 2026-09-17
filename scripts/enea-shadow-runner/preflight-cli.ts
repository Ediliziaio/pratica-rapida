#!/usr/bin/env node
import path from "node:path";
import { ENEA_OPERATIONAL_REGISTRY_VERSION, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "../../src/features/enea-shadow-crm/preflightContract";
import { resolveUserAuthorizedScreeningRow } from "../../src/features/enea-shadow-crm/userAuthorizedPolicies";
import { resolveWorkDates } from "../../src/features/enea-shadow-crm/workflow";
import { PersistentEneaRunner } from "./runner";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const runner = new PersistentEneaRunner(rootDirectory);

if (command === "record-sara-readonly-conflict") {
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" ? "form cliente originario CRM"
      : step === "identity_property" || step === "plant" ? "form cliente originario CRM"
        : step === "economic_sources" || step === "gross_reconciliation" || step === "screenings" ? "cinque allegati originari CRM letti in sola lettura"
          : "form e fonti originarie minimizzate",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? "Data fine lavori assente nel form/CRM."
      : step === "screenings" ? "Conflitto uno-a-molti: una riga form pergola/sud-est contro pergola a due moduli e più righe Cristal motorizzate nella fattura 78."
        : step === "enea_mapping" ? "Mappatura ENEA non deterministica finché conflitto schermature e data lavori restano aperti."
          : "Fonte originaria verificata in sola lettura.",
    nextAction: step === "dates" || step === "screenings" || step === "enea_mapping" ? "Richiedere decisione operatore; non aprire ENEA." : "Proseguire nel preflight locale.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true,
    customerFormAcquired: true,
    attachmentInventoryComplete: true,
    requiredAssetsAcquired: true,
    economicSourcesClassified: true,
    identityPropertyComplete: true,
    datesComplete: false,
    financialTripleReconciled: true,
    screeningsReconciled: false,
    plantComplete: true,
    eneaMappingComplete: false,
    evidence,
  });
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-sara", "audit-sara-agostinelli", {
    run,
    sources: [
      { sourceId: "crm-form-sara-2026-08-14", kind: "form", verification: "verified", note: "Form originario: una riga pergola, esposizione sud-est; identità/catasto/edificio/impianto presenti; data fine lavori assente." },
      { sourceId: "invoice-76-2025-05-02", kind: "document", verification: "verified", note: "Fattura 76 del 02/05/2025, acconto, lordo IVA incluso €5.900,01." },
      { sourceId: "invoice-78-2025-05-06", kind: "document", verification: "verified", note: "Fattura 78 del 06/05/2025, saldo, lordo IVA incluso €21.000,00; pergola due moduli e più righe Cristal motorizzate." },
      { sourceId: "invoice-78-semantic-duplicate", kind: "document", verification: "verified", note: "Duplicato semantico della fattura 78; escluso dal totale." },
      { sourceId: "invoice-76-semantic-duplicate", kind: "document", verification: "verified", note: "Duplicato semantico della fattura 76; escluso dal totale." },
      { sourceId: "cadastral-plan-non-economic", kind: "document", verification: "verified", note: "Planimetria catastale; fonte non economica, esclusa dal totale." },
      { sourceId: "gross-reconciliation-26900-01", kind: "audit", verification: "verified", note: "Fatture uniche deduplicate: €5.900,01 + €21.000,00 = €26.900,01; imponibili e IVA concordi." },
    ],
    appliedRuleIds: [
      "system-single-active-practice",
      "system-readonly-adapter-contract",
      "system-operator-block-fail-closed",
      "system-atomic-checkpoint-resume",
      "core-form-first",
      "core-economic-classification",
      USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority,
      "core-mapping-complete",
      "authorized-10-intervento-data-fine-lavori",
    ],
    reason: "Ticket Sara Agostinelli: conflitto reale tra il form originario (una sola pergola, sud-est) e la fattura 78 (pergola a due moduli più più righe Cristal motorizzate) senza riconciliazione uno-a-uno. Data fine lavori assente. Economia verificata su due fatture uniche: €26.900,01; due duplicati e la planimetria esclusi.",
    nextAction: "Operatore deve definire la corrispondenza delle schermature e fornire/verificare la data fine lavori. Fermarsi su Sara; non selezionare la pratica successiva e non aprire ENEA.",
  }, option("--command-id") ?? `sara-readonly-preflight:${crypto.randomUUID()}`);
} else if (command === "record-sara-readonly-recheck") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const screeningRows = [
    { sourceId: "invoice-78-line-1", description: "Pergola inclinata, 2 moduli accoppiati, completa di Cristal e timpani laterali", dimensions: "L 9760 x P 2940", quantity: 1, exposure: "sud-est (form)" },
    { sourceId: "invoice-78-line-2", description: "Tenda Cristal guidata con motore e telecomando", dimensions: "L 2810 x H 1140", quantity: 1, exposure: "SUD (policy autorizzata)" },
    { sourceId: "invoice-78-line-3", description: "Tenda Cristal guidata con motore e telecomando", dimensions: "L 2810 x H 1140", quantity: 1, exposure: "SUD (policy autorizzata)" },
    { sourceId: "invoice-78-line-4", description: "Tenda Cristal guidata con motore e telecomando", dimensions: "L 2220 x H 2100", quantity: 1, exposure: "SUD (policy autorizzata)" },
    { sourceId: "invoice-78-line-5", description: "Tenda Cristal guidata con motore e telecomando", dimensions: "L 2100 x H 2100", quantity: 1, exposure: "SUD (policy autorizzata)" },
    { sourceId: "invoice-78-line-6", description: "Tenda Cristal guidata con motore e telecomando", dimensions: "L 2445 x H 1630", quantity: 2, exposure: "SUD (policy autorizzata)" },
  ].map((row) => ({ ...row, resolution: resolveUserAuthorizedScreeningRow(row.description) }));
  if (screeningRows.some((row) => row.resolution === null)) throw new Error("Riga Sara non coperta dalle regole utente autorizzate.");

  const dates = resolveWorkDates([
    { date: "2025-05-02", sourceDocumentId: "invoice-76-2025-05-02", kind: "invoice" },
    { date: "2025-05-06", sourceDocumentId: "invoice-78-2025-05-06", kind: "invoice" },
  ]);
  if (dates.status !== "resolved") throw new Error(dates.reason);
  const completed = new Date(dates.completionDate);
  const completedDay = Date.UTC(completed.getUTCFullYear(), completed.getUTCMonth(), completed.getUTCDate());
  const processingDay = Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate());
  const elapsedDays = Math.floor((processingDay - completedDay) / 86_400_000);
  const dateGateOpen = elapsedDays <= 90;

  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM"
      : step === "dates" ? `${dates.completionSource}: ultima fattura originaria valida`
        : step === "screenings" || step === "enea_mapping" ? "sei righe tecniche della fattura 78 e policy utente registrate"
          : "fatture originarie CRM deduplicate e lette in sola lettura",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? `Fine lavori derivata dalla fattura 78: 06/05/2025; ${elapsedDays} giorni prima della lavorazione, oltre il gate di 90 giorni; nessun override test storico auditato.`
      : step === "screenings" ? "Sei righe fonte riconciliate: una pergola gTot 0,08 e cinque righe Cristal gTot 0,33; l'ultima riga ha quantità 2."
        : step === "enea_mapping" ? "Matrice riga-per-riga deterministica e completa; il solo gate temporale impedisce di procedere oltre il preflight."
          : "Fonte originaria verificata in sola lettura.",
    nextAction: step === "dates" ? "Mantenere alert e gate operatore; non aprire ENEA." : "Nessun ticket tecnico per questa fase.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true,
    customerFormAcquired: true,
    attachmentInventoryComplete: true,
    requiredAssetsAcquired: true,
    economicSourcesClassified: true,
    identityPropertyComplete: true,
    datesComplete: dateGateOpen,
    financialTripleReconciled: true,
    screeningsReconciled: true,
    plantComplete: true,
    eneaMappingComplete: true,
    evidence,
  }, processingAt);

  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-sara", "audit-sara-agostinelli", {
    run,
    sources: [
      { sourceId: "sara-completion-from-last-invoice-2025-05-06", kind: "audit", verification: "verified", note: `Form senza fine lavori; applicata l'ultima data fattura 06/05/2025 da invoice-78-2025-05-06. Distanza dalla lavorazione: ${elapsedDays} giorni; gate operatore mantenuto.` },
      ...screeningRows.map((row) => ({
        sourceId: row.sourceId,
        kind: "document" as const,
        verification: "verified" as const,
        note: `${row.description}; ${row.dimensions}; quantità ${row.quantity}; esposizione ${row.exposure}; schermatura solare ${row.resolution!.product}; gTot ${row.resolution!.gTot.toFixed(2)}; regola ${row.resolution!.ruleId}.`,
      })),
    ],
    appliedRuleIds: [
      "system-single-active-practice",
      "system-readonly-adapter-contract",
      "system-operator-block-fail-closed",
      "system-atomic-checkpoint-resume",
      "core-form-first",
      "core-economic-classification",
      USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority,
      "core-mapping-complete",
      "authorized-10-intervento-data-fine-lavori",
      "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo",
      "authorized-22-schermature-materiale",
      "authorized-23-schermature-esposizione",
      USER_AUTHORIZED_RULE_IDS.pergolaScreening,
      USER_AUTHORIZED_RULE_IDS.cristalScreening,
      USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
    ],
    reason: `Ticket Sara Agostinelli aggiornato: nessun conflitto schermature residuo; sei righe fonte riconciliate con gTot deterministici. Fine lavori derivata dalla fattura 78 del 06/05/2025, ${elapsedDays} giorni prima della lavorazione: gate oltre 90 giorni ancora attivo e nessun override test storico auditato.`,
    nextAction: "Operatore deve verificare la procedibilità rispetto al termine di 90 giorni. Fermarsi su Sara; non selezionare la pratica successiva e non aprire ENEA.",
  }, option("--command-id") ?? "sara-readonly-preflight:user-rules-2026-08-14-v1", processingAt);
} else if (command === "record-sara-readonly-case-date-override") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const caseOverride = {
    id: "case-override:sara-agostinelli:data-fine-lavori:2026-08-14",
    practiceId: "audit-sara-agostinelli",
    field: "intervento.data_fine_lavori",
    value: "2026-08-14",
    scope: "single_practice_test" as const,
    propagation: "forbidden" as const,
    authorizedAt: processingAt.toISOString(),
    authorizationSource: "explicit_user_authorization" as const,
    reason: "Override autorizzato esclusivamente per il test Sara Agostinelli; non è una fonte originaria, non si propaga e non diventa regola generale.",
  };
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "dates" ? caseOverride.id
      : step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM già acquisito"
        : step === "screenings" || step === "enea_mapping" ? "sei righe tecniche già riconciliate della fattura 78 e policy utente registrate"
          : "fatture originarie CRM già acquisite, deduplicate e riconciliate",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? "Fine lavori impostata a 14/08/2026 soltanto dal presente override test Sara, auditato e non propagabile."
      : step === "screenings" ? "Sei righe fonte restano riconciliate senza modifiche: una pergola gTot 0,08 e cinque righe Cristal gTot 0,33."
        : step === "enea_mapping" ? "Matrice completa e deterministica; tutti i campi del preflight risultano coperti con provenienza e regola."
          : "Evidenza read-only precedente invariata e verificata.",
    nextAction: "Passare al gate successivo soltanto dopo aver riportato l'esito; non creare ancora ENEA.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true,
    customerFormAcquired: true,
    attachmentInventoryComplete: true,
    requiredAssetsAcquired: true,
    economicSourcesClassified: true,
    identityPropertyComplete: true,
    datesComplete: true,
    financialTripleReconciled: true,
    screeningsReconciled: true,
    plantComplete: true,
    eneaMappingComplete: true,
    evidence,
    caseOverrides: [caseOverride],
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-sara", "audit-sara-agostinelli", {
    run,
    sources: [{
      sourceId: caseOverride.id,
      kind: "operator_policy",
      verification: "verified",
      note: `Autorizzazione utente caso-specifica: ${caseOverride.field}=14/08/2026; scope=${caseOverride.scope}; propagation=${caseOverride.propagation}; non sostituisce il form e non modifica il registro generale.`,
    }],
    appliedRuleIds: [
      "system-single-active-practice",
      "system-readonly-adapter-contract",
      "system-operator-block-fail-closed",
      "system-atomic-checkpoint-resume",
      "core-form-first",
      "core-economic-classification",
      USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority,
      "core-mapping-complete",
      "authorized-10-intervento-data-fine-lavori",
      "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo",
      "authorized-22-schermature-materiale",
      "authorized-23-schermature-esposizione",
      USER_AUTHORIZED_RULE_IDS.pergolaScreening,
      USER_AUTHORIZED_RULE_IDS.cristalScreening,
      USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
    ],
    reason: "Preflight Sara Agostinelli verde: tutti gli otto passaggi sono completi. Fine lavori 14/08/2026 deriva esclusivamente dall'override test caso-specifico auditato e non propagabile; tutti gli altri dati e regole restano invariati. Nessuna pratica ENEA creata.",
    nextAction: "Gate successivo pronto: richiedere autorizzazione separata prima di creare o compilare qualsiasi pratica ENEA; restare fermi su Sara.",
  }, option("--command-id") ?? "sara-readonly-preflight:case-date-override-2026-08-14-v1", processingAt);
} else if (command === "record-samuele-readonly") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const invoiceDate = "2026-03-19";
  const elapsedDays = Math.floor((Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate()) - Date.parse(`${invoiceDate}T00:00:00Z`)) / 86_400_000);
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM Samuele Colombo"
      : step === "dates" ? "fattura originaria 48/001 del 19/03/2026"
        : step === "economic_sources" || step === "gross_reconciliation" ? "fattura originaria 48/001 e copia semantica deduplicata"
          : step === "screenings" || step === "enea_mapping" ? "tre righe schermatura della fattura 48/001 e form originario"
            : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? `Fine lavori assente nel form; derivata dall'ultima fattura originaria al 19/03/2026, ${elapsedDays} giorni prima della lavorazione: gate oltre 90 giorni attivo e nessun override caso-specifico.`
      : step === "economic_sources" ? "Fattura 48/001 classificata saldo; seconda copia semanticamente identica esclusa dal calcolo."
        : step === "gross_reconciliation" ? "Totale lordo IVA incluso €17.529,60 verificato da imponibile €15.936,00 + IVA €1.593,60 e totale documento; duplicato escluso."
          : step === "screenings" ? "Tre schermature mobili riconciliate: 6200×2470, 4230×2190, 6080×2437 mm; gTot esplicito 0,13; esposizioni sud-est, sud, est; meccanismo assente risolto Manuale dalla policy già registrata."
            : step === "enea_mapping" ? "Matrice tecnica completa con provenienza: tipo tende da sole, installazione esterna, materiale Tessuto e meccanismo Manuale secondo registro; il solo gate data impedisce la bozza."
              : "Fonte originaria verificata in sola lettura.",
    nextAction: step === "dates" ? "Fermare Samuele sul gate oltre 90 giorni; non creare alcuna bozza ENEA senza override caso-specifico auditato." : "Nessun blocco in questa fase.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: elapsedDays <= 90,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-samuele", "audit-samuele-colombo", {
    run,
    sources: [
      { sourceId: "crm-form-samuele-2026-08-14", kind: "form", verification: "verified", note: "Form originario Samuele: identità/residenza/catasto/edificio/impianto completi; tre tende da sole con esposizioni sud-est, sud, est; fine lavori assente." },
      { sourceId: "invoice-48-001-2026-03-19", kind: "document", verification: "verified", note: "Fattura originaria 48/001 del 19/03/2026: tre schermature mobili con misure e gTot 0,13; imponibile €15.936,00, IVA €1.593,60, lordo €17.529,60." },
      { sourceId: "invoice-48-001-semantic-duplicate", kind: "document", verification: "verified", note: "Seconda copia visivamente e semanticamente identica della fattura 48/001; esclusa dal totale e conservata in audit." },
      { sourceId: "samuele-completion-from-last-invoice-2026-03-19", kind: "audit", verification: "verified", note: `Fine lavori assente nel form; ultima fattura 19/03/2026, ${elapsedDays} giorni prima della lavorazione; gate oltre 90 giorni mantenuto.` },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume",
      "core-form-first", "core-economic-classification", USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority, "core-mapping-complete",
      "authorized-05-beneficiario-cf", "authorized-10-intervento-data-fine-lavori", "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo", "authorized-22-schermature-materiale", "authorized-23-schermature-esposizione",
      USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
    ],
    reason: `Preflight completo Samuele Colombo: sette fasi verdi; data lavori bloccata. Fine lavori derivata dalla fattura 48/001 del 19/03/2026, ${elapsedDays} giorni prima della lavorazione, oltre il gate di 90 giorni e senza override caso-specifico. Nessuna bozza ENEA creata.`,
    nextAction: "Intervento operatore limitato alla data: serve un override caso-specifico auditato oppure una fonte originaria valida; non creare ENEA e non passare alla bozza.",
  }, option("--command-id") ?? "samuele-readonly-preflight:original-sources-2026-08-14:v1", processingAt);
} else if (command === "record-samuele-test-alert") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const invoiceDate = "2026-03-19";
  const elapsedDays = Math.floor((Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate()) - Date.parse(`${invoiceDate}T00:00:00Z`)) / 86_400_000);
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM Samuele Colombo"
      : step === "dates" ? "fattura originaria 48/001 del 19/03/2026 + policy TEST oltre 90 giorni"
        : step === "economic_sources" || step === "gross_reconciliation" ? "fattura originaria 48/001 e copia semantica deduplicata"
          : step === "screenings" || step === "enea_mapping" ? "tre righe schermatura della fattura 48/001 e form originario"
            : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? `Fine lavori derivata dall'ultima fattura originaria al 19/03/2026; ${elapsedDays} giorni prima della lavorazione. Alert auditato non bloccante per la sola modalità TEST; produzione/reale esclusa.`
      : step === "economic_sources" ? "Fattura 48/001 classificata saldo; seconda copia semanticamente identica esclusa dal calcolo."
        : step === "gross_reconciliation" ? "Totale lordo IVA incluso €17.529,60 verificato da imponibile €15.936,00 + IVA €1.593,60 e totale documento; duplicato escluso."
          : step === "screenings" ? "Tre schermature mobili riconciliate: 6200×2470, 4230×2190, 6080×2437 mm; gTot esplicito 0,13; esposizioni sud-est, sud, est; meccanismo Manuale."
            : step === "enea_mapping" ? "Matrice tecnica completa con provenienza: tipo tende da sole, installazione esterna, materiale Tessuto e meccanismo Manuale secondo registro."
              : "Fonte originaria verificata in sola lettura.",
    nextAction: step === "dates" ? "Proseguire alla sola bozza TEST; non propagare l'eccezione a produzione/reale." : "Nessun blocco in questa fase.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: true,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-samuele", "audit-samuele-colombo", {
    run,
    sources: [
      { sourceId: "test-only-deadline-alert-samuele-2026-08-14", kind: "operator_policy", verification: "verified", note: `testMode=true; fine lavori 19/03/2026; ${elapsedDays} giorni; alert non bloccante; productionPropagation=forbidden.` },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert, USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume",
      "core-form-first", "core-economic-classification", USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority, "core-mapping-complete",
      "authorized-05-beneficiario-cf", "authorized-10-intervento-data-fine-lavori", "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo", "authorized-22-schermature-materiale", "authorized-23-schermature-esposizione",
    ],
    reason: `Preflight Samuele Colombo interamente verde. Fine lavori 19/03/2026; superamento di ${elapsedDays} giorni registrato come alert non bloccante per la sola modalità TEST. Nessun override caso-specifico; produzione/reale esclusa.`,
    nextAction: "Creare, compilare e salvare la sola bozza ENEA completa; fermarsi prima di anteprima e submit.",
  }, option("--command-id") ?? "samuele-readonly-preflight:test-only-deadline-alert-2026-08-14:v1", processingAt);
} else if (command === "record-matteo-test-readonly") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const invoiceDate = "2026-07-23";
  const elapsedDays = Math.floor((Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate()) - Date.parse(`${invoiceDate}T00:00:00Z`)) / 86_400_000);
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM Matteo Maranesi"
      : step === "dates" ? "fattura originaria 814/26 del 23/07/2026"
        : step === "economic_sources" || step === "gross_reconciliation" ? "fatture originarie 490/26 e 814/26, più due copie semantiche deduplicate"
          : step === "screenings" || step === "enea_mapping" ? "riga PERGOLA ROOM della fattura 814/26 e riga pergola/sud del form originario"
            : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? `Fine lavori assente nel form; derivata dall'ultima fattura originaria al 23/07/2026, ${elapsedDays} giorni prima della lavorazione. Nessun alert oltre 90 giorni applicabile.`
      : step === "economic_sources" ? "490/26 classificata acconto (€2.800,00) e 814/26 saldo (€6.550,01); Fattura 3 e 4 sono copie semantiche rispettivamente di 490/26 e 814/26."
        : step === "gross_reconciliation" ? "Totale ENEA €9.350,01 come somma dei lordi delle due fatture uniche. Lo storno interno di 814/26 resta auditato e non viene sommato né trasformato in fonte separata."
          : step === "screenings" ? "Una pergola finale riconciliata: 540×532 cm, superficie 28,72 m², esposizione sud, gTot documentato 0,02 dalla fattura originaria 814/26 (fallback 0,06 non applicato), materiale PVC, installazione esterna, meccanismo Manuale e superficie finestrata protetta 2,9 m² secondo registro."
            : step === "plant" ? "Impianto autonomo, caloriferi, gas metano, generatore Altro e climatizzazione sì dal form; distribuzione/regolazione e valori tecnici TEST coperti dalle policy operative registrate."
              : step === "enea_mapping" ? "Matrice completa con provenienza: risparmio energetico 482,50 kWh/anno dalla superficie riconciliata × 16,8; fine test alla bozza salvata, preview e submit vietati."
                : "Fonte originaria verificata in sola lettura.",
    nextAction: "Proseguire alla sola bozza TEST completa e salvata; nessuna anteprima o submit.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: true,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-matteo", "audit-matteo-maranesi", {
    run,
    sources: [
      { sourceId: "crm-form-matteo-2026-08-14", kind: "form", verification: "verified", note: "Form originario: Matteo Maranesi, CF MRNMTT79A30A944J; Castel Maggiore, Via G. Cinti 18; foglio 23, mappale 167; edificio 2014, 100 m², una unità; impianto e una pergola esposta a sud completi; fine lavori assente." },
      { sourceId: "invoice-490-26-2026-05-26", kind: "document", verification: "verified", note: "Fattura originaria 490/26 del 26/05/2026, acconto schermature solari; imponibile €2.545,45, IVA €254,55, lordo €2.800,00." },
      { sourceId: "invoice-814-26-2026-07-23", kind: "document", verification: "verified", note: "Fattura originaria 814/26 del 23/07/2026, saldo: PERGOLA ROOM 540×532 cm, superficie 28,72 m², tessuto PVC; CLASSE DI SCHERMATURA gTot 0,02 - classe 4; lordo documento €6.550,01; storno interno dell'acconto conservato solo in audit." },
      { sourceId: "invoice-490-26-semantic-duplicate", kind: "document", verification: "verified", note: "Fattura 3: copia semanticamente identica della 490/26; esclusa dal totale." },
      { sourceId: "invoice-814-26-semantic-duplicate", kind: "document", verification: "verified", note: "Fattura 4: copia semanticamente identica della 814/26; esclusa dal totale." },
      { sourceId: "matteo-screening-policy-row-1", kind: "operator_policy", verification: "verified", note: "Pergola: gTot documentato 0,02 dalla fattura originaria 814/26 con precedenza sul fallback 0,06, non applicato; meccanismo assente→Manuale; superficie finestrata 2,9 m²; risparmio 28,72×16,8=482,50 kWh/anno. Tutti gli ID provengono dal registro unico." },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
      USER_AUTHORIZED_RULE_IDS.pergolaScreening, USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume",
      "core-form-first", "core-economic-classification", USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority, "core-mapping-complete",
      "authorized-05-beneficiario-cf", "authorized-10-intervento-data-fine-lavori", "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo", "authorized-22-schermature-materiale", "authorized-23-schermature-esposizione",
      "authorized-26-schermature-risparmio-energia",
    ],
    reason: `Preflight Matteo Maranesi interamente verde. Fine lavori 23/07/2026 derivata dall'ultima fattura originaria (${elapsedDays} giorni, nessun alert >90). Due fatture uniche riconciliate a €9.350,01; due duplicati esclusi. Una pergola 28,72 m², sud, gTot documentato 0,02 dalla fattura 814/26; fallback 0,06 non applicato. Attributi coperti esclusivamente dal registro unico.`,
    nextAction: "Creare, compilare e salvare la sola bozza ENEA completa; fermarsi prima di anteprima e submit.",
  }, option("--command-id") ?? "matteo-readonly-preflight:original-sources-2026-08-14:v1", processingAt);
} else if (command === "record-zeno-test-readonly") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const invoiceDate = "2026-07-17";
  const elapsedDays = Math.floor((Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate()) - Date.parse(`${invoiceDate}T00:00:00Z`)) / 86_400_000);
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "customer_form" || step === "identity_property" || step === "plant" ? "form cliente originario CRM Zeno Righetti"
      : step === "dates" ? "fattura originaria FPR 374/26 del 17/07/2026"
        : step === "economic_sources" || step === "gross_reconciliation" ? "fatture originarie FPR 258/26 e FPR 374/26; copie Fattura 3 e 4 deduplicate; righe 1, 2 e 3 incluse come schermature"
          : step === "screenings" || step === "enea_mapping" ? "righe 1 e 3 delle fatture originarie LM Tende e due righe schermatura/sud del form originario"
            : "fonti originarie read-only",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "dates" ? `Fine lavori assente nel form; derivata dall'ultima fattura originaria al 17/07/2026, ${elapsedDays} giorni prima della lavorazione. Nessun alert oltre 90 giorni applicabile.`
      : step === "economic_sources" ? "FPR 258/26 acconto e FPR 374/26 saldo, entrambe €5.865,20 lordi; Fattura 3 e 4 sono copie semantiche rispettivamente di FPR 258/26 e FPR 374/26. Nessun documento ENEA storico acquisito o usato."
        : step === "gross_reconciliation" ? "Lordo delle due fatture uniche €11.730,40 interamente attribuibile alle schermature: righe 1 tende a rullo €1.830,00, riga 2 sei zanzariere €3.410,00, riga 3 tende da sole €6.490,40."
          : step === "screenings" ? "Undici prodotti tecnici 1:1: 2 tende a rullo da 237×285 cm, 2 tende da sole da 390×210 cm, 1 tenda da sole 425×210 cm e 6 zanzariere distinte da 129,2×125,5 / 69,5×235,4 / 219,3×265,5 / 269×125,6 / 128,5×235,4 / 79×74,8 cm. Zanzariere: Altra schermatura solare, materiale Misto, movimentazione Manuale, gTot fallback 0,33 in assenza di gTot originario esplicito."
            : step === "plant" ? "Impianto autonomo a pavimento, energia elettrica, generatore elettrico e climatizzazione sì dal form; distribuzione/regolazione e valori tecnici TEST coperti dalle policy operative registrate."
              : step === "enea_mapping" ? "Matrice completa con provenienza: 11 righe, superficie schermature 54,887 m² e risparmio 922,10 kWh/anno secondo screening-energy-savings-v1; spesa ENEA €11.730,40; fine test alla bozza salvata, preview e submit vietati."
                : "Fonte originaria verificata in sola lettura.",
    nextAction: "Proseguire alla sola bozza TEST completa e salvata; nessuna anteprima o submit.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: true,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-zeno", "audit-zeno-righetti", {
    run,
    sources: [
      { sourceId: "crm-form-zeno-2026-08-14", kind: "form", verification: "verified", note: "Form originario: Zeno Righetti, CF RGHZNE91E02M172K; Monza, Via Giacomo Medici 40; foglio 26, mappale 421, subalterno 712; edificio 2026, 147 m², una unità; impianto completo; due righe schermatura entrambe sud; fine lavori assente." },
      { sourceId: "invoice-fpr-258-26-2026-05-28", kind: "document", verification: "verified", note: "Fattura originaria FPR 258/26 del 28/05/2026, acconto LM Tende: imponibile €4.960,00, IVA €905,20, lordo €5.865,20." },
      { sourceId: "invoice-fpr-374-26-2026-07-17", kind: "document", verification: "verified", note: "Fattura originaria FPR 374/26 del 17/07/2026, saldo LM Tende: imponibile €4.960,00, IVA €905,20, lordo €5.865,20; data collaudo 17/07/2026." },
      { sourceId: "invoice-fpr-258-26-semantic-duplicate", kind: "document", verification: "verified", note: "Fattura 3: copia semanticamente identica della FPR 258/26; esclusa dal totale." },
      { sourceId: "invoice-fpr-374-26-semantic-duplicate", kind: "document", verification: "verified", note: "Fattura 4: copia semanticamente identica della FPR 374/26; esclusa dal totale." },
      { sourceId: "zeno-qualified-screenings", kind: "operator_policy", verification: "verified", note: "Incluse solo righe fattura 1 e 3, espanse in cinque prodotti tecnici distinti 2+2+1: superfici per pezzo 6,754/6,754/8,19/8,19/8,925 m², area totale 38,813 m², gTot espliciti e attributi 1:1; importo lordo aggregato solo economicamente €8.320,40." },
      { sourceId: "zeno-zanzariere-included-1to1", kind: "operator_policy", verification: "verified", note: "Riga 2 inclusa: 6 zanzariere fisiche distinte auditate 1:1 con modello e misure proprie; Altra schermatura solare, Misto, Manuale, gTot fallback 0,33; lordo attribuito €3.410,00. Regola generale TEST e produzione." },
      { sourceId: "zeno-historical-enea-exclusion", kind: "operator_policy", verification: "verified", note: "Le due pratiche ENEA concluse presenti nel CRM non sono state aperte, acquisite o usate come fonte." },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
      USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly, USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
      USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
      USER_AUTHORIZED_RULE_IDS.zanzarieraScreening,
      USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume",
      "core-form-first", "core-economic-classification", USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority, "core-mapping-complete",
      "authorized-05-beneficiario-cf", "authorized-10-intervento-data-fine-lavori", "authorized-15-schermature-superficie-finestrata",
      "authorized-16-schermature-meccanismo", "authorized-22-schermature-materiale", "authorized-23-schermature-esposizione",
      "authorized-26-schermature-risparmio-energia",
    ],
    reason: `Preflight Zeno Righetti interamente verde. Fine lavori 17/07/2026 derivata dall'ultima fattura originaria (${elapsedDays} giorni, nessun alert >90). Due fatture uniche riconciliate a €11.730,40 e due copie escluse; tutte le righe 1/2/3 sono schermature qualificate. Undici prodotti tecnici 1:1 (2+6+2+1), incluse sei zanzariere come Altra schermatura solare con fallback Misto/Manuale/gTot 0,33. Nessun documento ENEA storico usato.`,
    nextAction: "Creare, compilare e salvare la sola bozza ENEA completa; fermarsi prima di anteprima e submit.",
  }, option("--command-id") ?? "zeno-readonly-preflight:original-sources-2026-08-14:v1", processingAt);
} else if (command === "record-zeno-building-conflict") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "identity_property" || step === "enea_mapping"
      ? "form originario CRM Zeno + tassonomia obbligatoria portale ENEA immobile/intervento bozza 411015"
      : "fonti originarie read-only già persistite per Zeno",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "identity_property"
      ? "Conflitto non risolvibile senza inferenza: tipologia edilizia edificio/condominio oltre tre piani ma numero totale unità immobiliari dell'edificio pari a 1."
      : step === "enea_mapping"
        ? "Il portale richiede una scelta univoca tra singola unità in edificio plurimo, edificio a unità unica o intero edificio; le fonti correnti non determinano quale valore sia corretto."
        : "Passo già verificato dalle fonti originarie persistite; nessun documento ENEA storico usato.",
    nextAction: step === "identity_property" || step === "enea_mapping"
      ? "Operatore verifica il numero totale reale di unità dell'edificio e la natura dell'intervento; riprendere esclusivamente la bozza 411015."
      : "Mantenere il checkpoint; nessuna nuova bozza.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: false, datesComplete: true,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: false, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-zeno-correction", "audit-zeno-righetti", {
    run,
    sources: [
      { sourceId: "zeno-building-units-conflict", kind: "audit", verification: "verified", note: "Form: tipologia edificio_oltre_3_piani e N. appartamenti edificio 1. Portale bozza 411015: scelta obbligatoria fra singola unità in edificio plurimo, edificio a unità unica o intero edificio. Nessun valore selezionato per inferenza." },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume",
      "core-form-first", "core-mapping-complete", "authorized-12-intervento-unita-totali-edificio",
    ],
    reason: "Blocco Zeno sulla bozza unica 411015: il form dichiara edificio/condominio oltre tre piani ma una sola unità immobiliare totale. Il portale richiede una classificazione incompatibile con una scelta per inferenza. Compilazione fermata prima del campo Intervento su; nessuna anteprima o submit.",
    nextAction: "Operatore verifica il numero totale reale di unità dell'edificio e se l'intervento riguarda singola unità in edificio plurimo, edificio a unità unica o intero edificio. Riprendere soltanto la bozza 411015; non crearne un'altra.",
  }, option("--command-id") ?? "zeno-readonly-preflight:building-units-conflict:v1", processingAt);
} else if (command === "record-zeno-building-resolved") {
  const processingAt = new Date(option("--processing-at") ?? new Date().toISOString());
  const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
    source: step === "identity_property" || step === "enea_mapping"
      ? "form cliente originario Zeno: unità immobiliari=1; regola utente unità unica prevalente sul numero piani"
      : "fonti originarie read-only Zeno già persistite",
    ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
    reason: step === "identity_property"
      ? "Unità immobiliari totale=1 nel form e nessuna fonte primaria esplicita dichiara più unità o condominio; oltre tre piani resta descrittivo e la scelta ENEA è edificio a unità unica."
      : step === "enea_mapping"
        ? "Mappatura deterministica ripristinata: edificio costituito da una singola unità immobiliare; numero piani non riclassifica il fabbricato."
        : "Passo già verificato da fonti originarie; nessun documento ENEA storico usato.",
    nextAction: "Riprendere esclusivamente la bozza ENEA 411015 e completarla fino al salvataggio; anteprima e submit vietati.",
  }])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
  const run = runEneaPreflight({
    sessionReady: true, customerFormAcquired: true, attachmentInventoryComplete: true, requiredAssetsAcquired: true,
    economicSourcesClassified: true, identityPropertyComplete: true, datesComplete: true,
    financialTripleReconciled: true, screeningsReconciled: true, plantComplete: true, eneaMappingComplete: true, evidence,
  }, processingAt);
  runner.recordAuthorizedReadOnlyPreflight("readonly-preflight-zeno-resolution", "audit-zeno-righetti", {
    run,
    sources: [
      { sourceId: "zeno-single-unit-building-resolution", kind: "operator_policy", verification: "verified", note: "Form originario: unità immobiliari=1. Nessuna fonte primaria esplicita afferma più unità o condominio. Applicata la regola generale: edificio a unità unica; oltre tre piani è solo descrittivo." },
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
      USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly, USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,
      USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
      USER_AUTHORIZED_RULE_IDS.missingCompletionDate, USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive,
      "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume",
      "core-form-first", "core-economic-classification", USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority, "core-mapping-complete",
      "authorized-12-intervento-unita-totali-edificio", "authorized-13-intervento-unita-interessate",
    ],
    reason: "Blocco Zeno rimosso dalla nuova regola generale: unità immobiliari=1/casa singola determina edificio ENEA a unità unica; oltre tre piani è descrittivo e non prova condominio o pluralità. Nessuna fonte primaria esplicita contraria. Preflight nuovamente verde sulla stessa bozza 411015.",
    nextAction: "Riprendere esclusivamente la bozza ENEA 411015 e completarla fino al salvataggio; anteprima e submit vietati.",
  }, option("--command-id") ?? "zeno-readonly-preflight:building-units-resolved:v1", processingAt);
} else if (command !== "status") {
  throw new Error("Comando preflight non valido. Usare i comandi Sara, record-samuele-readonly, record-samuele-test-alert, record-matteo-test-readonly, record-zeno-test-readonly, record-zeno-building-conflict, record-zeno-building-resolved oppure status.");
}

process.stdout.write(`${JSON.stringify(runner.load(), null, 2)}\n`);
