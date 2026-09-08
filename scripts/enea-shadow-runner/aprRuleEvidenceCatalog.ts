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
    key: "user-decision-permanent-learning-governance",
    positive: { fileRef: "scripts/enea-shadow-runner/userDecisionRegistry.test.ts", testId: "registro durevole delle decisioni di Giuliano registra ogni risposta riutilizzabile come general_rule_candidate per default" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprRuleGovernanceAdmission.test.ts", testId: "admission APR vincolata a bundle registro matrice e decisioni fallisce chiuso con attestazione assente o bundle modificato" },
  },
  {
    key: "portal-intermediary-physical-beneficiary",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR crea una sola bozza attraverso il wizard intermediario persona fisica" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR inventa in sola lettura la pagina intermedia senza submit o secondo tentativo" },
  },
  {
    key: "intervention-authoritative-sources-and-defaults",
    positive: { fileRef: "src/features/enea-lab/portalIntervention.test.ts", testId: "compilazione pagina intervento ENEA compila i campi, sceglie il comma e non attiva Salva" },
    negative: { fileRef: "src/features/enea-lab/mapper.test.ts", testId: "mapSchermaturaPractice mappa i dati certi senza perdere i campi mancanti" },
  },
  {
    key: "existing-plant-authoritative-mapping",
    positive: { fileRef: "src/features/enea-lab/plantRules.test.ts", testId: "regole impianto termico esistente ENEA mantiene fisse distribuzione C e regolazione ad ambiente o zona" },
    negative: { fileRef: "src/features/enea-lab/plantRules.test.ts", testId: "regole impianto termico esistente ENEA lascia vuoti gli input assenti o non riconosciuti senza scegliere una famiglia" },
  },
  {
    key: "technical-autonomy-procedible-denominator",
    positive: { fileRef: "src/features/enea-shadow-crm/technicalAutonomyMetric.test.ts", testId: "autonomia tecnica sulle sole pratiche procedibili esclude solo i documenti realmente indisponibili e conserva errori tecnici e falsi blocchi nel denominatore" },
    negative: { fileRef: "src/features/enea-shadow-crm/technicalAutonomyMetric.test.ts", testId: "autonomia tecnica sulle sole pratiche procedibili fallisce chiuso senza identita univoca o prova della classificazione" },
  },
  {
    key: "structured-residual-case-question",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM classifica la fattura assente come intervento operatore riprendibile" },
    negative: { fileRef: "src/features/enea-shadow-crm/technicalAutonomyMetric.test.ts", testId: "residui strutturati per operatore e onboarding rifiuta descrizioni incomplete, domande non dirette e documenti mancanti senza tipo" },
  },
  {
    key: "official-municipality-canonical-identity",
    positive: { fileRef: "src/features/enea-shadow-crm/officialMunicipalities.test.ts", testId: "catalogo corrente ufficiale dei Comuni risolve una grafia senza spazio e la provincia estesa verso l'entita ISTAT" },
    negative: { fileRef: "src/features/enea-shadow-crm/officialMunicipalities.test.ts", testId: "catalogo corrente ufficiale dei Comuni resta fail-closed per omonimia o provincia discordante" },
  },
  {
    key: "infissi-required-revisions-durable-convergence",
    positive: { fileRef: "scripts/enea-shadow-runner/infissiExecutionGate.test.ts", testId: "gate di avvio esecuzione Infissi ripristina una revisione persa da uno scrittore concorrente prima di aprire il gate" },
    negative: { fileRef: "scripts/enea-shadow-runner/infissiExecutionGate.test.ts", testId: "gate di avvio esecuzione Infissi fallisce chiuso se una revisione obbligatoria non diventa durevole" },
  },
  {
    key: "cohort-seed-atomic-fresh-generation-initialization",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST deriva fresh_generation dal seed autorevole anche se un altro processo ha inizializzato prima il checkpoint" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST mantiene false per una coorte ordinaria e rifiuta seed invalido o override divergente" },
  },
  {
    key: "checkpoint-roundtrip-fail-closed-restore",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST ricostruisce la stessa generazione e bozza da tre prove indipendenti lasciando solo la verifica read-only" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST rifiuta prove duplicate o una fonte congelata discordante senza mutare il checkpoint" },
  },
  {
    key: "verified-package-recovery-intent-accounting",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST riaccoda la stessa bozza Infissi quando il luogo estero corretto sostituisce un payload non persistito" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST applica il pacchetto Infissi senza falso cointestatario prima di consumare un recupero" },
  },
  {
    key: "verified-package-recovery-accounting-candidate-separation",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST riaccoda la stessa bozza Infissi quando il luogo estero corretto sostituisce un payload non persistito" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST non confonde un recupero ordinario con il repair accounting riservato a un pacchetto corretto" },
  },
  {
    key: "sequencer-nonterminal-continuous-observation",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza resta fail-closed e continua ad attendere il worker finche la verita diventa terminale" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza non finalizza probing o recovery_queued come blocchi pratica" },
  },
  {
    key: "sequencer-deep-review-terminal-gate",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza attende la conclusione reale della deep review prima di finalizzare un preflight bloccato" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza rifiuta fail-closed un terminale preflight se deep review e blocker non concordano" },
  },
  {
    key: "infissi-recovery-candidate-transition-parity",
    positive: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST ripristina solo il prefisso Infissi staged perso quando la GET canonica prova zero righe" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST riapre una sola generazione Infissi dopo doppia prova del classificatore corretto e zero righe server" },
  },
  {
    key: "apr-continuity-no-orchestrator-stop",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza pubblica una verita terminale stabile senza arrestare il worker persistente" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerCaseFinalizer.test.ts", testId: "finalizzatore autorevole dopo quiescenza rifiuta un verdetto se il worker non e' realmente quiescente" },
  },
  {
    key: "generation-scoped-canonical-draft",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorker.test.ts", testId: "APR browser worker persistente e autonomo separa discovery della nuova generazione dalla ripresa tecnica e fissa la bozza canonica" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST un crash prima dell'atomic write lascia soltanto la generazione congelata" },
  },
  {
    key: "single-page-recovery-filling-lifecycle",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server mantiene non terminale il recupero generale dopo claim con la stessa prova server not_saved e budget uno" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server rifiuta il recupero generale dopo claim se prova, pagina o budget non coincidono" },
  },
  {
    key: "single-page-recovery-save-intent-lifecycle",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server mantiene non terminale l'unico Salva di recupero finche le sonde read-only non concludono" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server rifiuta il Salva di recupero se bozza, prova o contatore non sono quelli autorizzati" },
  },
  {
    key: "recoverable-transient-pre-save-observation",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server riconosce come riprendibile solo un errore CDP precedente a qualunque Salva pendente" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server fallisce chiuso se probing o recovery_queued contraddicono checkpoint e budget" },
  },
  {
    key: "terminal-observability-live-source-supersession",
    positive: { fileRef: "scripts/enea-shadow-runner/aprTerminalObservability.test.ts", testId: "snapshot terminale APR atomico e condiviso mantiene autorevole il terminale quando coincide esattamente con le fonti persistenti" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprTerminalObservability.test.ts", testId: "snapshot terminale APR atomico e condiviso non ripubblica come corrente un terminale storico dopo una nuova generazione attiva" },
  },
  {
    key: "original-pratica-rapida-paper-form-explicit-values",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM accetta i soli valori espliciti del modulo cartaceo PraticaRapida anche per un altro rivenditore" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM rifiuta fail-closed un modulo cartaceo PraticaRapida con identità diversa" },
  },
  {
    key: "positioned-technical-order-products",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari legge le posizioni fisiche di una scheda ordine persiane" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari ignora una posizione ordine senza quantità esplicita" },
  },
  {
    key: "inline-description-product-measurements",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari legge una tenda Linea Sole quando LxH resta sulla riga descrittiva" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non trasforma in tenda una misura LxH priva di una riga prodotto e gTot" },
  },
  {
    key: "tabular-equal-price-amount-single-quantity",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari ricava una sola unità quando SdI perde la quantità ma prezzo e importo di riga coincidono" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non ricava la quantità SdI se prezzo unitario e importo di riga non coincidono" },
  },
  {
    key: "explicit-percentage-causal-technical-supersession",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non duplica il prodotto quando acconto e saldo sono espressi come causali percentuali" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non fonde due fatture tecniche per parole acconto e saldo fuori da una causale esplicita" },
  },
  {
    key: "rotated-ocr-fiscal-reading-order",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo separa due fatture SdI quando la seconda pagina OCR 180 e' in ordine inverso" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non inverte pagine senza marker o gia in ordine e resta fail-closed se mancano gli ancoraggi" },
  },
  {
    key: "rotated-ocr-total-invoice-reading-order",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo riordina una fattura OCR 180 quando il totale fiscale e etichettato TOTALE FATTURA" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non inverte pagine senza marker o gia in ordine e resta fail-closed se mancano gli ancoraggi" },
  },
  {
    key: "native-ocr-fiscal-duplicate-authority",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo preferisce il PDF nativo alla scansione OCR duplicata solo con identita fiscale e prodotto concordanti" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo mantiene fail-closed copie native OCR se data, soggetti fiscali o prodotto non concordano" },
  },
  {
    key: "producer-position-table-infissi",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali legge tutte le posizioni di una dichiarazione produttore con quantita, L/H e Uw coerenti" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali resta fail-closed se una posizione produttore ha misure discordanti o Uw mancante" },
  },
  {
    key: "single-product-energy-declaration-infissi",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali legge una dichiarazione energetica con una sola tipologia completa e Uw esplicito" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali mantiene fail-closed dichiarazioni energetiche con più tipologie o Uw discordanti" },
  },
  {
    key: "technical-document-practice-binding-product-signature-only",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali regola generale di Giuliano (Cappello): un certificato del produttore senza alcun nome cliente/rivenditore ne' numero d'ordine e' comunque accettato — quel tipo di documento non li riporta mai, non e' un'anomalia" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali rifiuta fail-closed Gemma soltanto per un vero conflitto di misura dichiarata in fattura (non per l'assenza del nome cliente/rivenditore nel certificato, che e' normale)" },
  },
  {
    key: "parenthesized-uw-certificate-classification",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali legge tutte le posizioni finestra di una DoP formale con Uw tra parentesi ed esclude gli accessori 0 x 0" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali mantiene fail-closed l'intera DoP posizionale se una finestra non ha un Uw univoco" },
  },
  {
    key: "multipage-bank-receipt-label-reconciliation",
    positive: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture separa ricevute bancarie eterogenee e riconcilia i totali anche se le etichette OCR sono sfalsate" },
    negative: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture resta fail-closed se il prospetto credito/debito contiene più importi ripetuti" },
  },
  {
    key: "invoice-multi-document-fiscal-segmentation-v2",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo separa tutte le fatture fiscali in un fascicolo OCR anche con testate verticali o SdI ripetute" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEconomicCorpusReplay.test.ts", testId: "bridge economico: confine fattura/bonifico rifiuta fail-closed una ricevuta bancaria che cita numero e data fattura" },
  },
  {
    key: "zero-total-full-reversal-non-economic",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale classifica come non economica la fattura di puro storno a zero solo con prove contabili complete" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale non esclude una fattura a zero senza riferimento e righe negative di storno" },
  },
  {
    key: "resolved-non-economic-total-blocker-retirement",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non ripubblica il blocker generico dopo lo storno zero verificato e conserva audit e tripla riconciliazione" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM ritira il falso blocker totale soltanto quando ogni totale nullo coincide con uno storno non economico verificato" },
  },
  {
    key: "document-ocr-orientation-normalization",
    positive: { fileRef: "scripts/enea-shadow-runner/crmDocumentAnalysis.test.ts", testId: "analisi locale persistente dei PDF CRM riarma una sola volta soltanto le vecchie fatture OCR prive di marker orientamento" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmDocumentAnalysis.test.ts", testId: "analisi locale persistente dei PDF CRM non riarma una fattura OCR che possiede gia il marker di orientamento" },
  },
  {
    key: "label-anchored-invoice-totals",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo preferisce il totale fattura etichettato al totale ordine e al totale IVA di colonna" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale non scambia il totale documento Bonfanti per l'IVA nel riepilogo fiscale verticale" },
  },
  {
    key: "sdi-pa-digitale-fiscal-summary",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale riconcilia il riepilogo IVA PA-Digitale a una o più aliquote e il pagamento separato" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale regola generale di Giuliano: un riepilogo IVA PA-Digitale che non torna col totale documento è comunque riconciliato sul solo totale dichiarato" },
  },
  {
    key: "current-cohort-economic-bridge",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEconomicCurrentCohort.test.ts", testId: "APR bridge economico dalla coorte corrente usa dossier e analisi correnti senza appartenenza a un corpus storico" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEconomicCurrentCohort.test.ts", testId: "APR bridge economico dalla coorte corrente fallisce chiuso se checkpoint e dossier non concordano sull'identita pratica" },
  },
  {
    key: "co-beneficiary-single-intent-delivery",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR consegna lo stesso intento con Enter solo quando il pointer non ha prodotto alcuna mutazione" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR non ripete l'attivazione quando il pointer ha gia prodotto una richiesta mutativa" },
  },
  {
    key: "shared-screening-classifier-gtot",
    positive: { fileRef: "src/features/enea-shadow-crm/productClassifier.test.ts", testId: "classificatore condiviso e politica gTot applica un solo fallback per famiglia a Tenda da sole" },
    negative: { fileRef: "src/features/enea-shadow-crm/productClassifier.test.ts", testId: "classificatore condiviso e politica gTot fallisce chiuso senza una famiglia con fallback autorizzato per Cristal trasparente" },
  },
  {
    key: "dimensioned-awning-row-preservation",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari conserva la tenda Parolo dimensionata anche quando il gTot non e presente nella fattura" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non trasforma in prodotto una fattura di solo acconto o una riga di detrazione" },
  },
  {
    key: "labelled-screening-depth-abbreviation",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari riconosce la pergotenda quando la sporgenza e etichettata con la sola S" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non promuove una coppia numerica senza entrambe le etichette L e S" },
  },
  {
    key: "explicit-acconto-saldo-particle-technical-supersession",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo usa solo il saldo tecnico per le causali fattura di acconto e fattura a saldo" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non fonde due fatture tecniche per parole acconto e saldo fuori da una causale esplicita" },
  },
  {
    key: "specific-incomplete-screening-blocker",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM applica alla tenda fisica riconosciuta il fallback generale gTot 0,13" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM mantiene screenings_missing quando nessuna fonte contiene un prodotto fisico" },
  },
  {
    key: "no-valid-economic-invoice",
    positive: { fileRef: "src/features/enea-shadow-crm/financialReconciliation.test.ts", testId: "riconciliazione finanziaria tripla classifica come intervento operatore l'assenza di qualsiasi fattura economica candidata valida" },
    negative: { fileRef: "src/features/enea-shadow-crm/financialReconciliation.test.ts", testId: "riconciliazione finanziaria tripla blocca fail-closed una fonte dichiarata fattura senza terna completa" },
  },
  {
    key: "apr-chrome-keepalive-immortal",
    positive: { fileRef: "scripts/enea-shadow-runner/aprChromeKeepaliveProtection.test.ts", testId: "Chrome APR persistente non e' un target arrestabile quiescenza, arresto finale e residui non includono mai Chrome" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprChromeKeepaliveProtection.test.ts", testId: "Chrome APR persistente non e' un target arrestabile riconosce l'identita' Chrome CDP e rifiuta fail-closed ogni segnale diretto" },
  },
  {
    key: "sequencer-progress-watchdog",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerSessionGuard.test.ts", testId: "watchdog del sequencer senza attese di due ore azzera il timer quando il checkpoint avanza davvero" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerSessionGuard.test.ts", testId: "watchdog del sequencer senza attese di due ore un timeout watchdog generico non diventa mai intervento operatore sulla pratica" },
  },
  {
    key: "sequencer-manifest-contract",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerManifestGuard.test.ts", testId: "contratto manifest del sequencer APR accetta il test mirato autorizzato quando stage e identita sono dichiarati" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerManifestGuard.test.ts", testId: "contratto manifest del sequencer APR fallisce chiuso con un errore tipizzato se allowedStages manca" },
  },
  {
    key: "global-enea-browser-controller",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA collega isolamento, lease di pratica, terminazione timeout e finalizzazione quiescente" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA fallisce chiuso se il lock persistente è corrotto" },
  },
  {
    key: "global-browser-lock-atomic-publication",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA pubblica il lock esclusivo soltanto come JSON completo e già sincronizzato" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA non sostituisce mai un lock già pubblicato durante la contesa" },
  },
  {
    key: "sequencer-recovery-queued-server-proof",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server accetta una sola prova not_saved sulla stessa bozza con budget residuo pari a uno" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server fallisce chiuso se la prova non e not_saved o il budget residuo non e uno" },
  },
  {
    key: "worker-recovery-queued-continuation",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorker.test.ts", testId: "APR browser worker persistente e autonomo interrompe le sonde residue quando la GET canonica autorizza il recupero automatico" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorker.test.ts", testId: "APR browser worker persistente e autonomo dopo tre prove inconcludenti isola solo il caso e completa il successivo senza perdita di coda" },
  },
  {
    key: "sequencer-uncertain-save-probe-lifecycle",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerSessionGuard.test.ts", testId: "watchdog del sequencer senza attese di due ore ritira soltanto INCONSISTENT con autorizzazione, coorte e bozza coincidenti" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerSessionGuard.test.ts", testId: "watchdog del sequencer senza attese di due ore lascia intatto un risultato terminale o con identita discordante" },
  },
  {
    key: "screening-fresh-proof-before-terminal",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA rivaluta le prove canoniche fresche prima di consumare le sonde o pubblicare un terminale" },
    negative: { fileRef: "scripts/enea-shadow-runner/eneaDraftExecution.test.ts", testId: "esecuzione persistente della sola bozza ENEA TEST mantiene OPERATOR_REQUIRED quando una delle due prove di assenza non e conclusiva" },
  },
  {
    key: "sequencer-screening-canonical-absence-resume",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server riapre il worker soltanto con due prove canoniche indipendenti di assenza delle righe" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server mantiene terminale fail-closed se una prova di assenza non e canonica o il budget e consumato" },
  },
  {
    key: "sequencer-screening-recovery-filling-lifecycle",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server accetta il recovery del prefisso parziale solo se prova persistita e audit canonico coincidono" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server rifiuta filling recovery_authorized se identita, prova o budget non coincidono" },
  },
  {
    key: "sequencer-recovery-prepared-window-lifecycle",
    positive: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server mantiene non terminale la finestra prepared tra preparazione e intento dell'unico recupero" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprSequencerRecoveryQueuedGate.test.ts", testId: "gate sequencer recovery_queued con prova server rifiuta la finestra prepared senza prova di preparazione o con budget consumato" },
  },
  {
    key: "fenced-browser-capability-v2",
    positive: { fileRef: "scripts/enea-shadow-runner/aprEneaGlobalBrowserController.test.ts", testId: "controllore globale esclusivo Chrome/ENEA fence un holder vivo ma con lease scaduta e invalida la capability precedente" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpClientTimeout.test.ts", testId: "timeout CDP con terminazione dell'esecuzione browser ricontrolla il fencing durante l'intera evaluate e termina il vecchio holder" },
  },
  {
    key: "cdp-readonly-same-origin-navigation",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpClientIdentity.test.ts", testId: "identità Chrome e client CDP residui consente soltanto una navigazione GET read-only HTTPS sulla stessa origine" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpClientIdentity.test.ts", testId: "identità Chrome e client CDP residui rifiuta Page.navigate con una capability read-only prima di aprire il websocket" },
  },
  {
    key: "chrome-instance-identity-receipt",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpClientIdentity.test.ts", testId: "identità Chrome e client CDP residui scrive una receipt di attach legata a nonce, owner, epoch e /json/list" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpClientIdentity.test.ts", testId: "identità Chrome e client CDP residui rifiuta fail-closed un client vivo appartenente alla coorte precedente" },
  },
  {
    key: "cdp-explicit-operation-timeouts",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpClientTimeout.test.ts", testId: "timeout CDP con terminazione dell'esecuzione browser usa awaitPromise=false per DOM_READ e true per la riconciliazione dichiarata" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEvaluateContract.test.ts", testId: "contratto AST dei timeout Runtime.evaluate impone probe DOM sincroni e polling Node per i marker React" },
  },
  {
    key: "nested-page-transaction",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR riconosce una sola riga schermatura dal contenuto tecnico anche quando l'indice ordinale non è più disponibile" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprEneaBrowserWorker.test.ts", testId: "APR browser worker persistente e autonomo resta fail-closed se la prova JSON server indipendente non conferma il Generatore" },
  },
  {
    key: "enea-save-material-delivery-proof",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "consegna materiale del singolo intento Salva riconosce la mutazione applicativa soltanto sull'endpoint della stessa bozza" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "consegna materiale del singolo intento Salva non scambia il POST opaco anti-bot per un salvataggio ENEA" },
  },
  {
    key: "calculation-allocation-single-intent-delivery",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR completa lo stesso intento allocazione con tastiera fidata se il puntatore non raggiunge onSubmit" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "consegna del singolo intento nel modale allocazione consente il fallback soltanto con modale ancora aperto e tabella immutata" },
  },
  {
    key: "final-draft-durable-canonical-proof",
    positive: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR certifica la bozza con prova server annidata autorevole e verifica canonica finale /calcolo" },
    negative: { fileRef: "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts", testId: "driver Chrome persistente di APR rifiuta la bozza finale se la sonda server annidata più recente è negativa o la rotta finale non è /calcolo" },
  },
  {
    key: "terminal-observability-snapshot",
    positive: { fileRef: "scripts/enea-shadow-runner/dashboardOperationalStatus.test.ts", testId: "verità operativa dashboard APR usa lo snapshot terminale del sequencer anche se il worker quiescente conserva operator_intervention" },
    negative: { fileRef: "scripts/enea-shadow-runner/dashboardOperationalStatus.test.ts", testId: "verità operativa dashboard APR resta fail-closed come INCONSISTENT se lo snapshot terminale non e coerente" },
  },
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
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM reconcileAuthoritativeInfissiApplicability regressione Olteanu: riconcilia una pratica Infissi anche quando il gate Infissi ha propri blocker tecnici aperti (coorte 2925)" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM reconcileAuthoritativeInfissiApplicability non riconcilia (e non nasconde blocker Schermature reali per) una pratica classificata come mixed" },
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
    key: "explicit-advance-invoice-reference-marker",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non scambia l'imponibile della fattura di acconto corrente per il numero di un'altra fattura" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo riconosce anche il riferimento Fatt.acconto scritto prima della parola acconto" },
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
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM rende lavorabile Lucia Lagrasta usando il lordo IVA incluso della seconda pagina" },
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
    key: "official-municipality-province-lineage",
    positive: { fileRef: "src/features/enea-lab/portalBuilding.test.ts", testId: "compilazione pagina immobile ENEA consegna a ENEA provincia e codice correnti quando il Comune lavori usa una sigla storica" },
    negative: { fileRef: "src/features/enea-lab/portalBuilding.test.ts", testId: "compilazione pagina immobile ENEA non converte una provincia estranea al lignaggio ufficiale del Comune lavori" },
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
    key: "official-identity-over-manual-crm",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM fa prevalere giorno, mese e sesso del CF documentale usando solo il secolo concordante del form" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM resta fail-closed se il secolo non e ricavabile senza contraddire l'anno del form" },
  },
  {
    key: "permanent-supplier-automation-exclusion",
    positive: { fileRef: "scripts/enea-shadow-runner/aprFutureTestExclusions.test.ts", testId: "esclusioni permanenti APR per relazione riconosce Erre Emme e RM Legno nei campi CRM disponibili" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprFutureTestExclusions.test.ts", testId: "esclusioni permanenti APR per relazione non estende gli alias a nomi solo parzialmente simili" },
  },
  {
    key: "permanent-internal-practice-exclusion",
    positive: { fileRef: "scripts/enea-shadow-runner/aprFutureTestExclusions.test.ts", testId: "esclusioni permanenti APR per relazione esclude la pratica interna PROVA RIVENDITORE 1 30/04 prima dell'elaborazione" },
    negative: { fileRef: "scripts/enea-shadow-runner/aprFutureTestExclusions.test.ts", testId: "esclusioni permanenti APR per relazione non estende l'esclusione interna a pratiche dal nome soltanto simile" },
  },
  {
    key: "fiscal-code-identity-cross-check",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM recupera il CF valido dalle fatture originarie solo se unico e coerente col form" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM mantiene il blocco per un codice estero valido ma non presente nel registro verificato" },
  },
  {
    key: "invoice-customer-block-crm-cf",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM conferma il CF CRM valido soltanto dentro il blocco CLIENTE della fattura originaria" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non conferma il CF CRM se compare soltanto nel bonifico o se nome e prefissi fiscali divergono" },
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
    key: "explicit-original-completion-date",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM usa una dichiarazione originaria esplicita di fine installazione prima della data fattura" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non trasforma date di fattura, pagamento o posa descrittiva in fine lavori e fallisce chiuso sui conflitti" },
  },
  {
    key: "cristal-explicit-or-operator",
    positive: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback Cristal" },
    negative: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature blocca Cristal senza gTot documentato" },
  },
  {
    key: "pergola-fallback",
    positive: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback pergola" },
    negative: { fileRef: "src/features/enea-shadow-crm/userAuthorizedPolicies.test.ts", testId: "policy utente schermature usa il gTot esplicito della fonte originaria prima del fallback Cristal" },
  },
  {
    key: "zanzariera-fallbacks",
    positive: { fileRef: "scripts/enea-shadow-runner/localDossierPipeline.test.ts", testId: "pipeline dossier CRM locale APR applica i fallback autorizzati inclusa la tenda generica senza gTot" },
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
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione di collegamento: una pratica con «Pratica ENEA compresa» e nessuna esclusione documentata NON produce piu' il blocker bundled_professional_expense_unitemized end-to-end" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non esclude piu' una fattura professionale ENEA separata: il lordo resta la somma di tutte le fatture (regola 2026-09-06)" },
  },
  {
    key: "vepa-deferred-current-phase",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari riconosce una vetrata scorrevole VEPA senza abilitarne la classificazione ENEA" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari legge il formato Vans L.xsp. senza perdere il gTot esplicito" },
  },
  {
    key: "single-house-floors",
    positive: { fileRef: "src/features/enea-shadow-crm/operationalRegistry.test.ts", testId: "registro operativo unico fa prevalere l'unità unica esplicita sul numero descrittivo dei piani" },
    negative: { fileRef: "src/features/enea-shadow-crm/workflow.test.ts", testId: "workflow CRM ombra separa unità interessate e totale edificio e blocca incoerenze" },
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
    positive: { fileRef: "src/features/enea-shadow-crm/rinaldiFinancialPolicies.test.ts", testId: "regole finanziarie limitate a Rinaldi usa la spesa congrua Rinaldi esplicita seguita dall'importo" },
    negative: { fileRef: "src/features/enea-shadow-crm/rinaldiFinancialPolicies.test.ts", testId: "regole finanziarie limitate a Rinaldi senza riga spese congrue Rinaldi non sostituisce il lordo fattura" },
  },
  {
    key: "invoice-work-date-order-scoped",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Calvacchi: un acconto di un ordine precedente gia' saldato non retrodata l'inizio lavori dell'ordine corrente (user-2026-09-06-invoice-work-date-chronology-order-scoped-v1)" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM senza riferimento Ordine Cliente resta la prima fattura dell'intero dossier (comportamento storico invariato)" },
  },
  {
    key: "gross-invoice-sum-supersedes-service-separation",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non esclude piu' una fattura professionale ENEA separata: il lordo resta la somma di tutte le fatture (regola 2026-09-06)" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM conserva per continuita' di audit la risoluzione caso-specifica storica di Elisa, ma non richiede piu' operatore per altre pratiche con lordo diverso" },
  },
  {
    key: "official-works-municipality-over-manual-crm",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione di collegamento: il Comune lavori documentale prevale sul dato CRM discordante end-to-end" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione: NON sostituisce il Comune lavori con l'indirizzo di fatturazione quando residenza e lavori sono dichiarati diversi e la fattura non prova un cantiere distinto" },
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
  {
    key: "portoncino-recognized-as-infisso",
    positive: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie regola generale di Giuliano (Gemma Minore): il portoncino, blindato o d'ingresso, e' riconosciuto come infisso" },
    negative: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie regola generale di Giuliano: riconosce anche la dicitura 'porta blindata'/'porta d'ingresso' come infisso" },
  },
  {
    key: "invoice-gross-total-never-internally-verified",
    positive: { fileRef: "src/features/enea-shadow-crm/financialReconciliation.test.ts", testId: "riconciliazione finanziaria tripla regola generale di Giuliano: accetta anche quando imponibile+IVA non torna col lordo, perché quella coerenza interna non viene più verificata" },
    negative: { fileRef: "src/features/enea-shadow-crm/financialReconciliation.test.ts", testId: "riconciliazione finanziaria tripla regola generale di Giuliano: non blocca mai per un presunto mismatch imponibile+IVA, usa esclusivamente il lordo dichiarato" },
  },
  {
    key: "screening-invoice-description-inherits-uniform-form-family",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regola generale di Giuliano (De Filippo): la fattura vince anche con piu' righe form, quando una dicitura generica non riconosciuta ha un'unica famiglia form da ereditare" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regola generale di Giuliano: la dicitura generica non riconosciuta resta un vero conflitto quando il form dichiara piu' famiglie diverse" },
  },
  {
    key: "multiple-measurement-pairs-always-distinct-products",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano (Ferletic): due coppie di misure 'N) L. ... X H ...' nella stessa descrizione tenda sono sempre due prodotti fisici distinti" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano: una sola coppia di misure 'N) L. ... X H ...' non attiva la regola delle due coppie (non inventa mai una seconda riga)" },
  },
  {
    key: "last-bare-totale-occurrence-wins",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano (Laurelli): senza un'etichetta piu' specifica, con piu' righe 'Totale' vince sempre l'ultima (dopo lo storno dell'acconto interno)" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano: una sola riga 'Totale' resta quella usata (non e' richiesta la presenza di uno storno)" },
  },
  {
    key: "unlabelled-unambiguous-measurement-pair",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano (Laurelli): riconosce la misura 'N. <n> TEND[AE] DA <numero> X <numero>' anche senza le etichette esplicite L./H." },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano: non riconosce come misura un 'TENDA DA SOLE' generico dove 'DA' introduce del testo, non due numeri" },
  },
  {
    key: "ocr-typo-double-period-schedule-amount",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale regola generale di Giuliano (Laurelli): riconosce come importo valido la scadenza con il punto al posto della virgola nei decimali ('3.759.40')" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale regola generale di Giuliano: il ripiego per il punto-al-posto-della-virgola non si attiva su un importo a un solo punto, gia' ambiguo di suo" },
  },
  {
    key: "zanzasol-plural-header-and-gtot-period-tolerance",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Pelizzari/Tiraboschi (Zanzasol): riconosce 'Gtot.' col punto e l'intestazione plurale 'FORNITURA E POSA TENDE DA SOLE'" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non estende l'intestazione Zanzasol a un prodotto diverso senza 'tenda da sole'" },
  },
  {
    key: "bank-transfer-reconciliation-gate-suspended",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM decisione di Giuliano: sospende il gate di riconciliazione bonifici anche quando il capitale bonificato supera le fatture o non e' leggibile" },
    negative: { fileRef: "scripts/enea-shadow-runner/bankTransferEvidence.test.ts", testId: "evidenza bonifici separata dalle fatture non riconosce come bonifico una fattura ordinaria che cita soltanto 'a favore di' senza il contesto di una ricevuta bancaria" },
  },
  {
    key: "cap-letter-o-zero-typo-repair",
    positive: { fileRef: "src/features/enea-lab/operatorValidation.test.ts", testId: "validazione correzioni operatore regressione Manso: corregge un CAP con la lettera O al posto della cifra 0, ma resta fail-closed se non basta a renderlo valido" },
    negative: { fileRef: "src/features/enea-lab/operatorValidation.test.ts", testId: "validazione correzioni operatore regressione Manso: non accetta un CAP ancora invalido dopo la sola sostituzione O/0" },
  },
  {
    key: "linea-sole-potito-cadastral-building-label-before-value",
    positive: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped regressione Berti/Mocenighi: estrae singolarmente ogni campo catastale/edificio anche se un campo vicino e' vuoto o l'anno di costruzione e' incompleto" },
    negative: { fileRef: "scripts/enea-shadow-runner/lineaSolePotitoPolicy.test.ts", testId: "Linea Sole Potito — modulo cartaceo e fallback vendor-scoped non estrae un valore catastale/edificio quando l'OCR e' troppo degradato per essere plausibile" },
  },
  {
    key: "birth-residence-nation-fallback-to-comune-when-province-non-standard",
    positive: { fileRef: "src/features/enea-lab/mapper.test.ts", testId: "mapSchermaturaPractice regressione Capitanelli: usa il comune di nascita/residenza come ripiego quando la sigla provincia CRM non e' standard (es. 'ROM' invece di 'RM')" },
    negative: { fileRef: "src/features/enea-lab/mapper.test.ts", testId: "mapSchermaturaPractice non deduce una nazione italiana dal solo comune quando ne' la provincia ne' il comune sono riconoscibili" },
  },
  {
    key: "partial-scan-same-invoice-number-duplicate-merge",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo regressione Tuttolani: scarta scansioni parziali senza totale della stessa fattura anche da FILE diversi" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non unisce due documenti diversi soltanto perche' uno dei due manca di un proprio totale, se il numero fattura non e' condiviso" },
  },
  {
    key: "lm-tende-narrative-awning-measurement",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Vigetti (LM Tende): riconosce la tenda da sole cassonata narrativa 'N° <qta> da <L> x <H> cm' anche senza gTot esplicito" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non applica il formato narrativo LM Tende senza l'unita' cm esplicita" },
  },
  {
    key: "enea-2026-june30-completion-date-only-window",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM seconda correzione di Giuliano: applica esattamente la finestra ENEA 2026 dal 30 giugno al 28 settembre quando la fine lavori e' dal 4 febbraio in poi" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM seconda correzione di Giuliano: la finestra dipende soltanto dalla fine lavori, l'inizio lavori non conta (e non e' piu' un parametro della funzione)" },
  },
  {
    key: "form-declared-product-module-priority",
    positive: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie regressione Awal: la struttura Infissi del form risolve la pratica quando ne' la fattura ne' l'etichetta di coda offrono un segnale" },
    negative: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie non applica la priorita del form quando formDeclaredModule e assente: il comportamento esistente resta invariato" },
  },
  {
    key: "duplicate-invoice-ocr-variant-deduplication",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo regressione Sanvito: riconosce come duplicata una scansione OCR che non estrae affatto numero/data se importo, firma tecnica e soggetti fiscali coincidono" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non deduplica una scansione OCR senza numero/data se l'importo totale e diverso (non e' prova sufficiente da sola)" },
  },
  {
    key: "generic-two-measurement-screening-area-fallback",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.test.ts", testId: "parseScreeningInvoiceText fallback generico a due misure senza etichette note regressione Cotta: calcola l'area da 'L. MT. X X P. MT. Y' senza conoscere il significato di P." },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.test.ts", testId: "parseScreeningInvoiceText fallback generico a due misure senza etichette note non inventa una conversione quando l'unita' di misura manca su almeno un lato" },
  },
  {
    key: "form-declared-type-resolves-classification-ambiguity",
    positive: { fileRef: "src/features/enea-shadow-crm/productClassifier.test.ts", testId: "classificatore condiviso e politica gTot regressione Fiorini: guarda il form prima di fermarsi per operatore quando la fattura usa un sottotipo ambiguo ('cristal')" },
    negative: { fileRef: "src/features/enea-shadow-crm/productClassifier.test.ts", testId: "classificatore condiviso e politica gTot resta fail-closed per il sottotipo 'cristal' quando il form non dichiara nulla di utile" },
  },
  {
    key: "linea-sole-potito-scomparsa-totale-model-code-tolerance",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Mocenighi: riconosce 'scomparsa totale' anche col codice modello tra 'totale' e 'L' e chiusura plurale 'tende da sole'" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non riconosce 'scomparsa totale' se il codice modello tra 'totale' e 'L' e' troppo lungo per essere un codice prodotto" },
  },
  {
    key: "finestra-italia-positional-dimension-notation",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali regressione Codognato: legge il formato Finestra Italia '(L=NNN;A=NNN;)' anche con la misura su una riga separata dalla descrizione" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non conta una posizione Finestra (infissi) come persiana quando compaiono nella stessa fattura" },
  },
  {
    key: "mixed-infissi-screening-distinct-invoice-orders-not-conflict",
    positive: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali regola generale: due fatture della stessa pratica con numeri d'ordine diversi (Infissi e Persiane fatturati separatamente) non sono un conflitto" },
    negative: { fileRef: "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts", testId: "APR Infissi · estrazione automatica documenti reali rifiuta fail-closed Gemma soltanto per un vero conflitto di misura dichiarata in fattura (non per l'assenza del nome cliente/rivenditore nel certificato, che e' normale)" },
  },
  {
    key: "bank-transfer-segment-exclusion-requires-incomplete-triple",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Ronconi (2026-09-08): non azzera le fonti economiche quando la conferma di bonifico e' accodata alla stessa fattura reale nello stesso allegato" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Ronconi (2026-09-08), controprova negativa: una conferma di bonifico senza una terna fiscale propria completa resta esclusa anche quando cita numero e data di una fattura reale" },
  },
  {
    key: "linea-sole-potito-modello-label-dimension",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Bellotti: riconosce due prodotti distinti 'Tenda modello <codice> L <largh>x<alt>' sullo stesso fornitore, senza la parola 'scomparsa'" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non riconosce 'scomparsa totale' se il codice modello tra 'totale' e 'L' e' troppo lungo per essere un codice prodotto" },
  },
  {
    key: "linea-sole-potito-dimension-before-scomparsa-label",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Di Bello: riconosce la misura orfana quando l'ordine tabellare OCR la colloca PRIMA di 'scomparsa totale L' invece che dopo" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non inventa una riga prodotto per una coppia di cifre estranea quando 'scomparsa totale L' non compare affatto nel documento" },
  },
  {
    key: "lm-tende-saldo-dimension-connector-preposition",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Pezzani: riconosce la tenda quando la riga usa la preposizione 'a' invece di 'da' fra il quantitativo e la misura, senza scambiare le piantane della zanzariera per un prodotto" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano: non riconosce come misura un 'TENDA DA SOLE' generico dove 'DA' introduce del testo, non due numeri" },
  },
  {
    key: "dotted-numbered-header-date-over-narrative-reference",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.test.ts", testId: "parseScreeningInvoiceText regressione Cirillo: preferisce l'intestazione 'Fattura / Numero: / <data coi punti>' al riferimento di una fattura precedente detratta nel corpo" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.test.ts", testId: "parseScreeningInvoiceText preferisce il numero nell'intestazione sfalsata al riferimento di acconto nel corpo" },
  },
  {
    key: "vaila-open-house-pergotenda-order-form-dimension",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Pasinato: legge larghezza e profondita' di una pergotenda dal modulo d'ordine tecnico VA.ILA. 'MODULO ORDINE OPEN HOUSE' quando la fattura stessa non riporta alcuna misura" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non riconosce una pergotenda dal modulo VA.ILA. se manca una delle due misure (larghezza o profondita')" },
  },
  {
    key: "schermatura-solare-narrative-single-product-trigger",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Pescatori: riconosce il trigger 'Schermatura solare' del fallback narrativo a singolo prodotto gia' autorizzato per pergotenda/tenda da sole" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non applica il trigger 'Schermatura solare' quando la fattura dichiara una quantita' plurale (resta fail-closed come il fallback esistente)" },
  },
  {
    key: "multiservice-home-multi-measure-narrative",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Padoani: riconosce 'misure WxH ed WxH' come due tende da sole fisicamente distinte, senza dedurre mai il gTot qui" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano: una sola coppia di misure 'N) L. ... X H ...' non attiva la regola delle due coppie (non inventa mai una seconda riga)" },
  },
  {
    key: "veneziana-persiana-equivalent-treatment",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale di Giuliano (2026-09-08): 'veneziana' segue esattamente lo stesso trattamento delle persiane, incluse letture OCR degradate 'Venezianita'/'Venezianina'" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non estende il trattamento persiana al plurale gia' autorizzato 'Veneziane' (formato narrativo distinto, famiglia tenda)" },
  },
  {
    key: "missing-screening-measurement-operator-question",
    positive: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions regola generale (Giuliano, 2026-09-08): genera una domanda diretta 'mancano le misure, inseriscile' quando nessun candidato numerico esiste in alcun documento (Tosatti/Di Cesare/Kasermann/Mondini)" },
    negative: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions non genera alcuna domanda di misura mancante quando la pratica ha gia' un prodotto fisico o nessun documento di schermatura" },
  },
  {
    key: "ambiguous-dual-dimension-reading-operator-question",
    positive: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions regressione Berneri: rileva la doppia lettura '2400X2500/12300X2000' e chiede all'operatore quale (se una) sia la misura reale, senza sceglierla mai automaticamente" },
    negative: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions non genera la domanda di doppia lettura quando entrambe le letture candidate sono plausibili" },
  },
  {
    key: "complex-multi-vendor-technical-form-operator-question",
    positive: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions casi Maeschi/Munafo: rileva documenti tecnici multi-fornitore (Punto Finestre/Punto Persiane, C3 Systems/Sunroom) e chiede conferma di prodotto e posizione, senza estrazione automatica" },
    negative: { fileRef: "scripts/enea-shadow-runner/operatorQuestions.test.ts", testId: "PersistentAprOperatorQuestions mantiene il caso bloccato quando l'operatore risponde non determinabile" },
  },
  {
    key: "non-fiscal-supporting-document-exclusion",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo regressione Giuga/De Marinis: esclude dal gate economico una ricevuta di bonifico o un'esportazione di movimento bancario, non una fattura, anche se cita l'importo e un riferimento a 'Fattura N'" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non esclude un documento che contiene realmente un'intestazione fattura anche se cita 'Beneficiario' o 'Dichiara' (fail-closed: mai escludere una fattura vera)" },
  },
  {
    key: "duplicate-invoice-matching-number-and-date-over-total",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo regressione Tocchetti: riconosce come duplicata una scansione OCR quando numero e data coincidono, anche se nessun prodotto e' stato riconosciuto sul lato nativo e il totale letto e' diverso" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceSegmentation.test.ts", testId: "segmentazione locale fatture acconto/saldo non riconosce come duplicati due segmenti con numero coincidente ma data diversa (resta fail-closed su due fatture distinte)" },
  },
  {
    key: "invoice-final-printed-total-only-never-internal-recalculation",
    positive: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale regola generale di Giuliano (2026-09-08, regressione Calvacchi): quando il saldo netta un acconto precedente con una riga di credito esplicita, il totale finale stampato resta l'unica prova, mai una ricostruzione dalle righe" },
    negative: { fileRef: "scripts/enea-shadow-runner/localInvoiceFinancialEvidence.test.ts", testId: "evidenza finanziaria da PDF originario locale senza una riga di credito interno verso un acconto, la ricostruzione dalle righe resta attiva come prima (nessuna regressione)" },
  },
  {
    key: "reseller-installer-invoice-excluded-from-economic-total",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regola generale definitiva di Giuliano (2026-09-08, regressione Calvacchi): riconosce una fattura del produttore al rivenditore/installatore, non al cliente beneficiario" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non esclude un destinatario societario quando manca comunque una prova (nessun Destinatario/Spett.le riconoscibile, o nome beneficiario non fornito): resta fail-closed economico" },
  },
  {
    key: "infissi-with-additional-screening-combined-practice",
    positive: { fileRef: "src/features/enea-shadow-crm/documentedProductRouting.test.ts", testId: "routing prodotto da fonti originarie regola generale definitiva di Giuliano (2026-09-08): conserva entrambe le famiglie (mixed) anche quando infissi e chiusura oscurante provengono da fatture separate di fornitori diversi" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regola generale definitiva di Giuliano (2026-09-08): infissi e persiane da fornitori diversi, entrambe le fatture verso il cliente, sommano i totali economici nel totale complessivo della pratica" },
  },
  {
    key: "zanzasol-narrative-quantity-from-price-row",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Falconi (Zanzasol): riconosce la quantita' fisica reale '2,00' dopo il gTot invece di presumere sempre una sola tenda" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non inventa una quantita' plurale quando il blocco N/iva/quantita non e' nel formato atteso (resta 1 come prima)" },
  },
  {
    key: "narrative-payment-sentence-awning-dimension",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Lavezzi: riconosce la misura narrativa incorporata subito dopo 'tenda da sole' in una frase di pagamento, senza etichette L/H" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non applica la misura narrativa di pagamento quando un altro parser ha gia' trovato una riga fisica" },
  },
  {
    key: "architectural-opening-label-over-incidental-number-pair",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Garbato: preferisce 'Misure Luce Architettonica: LxH' alla prima coppia di numeri incidentale (es. la sede della guida di scorrimento) trovata prima nel blocco" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari senza l'etichetta 'Misure Luce Architettonica' resta la prima coppia trovata (nessuna regressione sul comportamento esistente)" },
  },
  {
    key: "cf-destinatario-anchor-without-cliente-label",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Eustomi/Coreggioli: conferma il CF CRM anche senza etichetta CLIENTE, quando compare come 'CF <cf> DESTINATARIO' seguito dal nome sulla riga successiva (formato S.A. Montaggi)" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM non conferma un CF 'CF <cf> DESTINATARIO' se il nome sulla riga successiva non corrisponde (resta fail-closed)" },
  },
  {
    key: "finestra-italia-separated-label-value-block-document-identity",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Biagioni/Riviera: legge numero e data documento del fornitore Finestra Italia quando etichette e valori sono in due blocchi separati" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari non riconosce numero/data dal formato Finestra Italia senza l'ancora della pagina 'N/N' subito dopo la data (resta fail-closed)" },
  },
  {
    key: "totale-contratto-commessa-never-document-total",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Lavezzi: non usa 'Totale contratto' come totale documento, riconosce il vero totale dalla riconciliazione Imponibile+IVA" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regola generale gia' esistente confermata: senza 'Totale contratto/commessa' di mezzo, l'ultima riga 'Totale' non etichettata resta usata come prima" },
  },
  {
    key: "supplier-block-marker-full-address-block-window",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Tiraboschi: non scambia il comune del fornitore destinatario della lettera per il comune lavori quando il marcatore societario e' 2 righe sopra il CAP+Comune" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM continua a scartare il comune del fornitore quando il marcatore societario e' nell'immediato dintorno del CAP+Comune (nessuna regressione)" },
  },
  {
    key: "finestra-italia-scadenze-intervening-label-vertical-recap",
    positive: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari regressione Biagioni/Riviera: legge il vero totale quando 'SCADENZE' si intromette dopo 'Totale fattura', prima del riepilogo imponibile/IVA/lordo" },
    negative: { fileRef: "src/features/enea-lab/invoiceParser.vendorFormats.test.ts", testId: "invoiceParser formati rivenditore originari senza la sigla 'EUR' entro le righe successive, la variante 'SCADENZE' non si applica (resta fail-closed sul resto della logica generica)" },
  },
  {
    key: "reseller-addressee-multi-line-beneficiary-lookup",
    positive: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM regressione Biagioni/Riviera: non esclude la fattura del cliente quando 'SPETT.LE' e' seguito prima dalla ragione sociale del fornitore stesso e solo alla riga successiva dal nome del cliente (formato Finestra Italia)" },
    negative: { fileRef: "scripts/enea-shadow-runner/crmLocalPreflight.test.ts", testId: "preflight locale durevole fino a quindici dossier CRM continua a riconoscere una fattura verso il rivenditore quando il nome del beneficiario non compare affatto entro le righe controllate (nessuna regressione Calvacchi)" },
  },

] as const;
