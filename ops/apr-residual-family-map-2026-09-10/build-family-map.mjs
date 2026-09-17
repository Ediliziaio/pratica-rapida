import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = '/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida';
const runtimeBase = '/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner';
const outDir = path.join(repo, 'ops/apr-residual-family-map-2026-09-10');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const normalizeName = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sourceDefs = [
  {
    id: 'wide100_r99_final',
    kind: 'raw',
    precedence: 1,
    path: path.join(runtimeBase, 'runs/apr-wide100-r99-governed-20260909/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-wide100-r99-governed-20260909'),
  },
  {
    id: 'pronte_r99_final',
    kind: 'raw',
    precedence: 2,
    path: path.join(runtimeBase, 'runs/apr-pronte-da-fare-r99-governed-20260909/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-pronte-da-fare-r99-governed-20260909'),
  },
  {
    id: 'targeted_r100_retry1',
    kind: 'raw',
    precedence: 3,
    path: path.join(runtimeBase, 'runs/apr-contractual-reliability-r100-targeted-retry1-20260909/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-contractual-reliability-r100-targeted-retry1-20260909'),
  },
  {
    id: 'targeted_r101',
    kind: 'raw',
    precedence: 4,
    path: path.join(runtimeBase, 'runs/apr-contractual-reliability-r101-targeted-20260909/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-contractual-reliability-r101-targeted-20260909'),
  },
  {
    id: 'long_r101_verified',
    kind: 'classified',
    precedence: 5,
    path: path.join(repo, 'ops/apr-contractual-reliability-2026-09-09/final-long-report-r101.json'),
  },
  {
    id: 'targeted_r102',
    kind: 'raw',
    precedence: 6,
    path: path.join(runtimeBase, 'runs/apr-multi-invoice-parser-r102-targeted-20260910/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-multi-invoice-parser-r102-targeted-20260910'),
  },
  {
    id: 'pronte_r102_final',
    kind: 'raw',
    precedence: 7,
    path: path.join(runtimeBase, 'runs/apr-pronte-da-fare-r102-current-flow-20260910/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-pronte-da-fare-r102-current-flow-20260910'),
  },
  {
    id: 'targeted_preflight_r104_six',
    kind: 'raw',
    precedence: 8,
    path: path.join(runtimeBase, 'runs/apr-preflight-deep-review-propagation-r104-operational-six-20260910/report.json'),
    runRoot: path.join(runtimeBase, 'runs/apr-preflight-deep-review-propagation-r104-operational-six-20260910'),
  },
  {
    id: 'pronte_r104_verified',
    kind: 'classified',
    precedence: 9,
    path: path.join(repo, 'ops/apr-pronte-da-fare-r104-2026-09-10/final-report-7-categories.json'),
  },
  {
    id: 'targeted_r105_verified',
    kind: 'r105',
    precedence: 10,
    path: path.join(repo, 'ops/apr-multi-invoice-parser-r105-targeted-three-2026-09-10/final-report.json'),
  },
];

const categoryToState = (category) => ({
  SALVATA: 'saved',
  FALLITA_TECNICA: 'technical_block',
  BLOCCO_DOCUMENTALE_REALE: 'operator_required',
  BLOCCO_DATI_O_CONFLITTO_FONTI: 'operator_required',
  NON_PROCEDIBILE_PER_REGOLA: 'operator_required',
  ESCLUSA_A_MONTE: 'operator_required',
  INCONSISTENT_DA_VERIFICARE: 'inconsistent',
}[category] ?? 'inconsistent');

function causeText(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

function verifyRawCase(source, row) {
  const caseDir = path.join(source.runRoot, `case-${row.cohort}-${row.customerKey}`);
  const checkpointPath = path.join(caseDir, 'checkpoint.json');
  const reportPath = path.join(caseDir, 'report.json');
  const terminalPath = path.join(runtimeBase, 'terminal-observability', `apr-pilot-${row.cohort}-global-controller-${row.customerKey}.json`);
  const checkpoint = fs.existsSync(checkpointPath) ? readJson(checkpointPath) : null;
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : null;
  const terminal = fs.existsSync(terminalPath) ? readJson(terminalPath) : null;
  const checkpointState = checkpoint?.results?.[0]?.state ?? checkpoint?.state ?? null;
  const reportState = report?.cases?.[0]?.state ?? report?.state ?? null;
  const terminalStatus = terminal?.caseTruth?.status ?? null;
  const expectedTerminal = {
    saved: 'READY',
    operator_required: 'OPERATOR_REQUIRED',
    technical_block: 'TECHNICAL_BLOCK',
    inconsistent: 'INCONSISTENT',
  }[row.state] ?? null;
  const localStatesAgree = [checkpointState, reportState].every((value) => value === row.state);
  const terminalAgrees = terminalStatus === expectedTerminal;
  return {
    conclusion: localStatesAgree && terminalAgrees ? 'VERIFIED' : 'INCONSISTENT',
    outerReportState: row.state,
    checkpointState,
    childReportState: reportState,
    terminalCaseTruth: terminalStatus,
    evidence: { checkpointPath, reportPath, terminalSnapshotPath: terminalPath },
  };
}

function normalizeSource(source) {
  const doc = readJson(source.path);
  return doc.cases.map((row) => {
    if (source.kind === 'raw') {
      return {
        practiceId: row.practiceId,
        customerKey: row.customerKey,
        displayName: row.displayName,
        cohort: row.cohort,
        state: row.state,
        category: null,
        exactCause: causeText(row.reason),
        blockerCodes: [],
        operatorQuestion: null,
        missingDocumentType: null,
        onboardingGap: null,
        verification: verifyRawCase(source, row),
        sourceId: source.id,
        sourcePath: source.path,
        precedence: source.precedence,
      };
    }
    if (source.kind === 'classified') {
      return {
        practiceId: row.practiceId,
        customerKey: row.customerKey,
        displayName: row.displayName,
        cohort: row.cohort,
        state: categoryToState(row.category),
        category: row.category,
        exactCause: causeText(row.exactCause),
        blockerCodes: row.reportBlockers ?? [],
        operatorQuestion: row.operatorQuestion ?? null,
        missingDocumentType: row.missingDocumentType ?? null,
        onboardingGap: row.onboardingGap ?? null,
        acceptedManualTruthNote: row.acceptedManualTruthNote ?? null,
        verification: {
          conclusion: row.tripleVerification?.conclusion ?? 'UNKNOWN',
          ...row.tripleVerification,
          evidence: row.evidence ?? null,
        },
        sourceId: source.id,
        sourcePath: source.path,
        precedence: source.precedence,
      };
    }
    return {
      practiceId: row.practiceId,
      customerKey: row.customerKey,
      displayName: row.name,
      cohort: row.cohort,
      state: row.saved ? 'saved' : row.classification?.toLowerCase(),
      category: row.classification,
      exactCause: causeText(row.exactCause),
      blockerCodes: row.blockerCodes ?? [],
      operatorQuestion: row.operatorQuestion ?? null,
      missingDocumentType: row.missingDocumentType ?? null,
      onboardingGap: row.onboardingGap ?? null,
      verification: {
        conclusion: row.threeWayVerification?.concordant ? 'VERIFIED' : 'INCONSISTENT',
        ...row.threeWayVerification,
      },
      sourceId: source.id,
      sourcePath: source.path,
      precedence: source.precedence,
    };
  });
}

const historyByPractice = new Map();
for (const source of sourceDefs) {
  for (const row of normalizeSource(source)) {
    const history = historyByPractice.get(row.practiceId) ?? [];
    history.push(row);
    historyByPractice.set(row.practiceId, history);
  }
}

const terminalFailureStates = new Set(['operator_required', 'technical_block', 'inconsistent']);

const planningIds = new Set([
  ...readJson(sourceDefs.find((source) => source.id === 'wide100_r99_final').path).cases.map((row) => row.practiceId),
  ...readJson(sourceDefs.find((source) => source.id === 'pronte_r104_verified').path).cases.map((row) => row.practiceId),
]);

const manualTruth = {
  missingInvoice: new Set(['filippo bigalli', 'alessandro zaniboni', 'rocco giacotto', 'paolino bellini', 'gabriele girelli']),
  presentInvoice: new Set(['vera buracchi', 'marco tocchetti', 'loretta riviera', 'stefania venturi']),
  missingMeasures: new Set(['roberta di cesare', 'giulia kasermann', 'stefano buosi']),
  handwrittenMeasures: new Set(['maria sofia tosatti']),
  manuallyCorrect: new Set(['sarah mondini', 'caterina claudia garbato', 'marian maeschi']),
  recentDocumentsAbsent: new Set(['silvia lomartire', 'marina gerbaudo']),
  upstreamExcluded: new Set([
    'massimiliano montemorra', 'riccardo coda', 'diego mario mocenighi', 'liliana gloria',
    'elena marcella berti', 'prova rivenditore 1 30 04', 'smaj hhhhh', 'mario martegani',
    'marzia bellotti', 'virginia madia', 'salvatore di bello',
  ]),
  nonProcedibleOver90: new Set(['ida gigliotti', 'vito fusillo', 'caterina claudia garbato']),
};

const familyDefs = {
  PRE01: { name: 'stallo_preflight_senza_avanzamento', diagnosis: 'causa_identificata_correzione_r104_installata', next: 'replay_operativo_pendente_sui_vecchi_casi' },
  PAR01: { name: 'prodotti_misure_o_cardinalita_non_ricostruiti', diagnosis: 'multi_fattura_identificato_e_corretto_con_r105_su_3_casi_ma_non_dimostrato_come_causa_di_tutti_i_residui', next: 'replay_r105_sugli_altri_casi_prima_di_separare_eventuali_sottopattern' },
  ECO01: { name: 'riconciliazione_economica_tripla_o_bridge', diagnosis: 'sintomo_identificato_causa_generale_non_unificata', next: 'diagnosi_per_sottopattern_prima_di_correggere' },
  COM01: { name: 'comune_rifiutato_da_enea', diagnosis: 'sintomo_identificato_causa_residua_non_diagnosticata', next: 'confrontare_valore_risolto_con_opzione_portale_per_nascita_e_residenza' },
  INF01: { name: 'infissi_schermature_ambigui_o_fonti_in_conflitto', diagnosis: 'famiglia_identificata_regola_o_evidenza_residua_non_diagnosticata', next: 'verifica_documenti_reali_e_separazione_sottopattern' },
  CAT01: { name: 'mapping_catastale_foglio_particella', diagnosis: 'campi_esatti_identificati_origine_mancanza_non_diagnosticata', next: 'verificare_presenza_nei_documenti_e_punto_di_propagazione' },
  MAP01: { name: 'payload_enea_obbligatorio_incompleto_non_catastale', diagnosis: 'campi_esatti_identificati_origine_mancanza_non_diagnosticata', next: 'verificare_acquisizione_e_mapping_dei_nove_campi' },
  DOC01: { name: 'fattura_realmente_assente', diagnosis: 'blocco_documentale_confermato_manualmente', next: 'nessuna_correzione_apr' },
  DOC02: { name: 'documenti_o_form_realmente_assenti', diagnosis: 'blocco_documentale_confermato_manualmente', next: 'nessuna_correzione_apr' },
  DAT01: { name: 'misure_realmente_assenti', diagnosis: 'blocco_dati_confermato_manualmente', next: 'domanda_operatore_onboarding' },
  DAT02: { name: 'misure_manoscritte_da_confermare', diagnosis: 'dato_presente_ma_uso_richiede_decisione', next: 'domanda_operatore' },
  DAT03: { name: 'form_cliente_mancante', diagnosis: 'sintomo_identificato', next: 'verificare_se_blocco_reale_o_acquisizione' },
  DAT04: { name: 'fattura_dichiarata_assente_ma_non_verificata_manualmente', diagnosis: 'non_diagnosticata', next: 'aprire_documento_originale' },
  DAT05: { name: 'pratica_manualmente_corretta_ma_apr_non_concorde', diagnosis: 'falso_blocco_confermato_causa_tecnica_da_associare', next: 'replay_dopo_correzioni_gia_installate' },
  DAT06: { name: 'misure_o_righe_prodotto_non_ricostruite_senza_prova_di_assenza', diagnosis: 'sintomo_identificato_probabile_parser', next: 'replay_r105_prima_di_nuove_modifiche' },
  DATE1: { name: 'date_procedibilita_o_superamento_90_giorni', diagnosis: 'mista_regola_certa_e_ambiguita_residue', next: 'separare_non_procedibili_da_date_conflittuali' },
  EXC01: { name: 'esclusioni_permanenti_o_test_interno', diagnosis: 'regola_identificata_e_installata', next: 'solo_reporting_corretto_fuori_dal_flusso' },
  RUN01: { name: 'recovery_o_terminalizzazione_inconcludente', diagnosis: 'sintomo_identificato_causa_residua_non_unificata', next: 'diagnosi_locale_prima_di_ripetere' },
  UI001: { name: 'contratto_react_schermatura_non_pronto', diagnosis: 'sintomo_identificato_causa_non_diagnosticata', next: 'diagnosi_del_mount_e_dei_selettori_portale' },
  AVV01: { name: 'misure_avvolgibile_ambigue', diagnosis: 'manca_regola_business_autorizzata', next: 'decisione_giuliano_su_fonti_e_associazione' },
  FPR01: { name: 'fingerprint_pacchetto_operativo', diagnosis: 'causa_identificata_correzione_r101_installata', next: 'replay_operativo_pendente_sul_caso_non_rieseguito' },
  UNK01: { name: 'residui_non_classificati', diagnosis: 'non_diagnosticata', next: 'diagnosi' },
};

function memberships(row) {
  const n = normalizeName(row.displayName);
  const c = `${row.exactCause} ${(row.blockerCodes ?? []).join(' ')}`.toLowerCase();
  const out = new Set();
  if (manualTruth.upstreamExcluded.has(n) || c.includes('permanent_supplier_automation_exclusion') || c.includes('future_test_customer_excluded')) out.add('EXC01');
  if (manualTruth.missingInvoice.has(n)) out.add('DOC01');
  if (manualTruth.recentDocumentsAbsent.has(n)) out.add('DOC02');
  if (manualTruth.missingMeasures.has(n)) out.add('DAT01');
  if (manualTruth.handwrittenMeasures.has(n)) out.add('DAT02');
  if (manualTruth.manuallyCorrect.has(n) && row.state !== 'saved') out.add('DAT05');
  if (manualTruth.nonProcedibleOver90.has(n)) out.add('DATE1');
  if (c.includes('no_material_progress_for_7_minutes') && !manualTruth.upstreamExcluded.has(n)) out.add('PRE01');
  if (c.includes('crm_enea_draft_package_fingerprint_mismatch')) out.add('FPR01');
  if ((c.includes('gross_triple_reconciliation_failed') || c.includes('infissi_financial_triple_reconciliation_required') || c.includes('apr_enea_bridge_prepare_economic_unresolved'))
      && !manualTruth.missingInvoice.has(n) && !manualTruth.recentDocumentsAbsent.has(n) && n !== 'loretta riviera') out.add('ECO01');
  if (c.includes('id-comune_')) out.add('COM01');
  if (c.includes('infissi_shading_closures_form_answer_missing_or_ambiguous') || c.includes('infissi_automatic_source_conflict')) out.add('INF01');
  if (c.includes('missing-immobile.foglio') || c.includes('missing-immobile.mappale') || n === 'alberto maggi') out.add('CAT01');
  if (c.includes('draft_payload_mapping_incomplete') && n !== 'alberto maggi' && !manualTruth.upstreamExcluded.has(n)) out.add('MAP01');
  if ((c.includes('product_cardinality_form_invoice_mismatch') || c.includes('infissi_dimensions_and_cardinality_missing') || c.includes('screenings_missing') || c.includes('screening_primary_measurements_missing'))
      && !manualTruth.missingInvoice.has(n) && !manualTruth.missingMeasures.has(n) && !manualTruth.recentDocumentsAbsent.has(n)
      && !manualTruth.nonProcedibleOver90.has(n)) out.add('PAR01');
  if (c.includes('original_invoice_missing_or_unavailable') && !manualTruth.missingInvoice.has(n) && n !== 'loretta riviera') out.add('DAT04');
  if (n === 'loretta riviera') out.add('PAR01');
  if (c.includes('customer_form_missing') && !manualTruth.recentDocumentsAbsent.has(n)) out.add('DAT03');
  if (c.includes('completion_date_portal_year_mismatch') || c.includes('completion_over_90_days_operator_required')) out.add('DATE1');
  if (c.includes('unico recupero') || c.includes('single_case_runner_exited_without_terminal_result')) out.add('RUN01');
  if (c.includes('apr_cdp_enea_screening_react_contract_not_ready')) out.add('UI001');
  if (c.includes('avvolgibile_measurement_ambiguous')) out.add('AVV01');
  if (!out.size) out.add('UNK01');
  return [...out];
}

const primaryPriority = ['EXC01', 'DOC01', 'DOC02', 'PRE01', 'CAT01', 'MAP01', 'ECO01', 'COM01', 'RUN01', 'UI001', 'AVV01', 'INF01', 'DATE1', 'DAT01', 'DAT02', 'DAT03', 'DAT04', 'DAT05', 'PAR01', 'FPR01', 'UNK01'];

function residualMetadata(row) {
  const name = row.displayName;
  const family = row.primaryFamily;
  const byFamily = {
    PRE01: [`Vuoi rieseguire ${name} con il preflight r104 corretto per ottenere il primo verdetto operativo terminale?`, null, 'Evitare che il preflight impedisca la formulazione della domanda dati/documenti effettivamente necessaria.'],
    PAR01: [`Confermi che ${name} va rieseguita con r105 per verificare sul portale la ricostruzione di prodotti, quantita e misure?`, null, 'Raccogliere righe prodotto e misure in formato strutturato e riconciliabile gia nel fascicolo iniziale.'],
    ECO01: [`Qual e l'importo lordo esatto della sola lavorazione agevolata da usare per ${name}?`, null, 'Esplicitare nel fascicolo l importo riferito al solo intervento agevolato e il legame con fatture e bonifici.'],
    COM01: [`Quale voce esatta del Comune deve essere selezionata nella lista ENEA per ${name}?`, null, 'Validare i comuni del form contro la denominazione selezionabile nel catalogo ENEA.'],
    INF01: [`Per ${name}, l'intervento riguarda Infissi, Schermature solari oppure entrambi?`, null, 'Rendere obbligatoria e non ambigua la classificazione Infissi/Schermature nel form iniziale.'],
    CAT01: [`Indica Foglio e Particella/mappale dell'immobile per ${name}.`, 'visura o dato catastale con Foglio e Particella/mappale', 'Raccogliere e validare Foglio e Particella/mappale prima della presa in carico.'],
    MAP01: [`Indica i dati obbligatori ENEA ancora mancanti per ${name}, in particolare titolo beneficiario, anno e superficie immobile e caratteristiche dell'impianto.`, 'modulo cliente completo con dati immobile e impianto', 'Rendere obbligatori nel form titolo beneficiario, anno/superficie immobile e dati impianto.'],
    DOC01: [`Inserisci la fattura mancante per ${name}.`, 'fattura', 'Richiedere e validare la fattura prima dell ingresso nella coda APR.'],
    DOC02: [`Inserisci il fascicolo documentale mancante per ${name}, inclusi modulo cliente e fattura.`, 'modulo cliente e fattura', 'Bloccare l onboarding finche modulo cliente e fattura non sono materialmente presenti.'],
    DAT01: [`Indica le misure fisiche mancanti del prodotto per ${name}.`, 'scheda o documento con misure del prodotto', 'Raccogliere le misure del prodotto in campi strutturati obbligatori.'],
    DAT02: [`Confermi che per ${name} vanno usate le misure manoscritte nello spazio della finestra protetta?`, null, 'Separare nel form le misure prodotto dalle misure della finestra protetta.'],
    DAT03: [`Inserisci il modulo cliente mancante per ${name}.`, 'modulo cliente', 'Richiedere il modulo cliente prima della presa in carico.'],
    DAT04: [`La fattura di ${name} e materialmente presente nel fascicolo originale ed e leggibile?`, 'fattura da verificare', 'Confermare presenza e leggibilita della fattura in onboarding.'],
    DAT05: [`Confermi che ${name}, gia verificata manualmente come corretta, deve essere rieseguita con le correzioni installate?`, null, 'Conservare una prova strutturata dei dati che hanno reso la pratica manualmente procedibile.'],
    DATE1: [`Qual e la data esatta e documentata di fine lavori per ${name}?`, 'documento datato di fine lavori', 'Raccogliere una data di fine lavori univoca e la relativa fonte primaria.'],
    EXC01: [`Confermi che ${name} resta esclusa dall automazione APR e va lavorata manualmente?`, null, 'Identificare fornitore/test escluso prima del download dei documenti.'],
    RUN01: [`Vuoi ottenere per ${name} un nuovo verdetto pulito senza riprendere il tentativo inconcludente?`, null, 'Separare sempre nuova generazione e ripresa tecnica della stessa generazione.'],
    UI001: [`Vuoi rieseguire ${name} dopo la diagnosi del contratto React della schermatura non disponibile?`, null, 'Nessun requisito documentale: difetto del percorso operativo ENEA.'],
    AVV01: [`Quali misure documentali vanno associate ai singoli avvolgibili di ${name}?`, null, 'Richiedere nel form associazione univoca tra ogni avvolgibile e le sue misure.'],
    FPR01: [`Vuoi rieseguire ${name} con il pacchetto canonico r101 gia corretto?`, null, 'Nessun requisito documentale: conservare un solo pacchetto canonico immutabile per esecuzione.'],
    UNK01: [`Quale decisione o dato preciso serve per proseguire ${name}?`, null, 'Causa non ancora classificata.'],
  };
  const [operatorQuestion, missingDocumentType, onboardingGap] = byFamily[family] ?? byFamily.UNK01;
  return {
    operatorQuestion: row.operatorQuestion ?? operatorQuestion,
    missingDocumentType: row.missingDocumentType ?? missingDocumentType,
    onboardingGap: row.onboardingGap ?? onboardingGap,
  };
}

const currentCases = [];
const resolvedAfterFailure = [];
for (const [practiceId, history] of historyByPractice) {
  if (!planningIds.has(practiceId)) continue;
  history.sort((a, b) => a.precedence - b.precedence);
  const latest = structuredClone(history.at(-1));
  const priorFailures = history.filter((item) => terminalFailureStates.has(item.state));
  latest.history = history.map((item) => ({ sourceId: item.sourceId, state: item.state, exactCause: item.exactCause }));
  if (latest.state === 'saved') {
    if (priorFailures.length) resolvedAfterFailure.push({ practiceId, displayName: latest.displayName, resolvedBy: latest.sourceId, priorFailures: priorFailures.map((x) => x.sourceId) });
  } else {
    latest.familyMemberships = memberships(latest);
    latest.primaryFamily = primaryPriority.find((id) => latest.familyMemberships.includes(id)) ?? 'UNK01';
    Object.assign(latest, residualMetadata(latest));
  }
  currentCases.push(latest);
}

const residual = currentCases.filter((row) => row.state !== 'saved');
const membershipFamilies = Object.entries(familyDefs).map(([id, def]) => {
  const cases = residual.filter((row) => row.familyMemberships.includes(id));
  return {
    id,
    ...def,
    uniquePracticeCount: cases.length,
    verifiedTerminalCount: cases.filter((row) => row.state !== 'inconsistent' && row.verification?.conclusion === 'VERIFIED').length,
    inconsistentOutcomeCount: cases.filter((row) => row.state === 'inconsistent' || row.verification?.conclusion === 'INCONSISTENT').length,
    cases: cases.map((row) => ({ displayName: row.displayName, practiceId: row.practiceId, state: row.state, sourceId: row.sourceId, exactCause: row.exactCause, verification: row.verification?.conclusion })),
  };
}).filter((row) => row.uniquePracticeCount > 0).sort((a, b) => b.uniquePracticeCount - a.uniquePracticeCount || a.id.localeCompare(b.id));

const primaryFamilies = Object.entries(familyDefs).map(([id, def]) => {
  const cases = residual.filter((row) => row.primaryFamily === id);
  return { id, ...def, uniquePracticeCount: cases.length, cases: cases.map((row) => ({ displayName: row.displayName, practiceId: row.practiceId, state: row.state, sourceId: row.sourceId, exactCause: row.exactCause, operatorQuestion: row.operatorQuestion, missingDocumentType: row.missingDocumentType, onboardingGap: row.onboardingGap, verification: row.verification?.conclusion })) };
}).filter((row) => row.uniquePracticeCount > 0).sort((a, b) => b.uniquePracticeCount - a.uniquePracticeCount || a.id.localeCompare(b.id));

const stateCounts = Object.fromEntries(['saved', 'operator_required', 'technical_block', 'inconsistent'].map((state) => [state, currentCases.filter((row) => row.state === state).length]));
const verificationCounts = residual.reduce((acc, row) => {
  const key = row.verification?.conclusion ?? 'UNKNOWN';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const nextDiagnosticScope = {
  selectedFamilyId: 'INF01',
  rationale: 'E la famiglia numericamente piu grande non gia corretta o esclusa a monte: 9 appartenenze, 8 casi in cui e la causa primaria.',
  homogeneousVerifiedCore: residual.filter((row) => ['giovanna atzeni', 'gavina emanuela cannas', 'maurizia coreggioli', 'francesca pisanu', 'giovanni amadu'].includes(normalizeName(row.displayName))).map((row) => ({ displayName: row.displayName, practiceId: row.practiceId, exactCause: row.exactCause, verification: row.verification?.conclusion })),
  relatedSubpattern: residual.filter((row) => normalizeName(row.displayName) === 'marcella capatti').map((row) => ({ displayName: row.displayName, practiceId: row.practiceId, exactCause: row.exactCause, verification: row.verification?.conclusion })),
  holdoutsNotToMergeInitially: residual.filter((row) => ['gabriele girelli', 'mattia vatieri', 'odoardo lotto'].includes(normalizeName(row.displayName))).map((row) => ({ displayName: row.displayName, practiceId: row.practiceId, exactCause: row.exactCause, verification: row.verification?.conclusion })),
};

const allFailureEvents = [...historyByPractice.values()].flat().filter((row) => terminalFailureStates.has(row.state));
const historicalRunCounts = sourceDefs.map((source) => {
  const rows = normalizeSource(source);
  return {
    sourceId: source.id,
    sourcePath: source.path,
    cases: rows.length,
    saved: rows.filter((row) => row.state === 'saved').length,
    failures: rows.filter((row) => terminalFailureStates.has(row.state)).length,
    nonterminal: rows.filter((row) => !terminalFailureStates.has(row.state) && row.state !== 'saved').length,
  };
});
const historicalFailureEventFamilies = Object.entries(familyDefs).map(([id, def]) => {
  const events = allFailureEvents.filter((row) => memberships(row).includes(id));
  return {
    id,
    name: def.name,
    failureEventCount: events.length,
    uniquePracticeCount: new Set(events.map((row) => row.practiceId)).size,
    sourceCounts: Object.fromEntries(sourceDefs.map((source) => [source.id, events.filter((row) => row.sourceId === source.id).length]).filter(([, count]) => count > 0)),
  };
}).filter((row) => row.failureEventCount > 0).sort((a, b) => b.failureEventCount - a.failureEventCount || a.id.localeCompare(b.id));
const historicalOutOfPlanningScope = [...historyByPractice.entries()]
  .filter(([practiceId]) => !planningIds.has(practiceId))
  .map(([practiceId, history]) => {
    history.sort((a, b) => a.precedence - b.precedence);
    const latest = history.at(-1);
    return { practiceId, displayName: latest.displayName, latestState: latest.state, latestCause: latest.exactCause, sourceId: latest.sourceId };
  });

const artifact = {
  schemaVersion: 'apr-residual-family-map-v1',
  generatedAt: new Date().toISOString(),
  method: {
    unit: 'unique_practice_latest_operational_outcome',
    note: 'I conteggi principali non sommano le ricorrenze storiche: l esito piu recente sostituisce quello precedente della stessa pratica. Le appartenenze alle famiglie sono non esclusive; la vista primaryFamilies e esclusiva.',
    sourcePrecedence: sourceDefs.map(({ id, kind, precedence, path: sourcePath }) => ({ id, kind, precedence, sourcePath, sha256: sha256(fs.readFileSync(sourcePath)) })),
    acceptedManualTruth: Object.fromEntries(Object.entries(manualTruth).map(([key, value]) => [key, [...value]])),
  },
  scope: {
    uniquePractices: currentCases.length,
    historicalUniquePracticesAcrossAllRuns: historyByPractice.size,
    historicalFailureEvents: allFailureEvents.length,
    historicalOutOfPlanningScopeCount: historicalOutOfPlanningScope.length,
    latestStateCounts: stateCounts,
    residualUniquePractices: residual.length,
    resolvedAfterEarlierFailureCount: resolvedAfterFailure.length,
    residualVerificationCounts: verificationCounts,
  },
  membershipFamilies,
  primaryFamilies,
  nextDiagnosticScope,
  residualCases: residual.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  resolvedAfterFailure,
  historicalRunCounts,
  historicalFailureEventFamilies,
  historicalOutOfPlanningScope,
};

fs.mkdirSync(outDir, { recursive: true });
const jsonBody = `${JSON.stringify(artifact, null, 2)}\n`;
fs.writeFileSync(path.join(outDir, 'family-map.json'), jsonBody);
fs.writeFileSync(path.join(outDir, 'family-map.json.sha256'), `${sha256(jsonBody)}  family-map.json\n`);

const lines = [
  '# Mappa famiglie residue APR — 10 settembre 2026',
  '',
  `Pratiche uniche considerate: ${artifact.scope.uniquePractices}. Esiti correnti: ${Object.entries(stateCounts).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  `Residui unici: ${artifact.scope.residualUniquePractices}. Verifica fonti: ${Object.entries(verificationCounts).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  '',
  '## Famiglie non esclusive (peso reale del pattern)',
  '',
  ...membershipFamilies.flatMap((family, index) => [
    `${index + 1}. **${family.name}** — ${family.uniquePracticeCount} pratiche — ${family.diagnosis}.`,
    `   Casi: ${family.cases.map((c) => c.displayName).join(', ')}.`,
  ]),
  '',
  '## Famiglia primaria esclusiva (quadratura dei residui)',
  '',
  ...primaryFamilies.flatMap((family) => [
    `- **${family.name}**: ${family.uniquePracticeCount}.`,
    `  Casi: ${family.cases.map((c) => c.displayName).join(', ')}.`,
  ]),
  '',
  '## Occorrenze storiche (non usare come conteggio di pratiche correnti)',
  '',
  ...historicalFailureEventFamilies.map((family) => `- **${family.name}**: ${family.failureEventCount} eventi su ${family.uniquePracticeCount} pratiche uniche.`),
  '',
  `SHA-256 JSON: ${sha256(jsonBody)}`,
  '',
];
fs.writeFileSync(path.join(outDir, 'family-map.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ outDir, scope: artifact.scope, membershipFamilies: membershipFamilies.map(({ id, name, uniquePracticeCount, diagnosis }) => ({ id, name, uniquePracticeCount, diagnosis })), primaryFamilies: primaryFamilies.map(({ id, name, uniquePracticeCount }) => ({ id, name, uniquePracticeCount })), jsonSha256: sha256(jsonBody) }, null, 2));
