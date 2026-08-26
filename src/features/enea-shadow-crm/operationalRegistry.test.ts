import { describe, expect, it } from "vitest";
import { ENEA_OPERATIONAL_PROTOCOL, ENEA_OPERATIONAL_REGISTRY, ENEA_OPERATIONAL_REGISTRY_VERSION, USER_AUTHORIZED_RULE_IDS, registryRule, rulesForStep } from "./operationalRegistry";

describe("registro operativo unico",()=>{
  it("ha id stabili e schema decisionale completo",()=>{
    expect(new Set(ENEA_OPERATIONAL_REGISTRY.map(r=>r.id)).size).toBe(ENEA_OPERATIONAL_REGISTRY.length);
    for(const rule of ENEA_OPERATIONAL_REGISTRY) expect(rule).toMatchObject({id:expect.any(String),condition:expect.any(String),sourcePrecedence:expect.any(Array),deterministicAction:expect.any(String),audit:expect.any(String),outcome:expect.stringMatching(/continue|requested_operator/)});
  });
  it("copre una sola volta il protocollo ordinato completo",()=>{
    expect(ENEA_OPERATIONAL_PROTOCOL).toEqual(["customer_form","identity_property","dates","economic_sources","gross_reconciliation","screenings","plant","enea_mapping","preview","submit_cpid"]);
    for(const step of ENEA_OPERATIONAL_PROTOCOL) expect(rulesForStep(step).length).toBeGreaterThan(0);
  });
  it("rende reperibili le regole solo per id",()=>expect(registryRule("core-form-first")?.step).toBe("customer_form"));
  it("registra le nuove regole utente con provenienza, precedenza e audit",()=>{
    expect(ENEA_OPERATIONAL_REGISTRY_VERSION).toBe("enea-operational-registry-v80");
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel)).toMatchObject({ outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-23" } });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.thirdPartyTechnicalCertificateClassification)).toMatchObject({
      outcome: "continue",
      priority: 1_221,
      provenance: { authority: "user", receivedAt: "2026-08-26" },
      deterministicAction: expect.stringContaining("DoP strutturata 6/6"),
    });
    expect(registryRule("system-composite-invoice-bank-transfer-page-segmentation")).toMatchObject({ kind: "system", outcome: "continue" });
    expect(registryRule("system-draft-payload-mapping-completeness")).toMatchObject({ step: "enea_mapping", deterministicAction: expect.stringContaining("Non dichiarare READY") });
    expect(registryRule("system-paper-form-birth-date-leading-digit-ocr-repair")).toMatchObject({
      step: "identity_property",
      outcome: "continue",
      deterministicAction: expect.stringContaining("esclusivamente la cifra iniziale 1"),
      audit: expect.stringContaining("data OCR"),
    });
    expect(registryRule("system-invoice-header-identity-over-body-reference")).toMatchObject({
      step: "gross_reconciliation",
      outcome: "continue",
      sourcePrecedence: [expect.stringContaining("intestazione fiscale"), expect.stringContaining("corpo")],
      deterministicAction: expect.stringContaining("Deduplicare copie"),
      audit: expect.stringContaining("sourceId conservato/scartato"),
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.foreignBirthAnprRegistry)).toMatchObject({
      step: "identity_property",
      outcome: "continue",
      provenance: { authority: "user", receivedAt: "2026-08-23" },
      deterministicAction: expect.stringContaining("intera tabella ANPR versionata"),
      audit: expect.stringContaining("SHA-256 della tabella"),
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittance131To13)).toMatchObject({
      step: "enea_mapping",
      outcome: "continue",
      priority: 1_221,
      provenance: { authority: "user", receivedAt: "2026-08-22" },
      deterministicAction: expect.stringContaining("1,31 W/m2K come valore originario"),
      audit: expect.stringContaining("valore ENEA 1,3"),
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13)).toMatchObject({
      step: "enea_mapping",
      outcome: "continue",
      priority: 1_222,
      provenance: { authority: "user", receivedAt: "2026-08-23" },
      deterministicAction: expect.stringContaining("Conservare integralmente la trasmittanza originaria"),
      audit: expect.stringContaining("valore ENEA 1,3"),
    });
    const pergola = registryRule(USER_AUTHORIZED_RULE_IDS.pergolaScreening)!;
    const cristal = registryRule(USER_AUTHORIZED_RULE_IDS.cristalScreening)!;
    const dates = registryRule(USER_AUTHORIZED_RULE_IDS.missingCompletionDate)!;
    expect(pergola).toMatchObject({ priority: 300, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-14", source: "delegated_user_instruction" } });
    expect(cristal).toMatchObject({ priority: 200, outcome: "continue", provenance: pergola.provenance });
    expect(pergola.priority).toBeGreaterThan(cristal.priority!);
    expect(pergola.sourcePrecedence[0]).toContain("gTot esplicito");
    expect(pergola.deterministicAction).toContain("0,08 soltanto come fallback");
    expect(dates).toMatchObject({ priority: 250, outcome: "requested_operator", provenance: pergola.provenance });
    expect(dates.sourcePrecedence[0]).toContain("form cliente");
    expect(dates.audit).toContain("giorni trascorsi");
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.greenPreflightDraft)).toMatchObject({
      priority: 400,
      deterministicAction: expect.stringContaining("salvataggio della sola bozza ENEA"),
      provenance: pergola.provenance,
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit)).toMatchObject({
      step: "submit_cpid", priority: 500, provenance: { authority: "user" },
      lifecycle: {
        status: "superseded",
        generalGateEligible: false,
        supersededByRuleId: USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft,
      },
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft)).toMatchObject({
      step: "preview", priority: 600, deterministicAction: expect.stringContaining("Disabilitare anteprima finale e submit"), provenance: pergola.provenance,
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert)).toMatchObject({
      step: "dates", priority: 700, outcome: "continue",
      deterministicAction: expect.stringContaining("simulazioni locali"), provenance: pergola.provenance,
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert)!.priority).toBeGreaterThan(dates.priority!);
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.completionOver90OperatorGate)).toMatchObject({
      step: "dates", priority: 1240, outcome: "requested_operator",
      deterministicAction: expect.stringContaining("Richiesto intervento operatore"), provenance: pergola.provenance,
    });
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.completionPortalYearOperatorGate)).toMatchObject({
      step: "dates", priority: 1250, outcome: "requested_operator",
      deterministicAction: expect.stringContaining("portale annuale corretto"), provenance: pergola.provenance,
    });
  });
  it("registra cronologia fatture, materiale della schermatura e motorizzazione come regole continuative", () => {
    const chronology = registryRule(USER_AUTHORIZED_RULE_IDS.invoiceWorkDateChronology)!;
    const surfaceMaterial = registryRule(USER_AUTHORIZED_RULE_IDS.screeningSurfaceMaterialOverSupportStructure)!;
    const material = registryRule(USER_AUTHORIZED_RULE_IDS.explicitCompositeScreeningMaterial)!;
    const movement = registryRule(USER_AUTHORIZED_RULE_IDS.explicitMotorizedScreeningMovement)!;
    const surfacePrecision = registryRule(USER_AUTHORIZED_RULE_IDS.explicitTechnicalSurfacePrecision)!;
    expect(chronology).toMatchObject({ step: "dates", outcome: "continue", provenance: { receivedAt: "2026-08-18" } });
    expect(chronology.deterministicAction).toContain("data piu antica come inizio lavori");
    expect(chronology.deterministicAction).toContain("data piu recente come fine lavori");
    expect(surfaceMaterial).toMatchObject({ step: "screenings", outcome: "continue", provenance: { receivedAt: "2026-08-18" } });
    expect(surfaceMaterial.deterministicAction).toContain("struttura in alluminio");
    expect(surfaceMaterial.deterministicAction).toContain("Tessuto");
    expect(surfaceMaterial.sourcePrecedence[0]).toContain("superficie schermante");
    expect(surfacePrecision).toMatchObject({ step: "screenings", outcome: "continue", provenance: { receivedAt: "2026-08-18" } });
    expect(surfacePrecision.sourcePrecedence[0]).toContain("superficie esplicita");
    expect(surfacePrecision.deterministicAction).toContain("quattro decimali");
    expect(material).toMatchObject({ step: "screenings", outcome: "continue", provenance: { receivedAt: "2026-08-18" } });
    expect(material.deterministicAction).toContain("Misto");
    expect(material.deterministicAction).toContain("Non conteggiare struttura");
    expect(movement.deterministicAction).toContain("Automatico");
    expect(movement.deterministicAction).toContain("pergole e pergotende");
  });
  it("impedisce di dichiarare appresa una correzione non testata e non installata", () => {
    const rule = registryRule("system-apr-learning-closure-gate");
    expect(rule).toMatchObject({ kind: "system", step: "checkpoint_persistence", outcome: "continue" });
    expect(rule?.deterministicAction).toMatch(/ID regola/);
    expect(rule?.deterministicAction).toMatch(/bundle/);
    expect(rule?.audit).toMatch(/sourceFingerprint/);
  });

  it("isola il PDF ENEA storico come benchmark post-bozza senza retroazione", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.postDraftHistoricalBenchmarkReadOnly)!;
    expect(rule).toMatchObject({
      step: "enea_mapping",
      kind: "system",
      outcome: "continue",
      priority: 1_170,
      provenance: { authority: "user", receivedAt: "2026-08-17" },
    });
    expect(rule.condition).toContain("bozza TEST APR e' completa e salvata");
    expect(rule.deterministicAction).toContain("PDF ENEA storico");
    expect(rule.deterministicAction).toContain("Vietare qualunque propagazione");
    expect(rule.audit).toContain("prova assenza mutazioni");
  });
  it("limita il modulo cartaceo e i fallback al solo fornitore Linea Sole Potito", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm)!;
    expect(rule.condition).toContain("Linea Sole Potito");
    expect(rule.sourcePrecedence[0]).toContain("espliciti");
    expect(rule.deterministicAction).toContain("2,0 e 2,9");
    expect(rule.deterministicAction).toContain("Non applicare");
    expect(rule.audit).toContain("seme");
    expect(rule.provenance).toMatchObject({ authority: "user", receivedAt: "2026-08-17" });
  });
  it("estrae prodotti anche dalla descrizione narrativa della fattura", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.narrativeInvoiceProductExtraction)!;
    expect(rule).toMatchObject({ step: "screenings", outcome: "continue", priority: 1050, provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(rule.sourcePrecedence[0]).toContain("descrizione narrativa");
    expect(rule.deterministicAction).toContain("N righe tecniche 1:1");
    expect(rule.deterministicAction).toContain("unico gTot esplicito");
    expect(rule.audit).toContain("testo narrativo");
  });
  it("registra fattura mancante, unita predefinita e precedenza economica delle fatture", () => {
    const missing = registryRule(USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue)!;
    expect(missing.deterministicAction).toContain("Richiesto intervento operatore");
    expect(missing.deterministicAction).toContain("ritorno in Pronte da fare");
    expect(missing.deterministicAction).toContain("Nessuna comunicazione automatica");

    const units = registryRule(USER_AUTHORIZED_RULE_IDS.defaultSingleUnitWhenUnspecified)!;
    expect(units).toMatchObject({ step: "identity_property", outcome: "continue" });
    expect(units.deterministicAction).toContain("= 1");

    const payments = registryRule(USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers)!;
    expect(payments.sourcePrecedence[0]).toContain("fatture originarie");
    expect(payments.deterministicAction).toContain("commissioni bancarie");
    expect(payments.deterministicAction).toContain("supera il totale fatture");

    const gross = registryRule(USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded)!;
    expect(gross).toMatchObject({ step: "gross_reconciliation", outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(gross.deterministicAction).toContain("lordo comprensivo di IVA");
    expect(gross.deterministicAction).toContain("mai il solo imponibile");
    expect(gross.sourcePrecedence.at(-1)).toContain("Rinaldi");

    const distinctInvoices = registryRule(USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum)!;
    expect(distinctInvoices).toMatchObject({ step: "gross_reconciliation", outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(distinctInvoices.deterministicAction).toContain("numero fattura diverso");
    expect(distinctInvoices.deterministicAction).toContain("sommare automaticamente");
    expect(distinctInvoices.deterministicAction).toContain("non elimina dalla somma economica");
  });
  it("riaccoda una pratica dopo una risposta strutturata senza trasformarla in regola generale", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume)!;
    expect(rule).toMatchObject({ step: "runner_lifecycle", outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(rule.deterministicAction).toContain("riaccodare automaticamente");
    expect(rule.deterministicAction).toContain("Non trasformare la risposta in regola generale");
    expect(rule.audit).toContain("questionId");
  });

  it("registra la coorte da dieci con ripresa e blocchi isolati", () => {
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart)).toMatchObject({
      step: "runner_lifecycle",
      kind: "system",
      outcome: "continue",
      priority: 1_110,
      provenance: { authority: "user", receivedAt: "2026-08-16" },
      deterministicAction: expect.stringContaining("Richiesto intervento operatore"),
    });
  });

  it("registra il repeat-test da quindici senza riusare o cancellare le bozze storiche", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.fifteenCaseIntermezzoRepeat)!;
    expect(rule).toMatchObject({
      step: "runner_lifecycle",
      kind: "system",
      outcome: "continue",
      priority: 1_160,
      provenance: { authority: "user", receivedAt: "2026-08-17" },
    });
    expect(rule.deterministicAction).toContain("quindici pratiche");
    expect(rule.deterministicAction).toContain("storico");
    expect(rule.deterministicAction).toContain("nuovi ID");
    expect(rule.deterministicAction).toContain("senza riusare");
    expect(rule.audit).toContain("nuovi draftId");
  });

  it("registra il repeat-test pulito da undici con cronometro e confronto CRM finale", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.elevenCaseCleanRepeat)!;
    expect(rule).toMatchObject({
      step: "runner_lifecycle",
      kind: "system",
      outcome: "continue",
      priority: 1_180,
      provenance: { authority: "user", receivedAt: "2026-08-18" },
    });
    expect(rule.deterministicAction).toContain("esattamente undici pratiche");
    expect(rule.deterministicAction).toContain("senza riusare");
    expect(rule.deterministicAction).toContain("nuovi ID");
    expect(rule.deterministicAction).toContain("confrontare in sola lettura");
    expect(rule.audit).toContain("durata");
  });

  it("registra il repeat-test isolato di una singola pratica senza riuso", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.singleCaseRegressionTest)!;
    expect(rule).toMatchObject({ step: "runner_lifecycle", kind: "system", outcome: "continue", priority: 1_195, provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("una sola pratica");
    expect(rule.deterministicAction).toContain("senza riusare");
    expect(rule.deterministicAction).toContain("nuovo ID");
    expect(rule.deterministicAction).toContain("anteprima, submit e comunicazioni restano vietati");
  });

  it("assegna la seconda abitazione al 36% per ogni intervento e verifica il risultato server", () => {
    expect(registryRule(USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation)).toMatchObject({
      step: "enea_mapping",
      outcome: "continue",
      provenance: { authority: "user", receivedAt: "2026-08-16" },
    });
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation)!;
    expect(rule.deterministicAction).toContain("ogni tipologia di intervento");
    expect(rule.deterministicAction).toContain("aliquota 36%");
    expect(rule.deterministicAction).toContain("quota 50%");
    expect(rule.deterministicAction).toContain("GET della stessa bozza");
    expect(rule.audit).toContain("singolo Salva");
  });

  it("fa prevalere l'identita di fattura sul cointestatario presente solo nel form", () => {
    const precedence = registryRule(USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm)!;
    expect(precedence).toMatchObject({ step: "identity_property", priority: 1030, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(precedence.sourcePrecedence[0]).toContain("fatture originarie");
    expect(precedence.deterministicAction).toContain("non inserire alcun cointestatario");
    expect(precedence.deterministicAction).toContain("inserirlo anche quando il form non lo dichiara");
    expect(precedence.deterministicAction).toContain("richiedere intervento operatore");

    const portalFlow = registryRule(USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow)!;
    expect(portalFlow).toMatchObject({ step: "enea_mapping", priority: 1035, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-17" } });
    expect(portalFlow.sourcePrecedence[0]).toContain("fattura originaria");
    expect(portalFlow.deterministicAction).toContain("Aggiungi persona fisica");
    expect(portalFlow.deterministicAction).toContain("Nome, Cognome e Codice fiscale");
    expect(portalFlow.deterministicAction).toContain("salvare la persona una sola volta");
    expect(portalFlow.deterministicAction).toContain("non aggiungerlo di nuovo");

    const crossCheck = registryRule(USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck)!;
    expect(crossCheck).toMatchObject({ step: "identity_property", priority: 1025, outcome: "requested_operator", provenance: precedence.provenance });
    expect(crossCheck.deterministicAction).toContain("checksum valido");
    expect(crossCheck.deterministicAction).toContain("codice Belfiore");
    expect(crossCheck.deterministicAction).toContain("non ricavarlo per supposizione");
  });

  it("usa un CF valido di fattura originaria solo quando il form invalido e l'identita coincidono", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.validOriginalDocumentFiscalCode)!;
    expect(rule).toMatchObject({ step: "identity_property", priority: 1000, outcome: "continue", provenance: { authority: "user" } });
    expect(rule.sourcePrecedence[0]).toContain("fatture originarie");
    expect(rule.deterministicAction).toContain("unico");
    expect(rule.deterministicAction).toContain("checksum");
    expect(rule.deterministicAction).toContain("Escludere documenti ENEA storici");
    expect(rule.audit).toContain("CF form/CRM invalido");
  });

  it("limita le regole finanziarie Rinaldi al fornitore e allo scope dichiarato", () => {
    const deductible = registryRule(USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal)!;
    const vepa = registryRule(USER_AUTHORIZED_RULE_IDS.rinaldiPergolaVepaTestEcobonus)!;
    expect(deductible).toMatchObject({ step: "gross_reconciliation", priority: 900, provenance: { authority: "user" } });
    expect(deductible.condition).toContain("Solo rivenditore identificato inequivocabilmente come Rinaldi");
    expect(deductible.deterministicAction).toContain("Non applicare ad altri rivenditori");
    expect(deductible.audit).toContain("numero riga");
    expect(vepa).toMatchObject({ step: "gross_reconciliation", priority: 950, provenance: deductible.provenance });
    expect(vepa.priority).toBeGreaterThan(deductible.priority!);
    expect(vepa.condition).toContain("sola modalità TEST Ecobonus");
    expect(vepa.deterministicAction).toContain("VEPA separata, Bonus Casa non ancora lavorato");
    expect(vepa.deterministicAction).toContain("Vietare creazione e compilazione della pratica Bonus Casa VEPA");
  });

  it("limita a Zeno la segregazione dei prodotti misti e la rende fail-closed", () => {
    const mixed = registryRule(USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly)!;
    expect(mixed).toMatchObject({ step: "screenings", priority: 975, provenance: { authority: "user" } });
    expect(mixed.condition).toContain("Solo test singolo Zeno Righetti");
    expect(mixed.deterministicAction).toContain("soltanto le righe qualificabili come schermature solari ENEA");
    expect(mixed.deterministicAction).toContain("Non propagare");
    expect(mixed.deterministicAction).toContain("Se la qualificazione è ambigua, fermare Zeno");
    expect(mixed.audit).toContain("classificazione inclusa/esclusa");
    expect(mixed.lifecycle).toMatchObject({
      status: "historical_override_non_propagable",
      generalGateEligible: false,
    });
  });

  it("fa prevalere l'unità unica esplicita sul numero descrittivo dei piani", () => {
    const singleUnit = registryRule(USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification)!;
    expect(singleUnit).toMatchObject({ step: "identity_property", priority: 980, outcome: "continue", provenance: { authority: "user" } });
    expect(singleUnit.sourcePrecedence[0]).toContain("numero unità/casa singola esplicito");
    expect(singleUnit.deterministicAction).toContain("singola unità immobiliare");
    expect(singleUnit.deterministicAction).toContain("Tre o più piani non costituiscono conflitto");
    expect(singleUnit.deterministicAction).toContain("soltanto se una fonte primaria contraddice esplicitamente");
    expect(singleUnit.audit).toContain("numero piani descrittivo");
  });

  it("richiede una fonte primaria esplicita per qualificare l'edificio come plurimo", () => {
    const explicitBuilding = registryRule(USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverAffectedUnitCount)!;
    expect(explicitBuilding).toMatchObject({ step: "identity_property", priority: 979, outcome: "continue", provenance: { authority: "user" } });
    expect(explicitBuilding.sourcePrecedence[0]).toContain("condominio o piu unita");
    expect(explicitBuilding.deterministicAction).toContain("soltanto con una dichiarazione primaria esplicita");
    expect(explicitBuilding.deterministicAction).toContain("fino/oltre tre piani");
    expect(explicitBuilding.audit).toContain("fonte primaria della pluralita");
  });

  it("preserva sempre la cardinalità tecnica e separa l'aggregazione economica", () => {
    const cardinality = registryRule(USER_AUTHORIZED_RULE_IDS.technicalProductCardinality)!;
    expect(cardinality).toMatchObject({ step: "screenings", priority: 990, outcome: "continue", provenance: { authority: "user" } });
    expect(cardinality.condition).toContain("TEST o produzione");
    expect(cardinality.deterministicAction).toContain("N righe tecniche ENEA distinte");
    expect(cardinality.deterministicAction).toContain("Vietare superfici aggregate");
    expect(cardinality.deterministicAction).toContain("Aggregare soltanto gli importi economici");
    expect(cardinality.deterministicAction).toContain("per gli esclusi conservare N righe 1:1 nel ledger");
  });

  it("incrocia form, fattura, piano APR e riepilogo ENEA prima di accettare la cardinalita", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck)!;
    expect(rule).toMatchObject({ step: "screenings", priority: 992, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("conteggio form");
    expect(rule.deterministicAction).toContain("esattamente N righe server");
    expect(rule.deterministicAction).toContain("Richiesto intervento operatore");
    expect(rule.audit).toContain("conteggio riepilogo ENEA");
  });

  it("separa le spese professionali comprese dal costo tecnico senza inventare importi", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation)!;
    expect(rule).toMatchObject({ step: "gross_reconciliation", priority: 1046, outcome: "requested_operator", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("Non usare automaticamente l'intero lordo");
    expect(rule.deterministicAction).toContain("una risposta vale solo per quella pratica");
    expect(rule.audit).toContain("importo professionale");
  });

  it("rende obbligatorio l'incrocio economico e non blocca per la sola dicitura fiscale", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck)!;
    expect(rule).toMatchObject({ step: "gross_reconciliation", priority: 1047, outcome: "requested_operator", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("totale fatture IVA incluso resta sempre autorevole");
    expect(rule.deterministicAction).toContain("uguale o inferiore");
    expect(rule.deterministicAction).toContain("capitale supera le fatture");
    expect(rule.deterministicAction).toContain("spesa tecnica + esclusioni");
    expect(rule.deterministicAction).toContain("sola dicitura");
    expect(rule.audit).toContain("tutte le uguaglianze in centesimi");
    const labelRule = registryRule(USER_AUTHORIZED_RULE_IDS.bankTransferTaxReliefLabelNonBlocking)!;
    expect(labelRule).toMatchObject({ step: "gross_reconciliation", priority: 1048, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(labelRule.deterministicAction).toContain("Non bloccare");
    expect(labelRule.deterministicAction).toContain("altri controlli economici e documentali");
    expect(labelRule.audit).toContain("dicitura fiscale originale");
  });

  it("rifiuta il completamento se il riepilogo server perde prodotti o costo", () => {
    const rule = registryRule("system-final-draft-source-cardinality-and-cost-verification")!;
    expect(rule).toMatchObject({ step: "external_gate", kind: "system", outcome: "requested_operator" });
    expect(rule.deterministicAction).toContain("una riga distinta per ogni prodotto fisico");
    expect(rule.deterministicAction).toContain("anche di un centesimo");
    expect(rule.deterministicAction).toContain("non eseguire preview o submit");
  });

  it("espande una riga form di gruppo lasciando prevalere il tipo fattura", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance)!;
    expect(rule).toMatchObject({ step: "screenings", priority: 991, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-15" } });
    expect(rule.sourcePrecedence[0]).toContain("per pezzo nella fattura originaria");
    expect(rule.deterministicAction).toContain("N righe tecniche distinte");
    expect(rule.deterministicAction).toContain("tipo esplicito della fattura prevale");
    expect(rule.deterministicAction).toContain("non genera da solo un blocco");
    expect(rule.audit).toContain("attributi compatibili ereditati per ciascuna riga tecnica");
  });

  it("parcheggia le VEPA fino all'attivazione del modulo dedicato", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.vepaDeferredCurrentPhase)!;
    expect(rule).toMatchObject({ step: "screenings", priority: 997, outcome: "requested_operator", provenance: { authority: "user", receivedAt: "2026-08-16" } });
    expect(rule.deterministicAction).toContain("Modulo VEPA non ancora abilitato");
    expect(rule.deterministicAction).toContain("senza fermare la coda");
    expect(rule.deterministicAction).toContain("Non creare o compilare la bozza");
  });

  it("instrada le VEPA soltanto su Bonus Casa e riusa l'anagrafica condivisa", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.vepaBonusCasaRouting)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_200, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("esclusivamente nel modulo Bonus Casa");
    expect(rule.deterministicAction).toContain("Vietare la creazione, compilazione o riuso di una pratica Ecobonus");
    expect(rule.deterministicAction).toContain("beneficiario, altri beneficiari, codice fiscale, residenza, immobile");
    expect(rule.deterministicAction).toContain("mapping dei campi e dei comandi specifici del portale Bonus Casa resta chiuso");
    expect(rule.audit).toContain("ecobonusAllowed=false");
  });

  it("riusa per gli infissi la baseline schermature cambiando soltanto il tipo intervento", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiSharedWorkflow)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_205, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("stesso flusso gia verificato per le schermature solari");
    expect(rule.deterministicAction).toContain("Comma 345A - Interventi sull'involucro");
    expect(rule.deterministicAction).toContain("invece di Comma 345B - Schermature solari");
    expect(rule.deterministicAction).toContain("non abilitare la bozza");
    expect(rule.audit).toContain("aliquota 50%/36%");
  });

  it("risolve cardinalita, misure, trasmittanza e superficie degli infissi soltanto da fonti originarie", () => {
    const sourceRule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution)!;
    const areaRule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiAreaRounding)!;
    expect(sourceRule).toMatchObject({ step: "economic_sources", priority: 1_215, outcome: "requested_operator", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(sourceRule.sourcePrecedence[0]).toContain("fattura originaria");
    expect(sourceRule.sourcePrecedence[1]).toContain("documenti tecnici originari");
    expect(sourceRule.deterministicAction).toContain("una riga distinta per ogni infisso fisico");
    expect(sourceRule.deterministicAction).toContain("misure esterne complessive");
    expect(sourceRule.deterministicAction).toContain("un'altra coppia di misure documentata");
    expect(sourceRule.deterministicAction).toContain("non scegliere arbitrariamente");
    expect(sourceRule.audit).toContain("trasmittanza e relativa fonte");
    expect(areaRule).toMatchObject({ step: "enea_mapping", priority: 1_214, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(areaRule.deterministicAction).toContain("superficie matematica esatta");
    expect(areaRule.deterministicAction).toContain("un decimale");
    expect(areaRule.deterministicAction).toContain("Non aggregare i pezzi");
  });

  it("applica i fallback Infissi PVC e basso-emissivo senza sovrascrivere fonti esplicite", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_217, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(rule.sourcePrecedence[0]).toContain("espliciti");
    expect(rule.deterministicAction).toContain("PVC");
    expect(rule.deterministicAction).toContain("Bassa emissivita");
    expect(rule.deterministicAction).toContain("non devono sovrascrivere");
  });

  it("applica la trasmittanza 1,3 soltanto se nessuna fonte originaria la specifica", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_218, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(rule.sourcePrecedence[0]).toContain("fattura originaria");
    expect(rule.sourcePrecedence[1]).toContain("documento tecnico originario");
    expect(rule.deterministicAction).toContain("1,3 W/m2K");
    expect(rule.deterministicAction).toContain("due valori espliciti discordanti");
  });

  it("fa prevalere la fattura sul form e deriva la trasmittanza del vecchio infisso con fallback prudenziale 6,0", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_219, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(rule.sourcePrecedence[0]).toContain("fattura originaria");
    expect(rule.sourcePrecedence[1]).toContain("form cliente");
    expect(rule.deterministicAction).toContain("prevale sul relativo valore del form");
    expect(rule.deterministicAction).toContain("matrice autorizzata");
    expect(rule.deterministicAction).toContain("6,0 W/m2K");
    expect(rule.deterministicAction).toContain("Metallo");
    expect(rule.deterministicAction).toContain("Non introdurre sinonimi");
    expect(rule.audit).toContain("motivo fallback");
  });

  it("isola la pratica quando fattura e certificato di trasmittanza hanno cardinalità diverse", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiInvoiceCertificateCardinality)!;
    expect(rule).toMatchObject({ step: "enea_mapping", outcome: "requested_operator", priority: 1_222, provenance: { authority: "user", receivedAt: "2026-08-22" } });
    expect(rule.sourcePrecedence[0]).toContain("fattura originaria");
    expect(rule.sourcePrecedence[1]).toContain("certificato di trasmittanza");
    expect(rule.deterministicAction).toContain("Richiesto intervento operatore");
    expect(rule.deterministicAction).toContain("la coda prosegue");
  });

  it("lascia il risparmio energetico Infissi al calcolo automatico del portale", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_220, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(rule.deterministicAction).toContain("non deve calcolare");
    expect(rule.deterministicAction).toContain("payload e il dry-run devono omettere");
    expect(rule.deterministicAction).toContain("soltanto leggere");
    expect(rule.audit).toContain("mutationAllowed=false");
  });

  it("deriva Chiusure oscuranti soltanto dal SI/NO del form", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm)!;
    expect(rule).toMatchObject({ step: "enea_mapping", priority: 1_216, outcome: "requested_operator", provenance: { authority: "user", receivedAt: "2026-08-19" } });
    expect(rule.deterministicAction).toContain("SI, selezionare");
    expect(rule.deterministicAction).toContain("NO, lasciarlo non selezionato");
    expect(rule.deterministicAction).toContain("Non inferire il flag");
  });

  it("accantona solo Beatrice nel pilot senza cancellare report o propagare la decisione", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.ciottaPilotLeaveAside)!;
    expect(rule).toMatchObject({ step: "runner_lifecycle", kind: "system", priority: 1105, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-15" } });
    expect(rule.condition).toContain("Solo pilot corrente");
    expect(rule.deterministicAction).toContain("conservarne report e blocker per audit");
    expect(rule.deterministicAction).toContain("Non propagare");
    expect(rule.audit).toContain("deferred_operator");
  });

  it("qualifica le zanzariere come Altra schermatura con fonte gTot prevalente sul fallback", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.zanzarieraScreening)!;
    expect(rule).toMatchObject({ step: "screenings", priority: 995, outcome: "continue" });
    expect(rule.sourcePrecedence[0]).toContain("gTot esplicito");
    expect(rule.deterministicAction).toContain("Altra schermatura solare");
    expect(rule.deterministicAction).toContain("materiale Misto");
    expect(rule.deterministicAction).toContain("movimentazione Manuale");
    expect(rule.deterministicAction).toContain("gTot 0,33");
    expect(rule.deterministicAction).toContain("riga ENEA separata per ogni pezzo");
  });

  it("registra il contratto persiana senza confonderlo con avvolgibili o altra schermatura", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.persianaScreening)!;
    expect(rule).toMatchObject({ step: "screenings", kind: "business", priority: 1210, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("tipologia ENEA Persiana");
    expect(rule.deterministicAction).toContain("gTot esplicito oppure 0,08");
    expect(rule.deterministicAction).toContain("resistenza termica supplementare 0,17");
    expect(rule.deterministicAction).toContain("materiale sempre Metallo");
    expect(rule.deterministicAction).toContain("motore/motorizzazione espliciti producono Automatico, altrimenti Manuale");
    expect(rule.deterministicAction).toContain("larghezza 500-4000 mm");
    expect(rule.deterministicAction).toContain("altezza 450-3200 mm");
    expect(rule.deterministicAction).toContain("intercettare refusi");
    expect(rule.deterministicAction).toContain("superficie finestrata protetta coincide con la superficie");
    expect(rule.condition).not.toMatch(/avvolgibil|tapparell/i);
  });

  it("registra gli avvolgibili come contratto persiana con la sola tipologia ENEA diversa", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.avvolgibileScreening)!;
    expect(rule).toMatchObject({ step: "screenings", kind: "business", priority: 1209, outcome: "continue", provenance: { authority: "user", receivedAt: "2026-08-18" } });
    expect(rule.deterministicAction).toContain("Persiane avvolgibili");
    expect(rule.deterministicAction).toContain("gTot esplicito oppure 0,08");
    expect(rule.deterministicAction).toContain("resistenza termica supplementare 0,17");
    expect(rule.deterministicAction).toContain("materiale sempre Metallo/alluminio");
    expect(rule.deterministicAction).toContain("altrimenti Manuale");
    expect(rule.deterministicAction).toContain("larghezza 500-4000 mm");
    expect(rule.deterministicAction).toContain("altezza 450-3200 mm");
    expect(rule.deterministicAction).toContain("superficie finestrata protetta coincide");
  });

  it("registra il keepalive ENEA permanente come regola globale TEST e produzione", () => {
    const rule = registryRule(USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive)!;
    expect(rule).toMatchObject({
      step: "external_gate",
      kind: "system",
      outcome: "continue",
      priority: 800,
      provenance: { authority: "user" },
    });
    expect(rule.sourcePrecedence[0]).toContain("logout");
    expect(rule.deterministicAction).toContain("senza inferire logout");
    expect(rule.deterministicAction).toContain("soltanto con prova server reale");
  });
});
