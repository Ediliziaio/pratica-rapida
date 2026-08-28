export interface AprRuleEvidenceReference {
  fileRef: string;
  testId: string;
}

export interface AprRuleEvidenceCatalogEntry {
  key: string;
  positive: AprRuleEvidenceReference;
  negative: AprRuleEvidenceReference;
}

/**
 * Machine-authoritative, repository-relative links from every APR rule to two
 * distinct executable assertions. Human-readable automaticTests remain in the
 * matrix for documentation; this catalog is the only source accepted by the
 * monotonic activation gate.
 */
export const APR_RULE_EVIDENCE_CATALOG: readonly AprRuleEvidenceCatalogEntry[] = [
  {
    key: "invoice-schedule-missing-amount",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale preserva uno zero monetario esplicito nello scadenziario" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale riconosce la scadenza Beghini due righe dopo la data senza inventare zero" },
  },
  {
    key: "screening-dimension-unit-surface-coherence",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari blocca fail-closed quando unita esplicita e superficie dichiarata sono incoerenti" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari risolve Teotino in centimetri tramite Tot mq e conserva audit di unita e superficie" },
  },
  {
    key: "infissi-third-party-certificate-classification",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalDocumentClassifier.test.ts", testId: "classificazione semantica dei documenti tecnici Infissi non promuove un documento interno che menziona trasmittanza e numeri fuori da un certificato" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalDocumentClassifier.test.ts", testId: "classificazione semantica dei documenti tecnici Infissi riconosce una vera dichiarazione tecnica di terza parte" },
  },
  {
    key: "infissi-internal-technical-document-untrusted",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiOriginalSourcePolicy.test.ts", testId: "fonti Infissi attendibili ed elaborazione ex novo ammette fattura e certificato terzo esplicito, escludendo il documento CRM interno" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali non interpreta parole o numeri generici come righe fisiche senza la sequenza quantita-da-misura" },
  },
  {
    key: "test-ex-novo-original-sources-only",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiOriginalSourcePolicy.test.ts", testId: "fonti Infissi attendibili ed elaborazione ex novo ignora stato operatore e storico ENEA: l'output tecnico resta identico" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali ricostruisce una riga per ciascuna pagina tecnica usando le misure esterne del diagramma" },
  },
  {
    key: "documented-product-module-over-label",
    positive: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie instrada persiane al modulo schermature anche con etichetta Infissi" },
    negative: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie conserva entrambe le famiglie quando la fattura e realmente mista" },
  },
  {
    key: "screening-primary-measurements-operator-routing",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM distingue misure prodotto mancanti dalle sole misure della finestra protetta" },
    negative: { fileRef: "scripts/enea-shadow-runner/deepCaseReview.test.ts", testId: "revisione profonda persistente APR classifica come operatore le misure prodotto realmente assenti dalle fonti primarie" },
  },
  {
    key: "missing-explicit-advance-invoice-reference",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non usa la stessa fattura di saldo per soddisfare il proprio riferimento acconto" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM richiede la fattura di acconto citata e sottratta quando non e presente fra le fonti fiscali" },
  },
  {
    key: "unique-invoice-base-reference-match",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM risolve il suffisso fattura soltanto tramite un numero base univoco e auditabile" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM mantiene fail-closed il suffisso fattura quando piu serie condividono il numero base" },
  },
  {
    key: "composite-invoice-bank-transfer-page-segmentation",
    positive: { fileRef: "scripts/enea-shadow-runner/crmEneaPayloadAudit.test.ts", testId: "audit payload ENEA da dossier CRM locale non trasforma un allegato esclusivamente bancario in una fattura tecnica" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmEneaPayloadAudit.test.ts", testId: "audit payload ENEA da dossier CRM locale conserva la pagina fattura in un allegato composito fattura+bonifico e ne audita la regola" },
  },
  {
    key: "draft-payload-mapping-completeness",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non trasforma un lordo con Pratica ENEA compresa in spesa tecnica senza ripartizione" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM ricalcola da una revisione locale delle fonti senza ripetere il caso o mutare sistemi esterni" },
  },
  {
    key: "paper-form-birth-date-leading-digit-ocr-repair",
    positive: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped ripara soltanto la cifra iniziale 1 della data persa dall'OCR quando il CF valido concorda" },
    negative: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped non modifica date OCR che non hanno una sola ricostruzione concordante col CF" },
  },
  {
    key: "mixed-forty-case-reliability-test",
    positive: { fileRef: "scripts/enea-shadow-runner/crmAuthenticatedReadOnly.test.ts", testId: "acquisizione CRM autenticata e read-only APR applica risoluzioni operatore per duplicato eliminato e pipeline Archiviate senza ripetere gli altri dossier" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprCrmArchivedMixedDiscovery.test.ts", testId: "discovery CRM misto 40 pratiche congela esattamente 20 schermature e 20 Infissi, con pipeline e ordine deterministici" },
  },
  {
    key: "foreign-birth-anpr-registry",
    positive: { fileRef: "src/features/enea-lab/portalBeneficiary.test.ts", testId: "compilazione pagina beneficiario ENEA tratta il luogo di nascita estero come testo libero e conserva l'autocomplete per i Comuni italiani" },
    negative: { fileRef: "src/features/enea-lab/portalBeneficiary.test.ts", testId: "compilazione pagina beneficiario ENEA seleziona una nazione estera dal codice ISO3 ANPR anche quando l'etichetta ENEA differisce" },
  },
  {
    key: "infissi-portal-managed-energy-savings",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA registra in sola lettura il valore calcolato dal portale senza abilitarne la modifica" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA usa i fallback autorizzati e non produce mai un valore di risparmio energetico" },
  },
  {
    key: "infissi-old-window-transmittance-matrix",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiOldWindowTransmittance.test.ts", testId: "APR Infissi · trasmittanza termica del vecchio infisso usa il fallback prudenziale per materiale ambiguo" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiOldWindowTransmittance.test.ts", testId: "APR Infissi · trasmittanza termica del vecchio infisso usa il fallback prudenziale per materiale mancante" },
  },
  {
    key: "infissi-shared-screening-workflow",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiModule.test.ts", testId: "APR modulo Infissi · gate flusso condiviso riusa tutte le sezioni comuni delle schermature cambiando soltanto il tipo intervento" },
    negative: { fileRef: "src/features/enea-shadow-crm/operationalRegistry.test.ts", testId: "registro operativo unico riusa per gli infissi la baseline schermature cambiando soltanto il tipo intervento" },
  },
  {
    key: "infissi-invoice-or-technical-source-resolution",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari non sceglie arbitrariamente quando fattura e documento tecnico confliggono" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari usa numero, misure e trasmittanza espliciti della fattura ed espande ogni pezzo 1:1" },
  },
  {
    key: "infissi-invoice-certificate-cardinality",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiInvoiceCertificateCardinality.test.ts", testId: "APR Infissi · cardinalità fattura contro certificato richiede operatore quando fattura e certificato discordano" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiInvoiceCertificateCardinality.test.ts", testId: "APR Infissi · cardinalità fattura contro certificato non inventa il controllo quando il certificato non è presente" },
  },
  {
    key: "infissi-transmittance-fallback",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari usa il fallback 1,3 soltanto se la trasmittanza manca in entrambe le fonti" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari non usa il fallback quando esiste una trasmittanza esplicita" },
  },
  {
    key: "infissi-portal-transmittance-131-to-13",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA non modifica valori espliciti minori o uguali al massimo ENEA" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA conserva 1,31 dalla fonte e invia 1,3 a ENEA con audit della regola specifica" },
  },
  {
    key: "infissi-portal-transmittance-over-max-to-13",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA non modifica valori espliciti minori o uguali al massimo ENEA" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts", testId: "payload tecnico locale Infissi per ENEA conserva 1,31 dalla fonte e invia 1,3 a ENEA con audit della regola specifica" },
  },
  {
    key: "infissi-enea-area-rounding",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari accetta il normale arrotondamento ENEA della superficie a un decimale" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts", testId: "APR Infissi · fattura e documenti tecnici originari usa numero, misure e trasmittanza espliciti della fattura ed espande ogni pezzo 1:1" },
  },
  {
    key: "infissi-material-glass-fallbacks",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiProductRules.test.ts", testId: "APR Infissi · materiale, vetro e chiusure oscuranti preserva i valori espliciti delle fonti originarie sopra i fallback" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiProductRules.test.ts", testId: "APR Infissi · materiale, vetro e chiusure oscuranti applica PVC e vetro basso-emissivo soltanto quando non sono specificati" },
  },
  {
    key: "infissi-shading-closures-form-flag",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiProductRules.test.ts", testId: "APR Infissi · materiale, vetro e chiusure oscuranti mappa SI su flag selezionato e NO su flag vuoto" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiProductRules.test.ts", testId: "APR Infissi · materiale, vetro e chiusure oscuranti non inventa la risposta quando il campo del form manca o e ambiguo" },
  },
  {
    key: "infissi-shading-closure-invoice-order-allocation",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiShadingClosureAllocation.test.ts", testId: "allocazione chiusure oscuranti Infissi in ordine fattura non assegna posizioni se le righe tecniche seguono l'ordine del certificato" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiShadingClosureAllocation.test.ts", testId: "allocazione chiusure oscuranti Infissi in ordine fattura assegna due chiusure ai primi due di tre infissi e deduplica acconto/saldo identici" },
  },
  {
    key: "vepa-bonus-casa-routing-and-anagraphic-contract",
    positive: { fileRef: "src/features/enea-shadow-crm/vepaModule.test.ts", testId: "APR modulo VEPA · gate locale riusa il contratto anagrafico condiviso ma non inventa campi Bonus Casa" },
    negative: { fileRef: "src/features/enea-shadow-crm/vepaModule.test.ts", testId: "APR modulo VEPA · gate locale dichiara esplicitamente non osservato il mapping portale" },
  },
  {
    key: "persiana-screening-family",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari normalizza cm e mm entro i limiti ampi di plausibilita refuso" },
    negative: { fileRef: "src/features/enea-lab/portalScreening.test.ts", testId: "compilazione finestra schermatura solare ENEA prepara i valori osservati e lascia fuori solo la superficie finestrata mancante" },
  },
  {
    key: "avvolgibile-screening-family",
    positive: { fileRef: "src/features/enea-lab/portalScreening.test.ts", testId: "compilazione finestra schermatura solare ENEA seleziona Persiane avvolgibili tramite l'etichetta esatta e compila Rsupp 0,17" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari normalizza cm e mm entro i limiti ampi di plausibilita refuso" },
  },
  {
    key: "single-case-regression-test",
    positive: { fileRef: "scripts/enea-shadow-runner/aprCohortSeed.test.ts", testId: "seed persistente di una nuova coorte APR consente due casi nuovi soltanto con autorizzazione small-batch esplicita" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprCohortSeed.test.ts", testId: "seed persistente di una nuova coorte APR consente un solo repeat-test con autorizzazione dedicata e dichiara tutto lo storico" },
  },
  {
    key: "invoice-work-date-chronology",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM usa tutte le fatture fiscali uniche per prima data di inizio e ultima data di fine" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmEneaPayloadAudit.test.ts", testId: "audit payload ENEA da dossier CRM locale propaga la prima data fattura come inizio lavori con provenienza auditata" },
  },
  {
    key: "screening-surface-material-over-support-structure",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non propaga motore e materiale di una riga LM alle zanzariere o alle righe manuali" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM separa la struttura in alluminio dal telo Tessuto e riconosce il motore nella regressione Tommaso Cecchi" },
  },
  {
    key: "explicit-composite-screening-material",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM usa Misto soltanto quando i materiali diversi appartengono alla schermatura stessa" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM separa la struttura in alluminio dal telo Tessuto e riconosce il motore nella regressione Tommaso Cecchi" },
  },
  {
    key: "explicit-motorized-screening-movement",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM separa la struttura in alluminio dal telo Tessuto e riconosce il motore nella regressione Tommaso Cecchi" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non propaga motore e materiale di una riga LM alle zanzariere o alle righe manuali" },
  },
  {
    key: "explicit-technical-surface-precision",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari fa prevalere la superficie esplicita Rinaldi sul prodotto delle misure" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari blocca fail-closed quando unita esplicita e superficie dichiarata sono incoerenti" },
  },
  {
    key: "learning-closure-gate",
    positive: { fileRef: "scripts/enea-shadow-runner/ruleMatrixEvidence.test.ts", testId: "matrice regole APR non dichiara regole attive finche test e bundle installato non sono entrambi verificati" },
    negative: { fileRef: "scripts/enea-shadow-runner/ruleMatrixEvidence.test.ts", testId: "matrice regole APR rifiuta un deployment diverso dai bundle appena testati" },
  },
  {
    key: "portal-municipality-controlled-selection",
    positive: { fileRef: "src/features/enea-lab/portalBeneficiary.test.ts", testId: "compilazione pagina beneficiario ENEA tratta il luogo di nascita estero come testo libero e conserva l'autocomplete per i Comuni italiani" },
    negative: { fileRef: "src/features/enea-lab/portalBuilding.test.ts", testId: "compilazione pagina immobile ENEA porta la provincia documentata come qualificatore dell'autocomplete Comune" },
  },
  {
    key: "uncertain-save-single-recovery",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorkerService.test.ts", testId: "gate permanente del servizio browser APR ammette solo la verifica server dell'outer Save incerto e non un secondo recupero mutativo" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorkerService.test.ts", testId: "gate permanente del servizio browser APR persiste il gate coda e non arma due casi senza prova server read-only" },
  },
  {
    key: "post-draft-historical-benchmark-readonly",
    positive: { fileRef: "src/features/enea-shadow-crm/postPilotComparison.test.ts", testId: "matrice confronto post-pilot ammette il PDF storico dopo la bozza soltanto come benchmark isolato" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprHistoricalBenchmark.test.ts", testId: "APR benchmark storico post-bozza confronta soltanto bozze salvate e non propaga valori storici" },
  },
  {
    key: "fifteen-case-intermezzo-repeat",
    positive: { fileRef: "scripts/enea-shadow-runner/aprCohortSeed.test.ts", testId: "seed persistente di una nuova coorte APR arma quindici repeat-test senza eliminare le bozze storiche quando l'autorizzazione lo prevede" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprCohortSeed.test.ts", testId: "seed persistente di una nuova coorte APR consente tre clienti già lavorati soltanto come repeat-test auditato e resta bloccato fino alla prova di eliminazione" },
  },
  {
    key: "linea-sole-potito-paper-form",
    positive: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped usa Sud solo in assenza di orientamento esplicito" },
    negative: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped genera 2,0-2,9 in modo stabile per pratica+riga e lascia prevalere l'esplicito" },
  },
  {
    key: "narrative-invoice-product-extraction",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non attribuisce arbitrariamente due gTot diversi a una descrizione narrativa" },
    negative: { fileRef: "src/features/enea-shadow-crm/operationalRegistry.test.ts", testId: "registro operativo unico estrae prodotti anche dalla descrizione narrativa della fattura" },
  },
  {
    key: "invoice-gross-total-vat-included",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non usa un importo isolato che non coincide con imponibile piu IVA" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari riconosce il lordo S.A. Montaggi quando imponibile e' in coda alla riga aliquota" },
  },
  {
    key: "distinct-invoice-numbers-same-customer-sum",
    positive: { fileRef: "src/features/enea-shadow-crm/financialReconciliation.test.ts", testId: "riconciliazione finanziaria tripla somma automaticamente due fatture OCR con numeri distinti e terne fiscali riconciliate" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM somma acconto e saldo economici ma conserva una sola riga tecnica" },
  },
  {
    key: "missing-invoice-operator-requeue",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM classifica la fattura assente come intervento operatore riprendibile" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM espande una riga form di gruppo e lascia prevalere il tipo esplicito della fattura" },
  },
  {
    key: "default-single-unit",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM normalizza a una unita il numero appartamenti assente o zero e conserva il valore nel pacchetto" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM fa prevalere la tipologia esplicita oltre tre piani sul numero appartamenti della pratica" },
  },
  {
    key: "invoice-total-over-bank-transfers",
    positive: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture estrae capitale, commissioni e totale senza classificare una fattura ordinaria" },
    negative: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture applica EUR 0,05 di tolleranza al capitale e blocca da EUR 0,06" },
  },
  {
    key: "mandatory-bank-transfer-invoice-expense-cross-check",
    positive: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture riconosce la ricevuta BONIFICO AGEVOLAZIONE FISCALE senza trasformarla in fattura" },
    negative: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture estrae capitale, commissioni e totale senza classificare una fattura ordinaria" },
  },
  {
    key: "operator-structured-question-resume",
    positive: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions persiste domanda, risposta e riaccodamento idempotente attraverso un riavvio" },
    negative: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions mantiene il caso bloccato quando l'operatore risponde non determinabile" },
  },
  {
    key: "ten-case-monday-restart",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST distingue login globale da un blocco pratica e lo conserva al riavvio" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST mantiene dieci casi ordinati e dopo un blocco riparte dal successivo senza duplicazioni" },
  },
  {
    key: "random-pilot-five-of-fifteen",
    positive: { fileRef: "scripts/enea-shadow-runner/pilotSample.test.ts", testId: "campione pilot APR 5-su-15 estrae cinque clienti univoci, congela la scelta e la riprende senza riselezionare" },
    negative: { fileRef: "scripts/enea-shadow-runner/pilotSample.test.ts", testId: "campione pilot APR 5-su-15 blocca elenchi incompleti o duplicati e consente il recupero con 15 identità valide" },
  },
  {
    key: "source-explicit-over-fallback",
    positive: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback Cristal" },
    negative: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback pergola" },
  },
  {
    key: "valid-original-document-cf",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM recupera il CF valido dalle fatture originarie solo se unico e coerente col form" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM corregge un solo carattere OCR confondibile del CF con anagrafica concordante" },
  },
  {
    key: "invoice-identity-over-form",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM esclude il cointestatario presente solo nel form quando le fatture identificano un solo beneficiario" },
    negative: { fileRef: "src/features/enea-shadow-crm/operationalRegistry.test.ts", testId: "registro operativo unico fa prevalere l'identita di fattura sul cointestatario presente solo nel form" },
  },
  {
    key: "fiscal-code-identity-cross-check",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM recupera il CF valido dalle fatture originarie solo se unico e coerente col form" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM mantiene il blocco per un codice estero valido ma non presente nel registro verificato" },
  },
  {
    key: "secondary-home-36-percent-allocation",
    positive: { fileRef: "src/features/enea-lab/portalCalculation.test.ts", testId: "pagina calcolo ENEA prepara l'intero totale 2025-2026 al 36% per una seconda abitazione" },
    negative: { fileRef: "src/features/enea-shadow-crm/operationalRegistry.test.ts", testId: "registro operativo unico assegna la seconda abitazione al 36% per ogni intervento e verifica il risultato server" },
  },
  {
    key: "completion-date-latest-invoice",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM manda all'operatore fine lavori oltre 90 giorni e anno portale incompatibile senza inventare date" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM classifica la fattura assente come intervento operatore riprendibile" },
  },
  {
    key: "cristal-fallback",
    positive: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature classifica Cristal come schermatura solare con gTot 0,33" },
    negative: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature non inventa una classificazione per diciture diverse" },
  },
  {
    key: "pergola-fallback",
    positive: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback pergola" },
    negative: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback Cristal" },
  },
  {
    key: "zanzariera-fallbacks",
    positive: { fileRef: "scripts/enea-shadow-runner/localDossierPipeline.test.ts", testId: "pipeline dossier CRM locale APR applica fonti, fallback, Rinaldi, cardinalità, data e unità unica senza azioni esterne" },
    negative: { fileRef: "scripts/enea-shadow-runner/localDossierPipeline.test.ts", testId: "pipeline dossier CRM locale APR blocca una classificazione ambigua senza inventare valori" },
  },
  {
    key: "screening-fallback-material-category-guard",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM blocca sempre una zanzariera generica se il materiale fallback non e Misto" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM lascia draftReady invariato quando il fallback della zanzariera e Misto" },
  },
  {
    key: "physical-cardinality",
    positive: { fileRef: "src/features/enea-shadow-crm/productCardinalityPolicy.test.ts", testId: "cardinalità tecnica prodotti mantiene una sola riga per quantità uno e rifiuta quantità non deterministiche" },
    negative: { fileRef: "src/features/enea-shadow-crm/productCardinalityPolicy.test.ts", testId: "cardinalità tecnica prodotti espande ogni quantità in righe 1:1 senza aggregare la superficie" },
  },
  {
    key: "invoice-header-identity-over-body-reference",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.test.ts", testId: "parseScreeningInvoiceText preferisce il numero nell'intestazione sfalsata al riferimento di acconto nel corpo" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari preferisce l'intestazione cortesia al riferimento a una fattura dedotta" },
  },
  {
    key: "bundled-professional-expense",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non trasforma un lordo con Pratica ENEA compresa in spesa tecnica senza ripartizione" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM applica €1.250 a Elisa senza esclusioni come risoluzione caso-specifica auditata" },
  },
  {
    key: "vepa-deferred-current-phase",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari riconosce una vetrata scorrevole VEPA senza abilitarne la classificazione ENEA" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari legge il formato Vans L.xsp. senza perdere il gTot esplicito" },
  },
  {
    key: "single-house-floors",
    positive: { fileRef: "scripts/enea-shadow-runner/localDossierPipeline.test.ts", testId: "pipeline dossier CRM locale APR applica fonti, fallback, Rinaldi, cardinalità, data e unità unica senza azioni esterne" },
    negative: { fileRef: "scripts/enea-shadow-runner/localDossierPipeline.test.ts", testId: "pipeline dossier CRM locale APR blocca una classificazione ambigua senza inventare valori" },
  },
  {
    key: "explicit-building-type-over-apartment-count",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM fa prevalere la tipologia esplicita oltre tre piani sul numero appartamenti della pratica" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmEneaPayloadAudit.test.ts", testId: "audit payload ENEA da dossier CRM locale usa edificio plurimo quando il form indica oltre tre piani anche con una unita nella pratica" },
  },
  {
    key: "obvious-street-type-typo",
    positive: { fileRef: "src/features/enea-lab/mapper.test.ts", testId: "mapSchermaturaPractice corregge il solo refuso Viake in Viale su residenza e lavori" },
    negative: { fileRef: "src/features/enea-lab/mapper.test.ts", testId: "mapSchermaturaPractice non modifica parole o tipi stradali che non sono il token Viake" },
  },
  {
    key: "rinaldi-scoped",
    positive: { fileRef: "src/features/enea-shadow-crm/rinaldiFinancialPolicies.test.ts", testId: "regole finanziarie limitate a Rinaldi usa l'unico totale massimo detraibile certo" },
    negative: { fileRef: "src/features/enea-shadow-crm/rinaldiFinancialPolicies.test.ts", testId: "regole finanziarie limitate a Rinaldi separa VEPA dalla pergola soltanto nel TEST Ecobonus" },
  },
  {
    key: "test-stop-before-external",
    positive: { fileRef: "scripts/enea-shadow-runner/localDossierBatch.test.ts", testId: "batch locale APR ENEA riprende automaticamente un elemento reclamato dopo stop senza Codex, senza duplicati o perdite" },
    negative: { fileRef: "scripts/enea-shadow-runner/localDossierBatch.test.ts", testId: "batch locale APR ENEA gestisce 15 input con duplicato, blocchi per-pratica e riavvio senza perdite" },
  },
  {
    key: "deduplicate-queue",
    positive: { fileRef: "scripts/enea-shadow-runner/executionPlan.test.ts", testId: "piano di esecuzione locale indipendente dalla chat deduplica i nomi, non richiede bridge e sopravvive a una nuova istanza" },
    negative: { fileRef: "scripts/enea-shadow-runner/localDossierBatch.test.ts", testId: "batch locale APR ENEA gestisce 15 input con duplicato, blocchi per-pratica e riavvio senza perdite" },
  },
  {
    key: "manual-crm-comparison-scope",
    positive: { fileRef: "src/features/enea-shadow-crm/comparisonPolicy.test.ts", testId: "scope confronto CRM manuale non usa documenti ENEA storici e non esclude la data fuori TEST" },
    negative: { fileRef: "src/features/enea-shadow-crm/comparisonPolicy.test.ts", testId: "scope confronto CRM manuale esclude i quattro gruppi richiesti in TEST" },
  },
  {
    key: "crm-readonly-adapter",
    positive: { fileRef: "scripts/enea-shadow-runner/crmReadOnlyAdapter.test.ts", testId: "adapter CRM APR persistente esclusivamente locale sostituisce il vecchio blocco bootstrap soltanto con prove GET autenticate reali" },
    negative: { fileRef: "src/features/enea-shadow-crm/aprCrmReadOnlyContract.test.ts", testId: "contratto adapter CRM APR read-only rifiuta chiavi sconosciute/credenziali e capability mancanti" },
  },
] as const;

