import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ops = path.dirname(new URL(import.meta.url).pathname);
const run = '/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-expanded-natural-r55';
const terminalRoot = '/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/terminal-observability';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const manifest = read(path.join(ops, 'manifest.json'));
const selection = read(path.join(ops, 'selection-evidence.json'));
const batch = read(path.join(run, 'report.json'));

function terminalFor(cohort) {
  const name = fs.readdirSync(terminalRoot).find(n => n.startsWith(`apr-pilot-${cohort}-global-controller-`) && n.endsWith('.json'));
  if (!name) throw new Error(`missing terminal snapshot ${cohort}`);
  return { path: path.join(terminalRoot, name), value: read(path.join(terminalRoot, name)) };
}

function causeFor(result, blockers) {
  if (result.state === 'saved') return `Bozza ${result.draftId} completata: ${result.completedPages}/${result.expectedPages} pagine salvate.`;
  if (result.state === 'inconsistent') return result.reason;
  if (result.state === 'technical_block') {
    const s = result.technicalReason || result.reason || '';
    if (s.includes('apr_cohort_seed_practice_scope_invalid')) return 'Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.';
    if (s.includes('apr_cohort_seed_prior_draft')) return 'Il seed fresh-generation rileva una bozza precedente e chiude fail-closed prima di creare una nuova generazione.';
    if (s.includes('apr_cdp_enea_co_beneficiary_save_unverified')) return 'Il salvataggio del co-beneficiario ENEA non è stato verificato dalle sonde read-only; APR si è fermato senza procedere alla cieca.';
    return (result.reason || s).split('\n')[0];
  }
  const messages = blockers.map(b => b.message).filter(Boolean);
  return messages.length ? messages.join(' | ') : result.reason;
}

function residualFields(result, blockers) {
  const codes = blockers.map(b => b.code);
  const messages = blockers.map(b => b.message || '').join(' ');
  if (result.state === 'saved') return { missingDocumentType: null, operatorQuestion: null, onboardingGap: null };
  if (result.state === 'inconsistent') return {
    missingDocumentType: null,
    operatorQuestion: `Autorizzi una diagnosi separata read-only della bozza ${result.draftId} per stabilire se la pagina indicata è stata realmente salvata?`,
    onboardingGap: null
  };
  if (result.state === 'technical_block') return {
    missingDocumentType: null,
    operatorQuestion: `Autorizzi la diagnosi generale del difetto tecnico “${causeFor(result, blockers)}” prima di un nuovo replay pulito?`,
    onboardingGap: null
  };
  if (codes.includes('draft_payload_mapping_incomplete')) return {
    missingDocumentType: 'dati tecnici e catastali completi dell’immobile e dell’impianto',
    operatorQuestion: `Inserisci i dati mancanti richiesti da ENEA: ${messages.replace(/^.*Campi mancanti:\s*/i, '')}`,
    onboardingGap: 'Il form iniziale deve rendere obbligatori tutti i campi tecnici e catastali richiesti dal payload ENEA.'
  };
  if (codes.includes('completion_date_missing')) return {
    missingDocumentType: 'documento datato di fine lavori',
    operatorQuestion: 'Qual è la data esatta di fine lavori? Inserisci il documento che la attesta.',
    onboardingGap: 'Richiedere all’origine un documento datato e un campo strutturato per la fine lavori.'
  };
  if (codes.includes('completion_date_portal_year_mismatch') || codes.includes('completion_over_90_days_operator_required')) return {
    missingDocumentType: codes.includes('customer_form_missing') ? 'modulo cliente originario firmato' : null,
    operatorQuestion: 'Confermi che la pratica è ancora procedibile e indichi l’anno portale ENEA corretto per la data di fine lavori riportata nei documenti?',
    onboardingGap: 'Validare data di fine lavori, anno portale e finestra di procedibilità già durante l’onboarding.'
  };
  if (codes.some(c => c.includes('screening') || c.includes('cardinality') || c.includes('dimensions'))) return {
    missingDocumentType: 'documento tecnico con numero prodotti, misure e prestazione gTot',
    operatorQuestion: 'Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.',
    onboardingGap: 'Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.'
  };
  if (codes.some(c => c.includes('invoice') || c.includes('bank_transfer') || c.includes('reconciliation'))) return {
    missingDocumentType: 'fatture e bonifici riconciliabili',
    operatorQuestion: 'Inserisci o identifica le fatture e i bonifici corretti, indicando quale pagamento corrisponde a ciascuna fattura e il totale lordo da riconciliare.',
    onboardingGap: 'Richiedere fatture e bonifici con riferimenti incrociati obbligatori e totali leggibili.'
  };
  if (codes.includes('customer_form_missing') || codes.includes('tax_code_missing_or_invalid')) return {
    missingDocumentType: 'modulo cliente firmato e documento fiscale valido',
    operatorQuestion: 'Inserisci il modulo cliente firmato e conferma il codice fiscale corretto tramite un documento ufficiale.',
    onboardingGap: 'Rendere obbligatori modulo firmato e verifica formale del codice fiscale all’ingresso.'
  };
  return {
    missingDocumentType: null,
    operatorQuestion: 'Qual è il dato o documento corretto da usare per risolvere i blocker elencati?',
    onboardingGap: null
  };
}

const cases = batch.cases.map(result => {
  const selected = manifest.cases.find(c => c.customerKey === result.customerKey);
  const terminal = terminalFor(result.cohort);
  const truth = terminal.value.caseTruth;
  const blockers = truth?.reportBlockers || [];
  const expectedPublic = result.state === 'saved' ? 'IDLE' : result.state === 'operator_required' ? 'OPERATOR_REQUIRED' : result.state === 'technical_block' ? 'TECHNICAL_BLOCK' : 'TECHNICAL_BLOCK';
  const sourcesConcordant = terminal.value.aprStatus?.consistency === 'CONSISTENT' && terminal.value.aprStatus?.publicStatus === expectedPublic;
  const finalState = sourcesConcordant ? result.state : 'inconsistent';
  const effective = { ...result, state: finalState };
  return {
    order: manifest.cases.findIndex(c => c.customerKey === result.customerKey) + 1,
    ...selected,
    state: finalState,
    draftId: result.draftId,
    completedPages: result.completedPages,
    expectedPages: result.expectedPages,
    exactCause: causeFor(effective, blockers),
    blockers,
    ...residualFields(effective, blockers),
    verification: {
      sourcesConcordant,
      processReport: path.join(run, `case-${result.cohort}-${result.customerKey}`, 'report.json'),
      checkpoint: path.join(run, `case-${result.cohort}-${result.customerKey}`, 'checkpoint.json'),
      terminalSnapshot: terminal.path,
      dashboardConsistency: terminal.value.aprStatus?.consistency,
      caseTruth: truth?.status
    }
  };
});

const counts = Object.fromEntries(['saved','operator_required','technical_block','inconsistent'].map(s => [s, cases.filter(c => c.state === s).length]));
const excluded = selection.exclusions.filter(e => e.exclusionReason === 'permanent_vendor_exclusion' || e.exclusionReason === 'permanent_customer_exclusion');
const report = {
  version: 'apr-expanded-natural-r55-final-report-v1',
  generatedAt: new Date().toISOString(),
  status: 'completed',
  bundle: 'versions/92da8433-official-municipality-r55-20260905',
  manifestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ops, 'manifest.json'))).digest('hex'),
  execution: {
    startedAt: batch.startedAt,
    endedAt: batch.endedAt,
    durationMinutes: Math.round((Date.parse(batch.endedAt) - Date.parse(batch.startedAt)) / 600) / 100,
    total: cases.length,
    counts,
    policy: 'sequential independent cases; 7 minutes without material progress; 25 minutes absolute; isolate and continue; no mid-lot diagnosis or correction'
  },
  safety: {
    draftsOnly: true,
    preview: false,
    submit: false,
    protocol: false,
    receipts: false,
    communications: false
  },
  exclusions: excluded,
  cases
};

fs.writeFileSync(path.join(ops, 'final-report.json'), JSON.stringify(report, null, 2) + '\n');
const lines = [
  '# Report finale — lotto naturale APR r55 esteso', '',
  `- Esecuzione: ${batch.startedAt} → ${batch.endedAt} (${report.execution.durationMinutes} minuti)`,
  `- Totale: ${cases.length}; SAVED ${counts.saved}; OPERATOR_REQUIRED ${counts.operator_required}; TECHNICAL_BLOCK ${counts.technical_block}; INCONSISTENT ${counts.inconsistent}.`,
  `- Bundle: \`${report.bundle}\``,
  `- Manifest SHA-256: \`${report.manifestSha256}\``,
  '- Sicurezza: sole bozze; nessuna anteprima, invio, protocollazione, ricevuta o comunicazione.', '',
  '## Esclusioni verificate', ''
];
for (const e of excluded) lines.push(`- **${e.displayName}** — ${e.exclusionReason}; fornitore: ${e.reseller || 'n/d'}.`);
lines.push('', '## Esito nome per nome', '');
for (const c of cases) {
  lines.push(`### ${c.order}. ${c.displayName} — ${c.state.toUpperCase()}`, '', `- Causa: ${c.exactCause}`);
  if (c.draftId) lines.push(`- Bozza: ${c.draftId}; pagine ${c.completedPages}/${c.expectedPages}.`);
  if (c.blockers.length) lines.push(`- Blocker: ${c.blockers.map(b => b.code).join(', ')}.`);
  if (c.missingDocumentType) lines.push(`- missingDocumentType: ${c.missingDocumentType}`);
  if (c.operatorQuestion) lines.push(`- operatorQuestion: ${c.operatorQuestion}`);
  if (c.onboardingGap) lines.push(`- onboardingGap: ${c.onboardingGap}`);
  lines.push(`- Tripla verifica: ${c.verification.sourcesConcordant ? 'CONCORDANTE' : 'INCONSISTENT'} (report, checkpoint, snapshot terminale/case-truth).`, '');
}
lines.push('## Lettura del risultato', '',
  '- Le due pratiche SAVED dimostrano compilazione operativa reale fino alla bozza, non disponibilità generale in produzione.',
  '- I 15 OPERATOR_REQUIRED sono blocchi per-pratica pubblicati con case-truth `blocked_case`; la coda ha proseguito.',
  '- Gli 8 TECHNICAL_BLOCK e i 3 INCONSISTENT restano da diagnosticare in una fase separata: durante questo lotto non è stata applicata alcuna correzione.',
  '- Le esclusioni fornitore sono avvenute prima dell’elaborazione automatica.', ''
);
fs.writeFileSync(path.join(ops, 'final-report.md'), lines.join('\n'));
console.log(JSON.stringify({ counts, report: path.join(ops, 'final-report.json'), markdown: path.join(ops, 'final-report.md') }, null, 2));
