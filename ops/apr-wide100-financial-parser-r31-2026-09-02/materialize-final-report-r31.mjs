import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = '/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida';
const root = '/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner';
const outDir = path.join(repo, 'ops/apr-wide100-financial-parser-r31-2026-09-02');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const dirs = fs.readdirSync(path.join(root, 'cohorts'));
const cohortDir = (n) => {
  const matches = dirs.filter((d) => d.includes(`-${n}-global-controller-`));
  if (matches.length !== 1) throw new Error(`cohort ${n}: expected 1 directory, got ${matches.length}`);
  return path.join(root, 'cohorts', matches[0]);
};
const itemFor = (file, key) => {
  const cp = read(file);
  return (cp.items || []).find((i) => i.customerKey === key) || null;
};
const blockersFrom = (file, key) => {
  if (!fs.existsSync(file)) return [];
  const item = itemFor(file, key);
  return item?.report?.blockers || item?.blockers || [];
};
const operatorQuestion = (b, name) => {
  const c = b.code || 'unknown';
  const reason = b.reason ? ` Dettaglio rilevato: ${b.reason}` : '';
  if (/original_invoice_missing|invoice_missing|fattura.*missing/i.test(c)) return `Per ${name}, può inviare la fattura originale completa indicata come mancante, comprensiva di tutte le pagine e dei totali fiscali?${reason}`;
  if (/bank_transfer|bonifico|payment/i.test(c)) return `Per ${name}, può inviare la ricevuta completa e leggibile del bonifico parlante, con importo, CRO/TRN, beneficiario e riferimenti delle fatture pagate?${reason}`;
  if (/reconciliation|invoice_[0-9a-f]+|financial|gross/i.test(c)) return `Per ${name}, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato?${reason}`;
  if (/customer_form/i.test(c)) return `Per ${name}, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile?${reason}`;
  if (/tax_code|identity|beneficiary/i.test(c)) return `Per ${name}, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti?${reason}`;
  if (/completion_date|over_90|portal_year|date/i.test(c)) return `Per ${name}, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)?${reason}`;
  if (/screening|infissi|dimension|product|technical/i.test(c)) return `Per ${name}, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento?${reason}`;
  return `Per ${name}, può fornire il documento o il dato necessario a risolvere “${c}”?${reason}`;
};

const reviewed = read(path.join(root, 'runs/apr-financial-parser-r30-reviewed-eight/report.json')).cases;
const remaining = read(path.join(root, 'runs/apr-financial-parser-r31-remaining-nine/report.json')).cases;
if (reviewed.length !== 8 || remaining.length !== 9) throw new Error('expected 8 + 9 cases');

const manual = {
  'giovanna-atzeni': 'Errore APR originario: veniva letta una sola fattura del fascicolo; r30 riconcilia ora entrambe.',
  'elena-marcella-berti': 'Errore APR originario: veniva letta una sola fattura acconto/saldo; r30 riconcilia ora entrambe.',
  'francesca-pisanu': 'Errori APR originari: seconda fattura omessa e OCR 180° invertito; r30 corregge entrambi.',
  'claudia-sellati': 'Errori APR originari: seconda fattura omessa e valori presi da celle non etichettate; r30 riconcilia ora i documenti.',
  'giovanni-amadu': 'Errore APR originario: valori presi da celle errate; r30 usa le etichette fiscali.',
  'massimo-cappello': 'Errore APR originario: layout SdI/PA-Digitale non letto; r30 legge il riepilogo IVA e totali.',
  'maurizia-coreggioli': 'Errore APR originario: storno non economico a zero e blocker generico superstite; r31 ritira il solo blocker finanziario risolto.',
  'gabriele-girelli': 'Blocco dati confermato dalla verifica manuale: la fattura richiesta manca realmente.'
};

const cases = [...reviewed, ...remaining].map((base) => {
  const cohort = base.customerKey === 'maurizia-coreggioli' ? 3046 : base.cohort;
  const croot = cohortDir(cohort);
  const key = base.customerKey;
  const local = path.join(croot, 'crm-local-preflight/checkpoint.json');
  const infissi = path.join(croot, 'infissi-batch-preflight/checkpoint.json');
  const localItem = itemFor(local, key);
  const financial = localItem?.report?.financial || null;
  const raw = [...blockersFrom(local, key), ...blockersFrom(infissi, key)];
  const snapshot = path.join(root, `terminal-observability/${path.basename(croot)}.json`);
  const snap = read(snapshot);
  if (snap.caseTruth.status !== 'blocked_case' || snap.caseTruth.blockerCount < 1 || snap.aprStatus.consistency !== 'CONSISTENT') {
    throw new Error(`${key}: terminal truth not consistent blocked_case`);
  }
  const used = new Set();
  const blockers = (snap.caseTruth.reportBlockers || []).map((terminalBlocker, index) => {
    const matchIndex = raw.findIndex((b, i) => !used.has(i) && b.code === terminalBlocker.code);
    if (matchIndex >= 0) used.add(matchIndex);
    const persisted = matchIndex >= 0 ? raw[matchIndex] : {};
    const b = {...terminalBlocker, ...persisted, reason: persisted.reason || terminalBlocker.message || null};
    return {...b, terminalIndex:index, operatorQuestion: operatorQuestion(b, base.displayName)};
  });
  if (!blockers.length) throw new Error(`${key}: no persisted blockers found`);
  if (snap.caseTruth.blockerCount !== blockers.length) {
    throw new Error(`${key}: blocker count mismatch snapshot=${snap.caseTruth.blockerCount} persisted=${blockers.length}`);
  }
  return {
    customerKey: key, displayName: base.displayName, practiceId: base.practiceId,
    cohort, state: 'operator_required', manualComparison: manual[key] || 'Caso non incluso nella verifica manuale indipendente iniziale.',
    financial: financial ? {
      invoiceTotal: financial.invoiceTotal,
      eligibleExpense: financial.eligibleExpense,
      tripleReconciliationVerified: financial.tripleReconciliationVerified,
      methods: (financial.methods || []).map((m) => ({method:m.method, ok:m.ok, total:m.total, reason:m.reason})),
      evidence: financial.evidence || [], bankTransferReconciliation: financial.bankTransferReconciliation || null
    } : null,
    blockers,
    verification: {
      persistentCheckpoint: local,
      reportBlockerCount: blockers.length,
      terminalSnapshot: snapshot,
      dashboardCaseTruth: snap.caseTruth,
      agreement: 'CONSISTENT'
    }
  };
});

const byCode = {};
for (const c of cases) for (const b of c.blockers) {
  byCode[b.code] ||= [];
  byCode[b.code].push({customerKey:c.customerKey, displayName:c.displayName, field:b.field || null, reason:b.reason || null, operatorQuestion:b.operatorQuestion});
}
const reviewedFinancialResolved = cases.filter((c) => manual[c.customerKey] && c.customerKey !== 'gabriele-girelli')
  .every((c) => c.financial?.tripleReconciliationVerified === true && !c.blockers.some((b) => /invoice_|financial|reconciliation|bank_transfer/i.test(b.code)));
const girelli = cases.find((c) => c.customerKey === 'gabriele-girelli');
const report = {
  version: 'apr-financial-parser-r31-final-report-v1', generatedAt: new Date().toISOString(),
  status: 'completed_verified', bundle: 'versions/5156569e-resolved-non-economic-blocker-r31-20260902',
  gateAttestation: 'ops/apr-wide100-financial-parser-r31-2026-09-02/financial-parser-install-attestation-r31.json',
  aggregate: {total:17, saved:0, operatorRequired:17, technicalBlock:0, inconsistent:0},
  manualReviewComparison: {
    reviewedCases:8, confirmedOriginalAprReadingErrorsResolved:7,
    trueMissingInvoiceStillBlocked: girelli.blockers.some((b) => /invoice_missing|original_invoice_missing/i.test(b.code)),
    allSevenFinancialPatternsResolved: reviewedFinancialResolved
  },
  cases, groupedResidualCauses: byCode,
  safety: {preview:false, submit:false, protocol:false, receipts:false, email:false, communications:false},
  evidenceHashes: {
    reviewedEightReport: sha(path.join(root, 'runs/apr-financial-parser-r30-reviewed-eight/report.json')),
    remainingNineCheckpoint: sha(path.join(root, 'runs/apr-financial-parser-r31-remaining-nine/checkpoint.json')),
    remainingNineReport: sha(path.join(root, 'runs/apr-financial-parser-r31-remaining-nine/report.json')),
    mauriziaReplayReport: sha(path.join(root, 'runs/apr-financial-parser-r31-maurizia-replay-v3/report.json'))
  }
};
if (!report.manualReviewComparison.allSevenFinancialPatternsResolved || !report.manualReviewComparison.trueMissingInvoiceStillBlocked) {
  throw new Error('manual comparison acceptance criteria failed');
}

fs.mkdirSync(outDir, {recursive:true});
const jsonPath = path.join(outDir, 'final-report-r31.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
const questionsPath = path.join(outDir, 'operator-questions-r31.json');
fs.writeFileSync(questionsPath, JSON.stringify({version:'apr-operator-questions-v1', generatedAt:report.generatedAt, cases:cases.map((c)=>({customerKey:c.customerKey,displayName:c.displayName,questions:c.blockers.map((b)=>({blockerCode:b.code,field:b.field||null,sourceIds:b.sourceIds||[],reason:b.reason||null,operatorQuestion:b.operatorQuestion}))}))}, null, 2) + '\n');
const lines = ['# Ri-verifica finanziaria APR r31 — report finale', '', `Generato: ${report.generatedAt}`, '', '## Esito aggregato', '', '- 17/17 casi terminali: 0 saved, 17 operator_required, 0 technical_block, 0 inconsistent.', '- I sette errori finanziari confermati dalla revisione manuale sono risolti; Gabriele Girelli resta correttamente bloccato per fattura realmente assente.', '- Maurizia Coreggioli: riconciliazione €5.000/€5.000 verde; il blocker finanziario superstite è stato ritirato, restano soltanto blocker non finanziari.', '- Anteprima, submit, protocollazione, ricevute, email e comunicazioni: mai consentiti.', '', '## Esito nome per nome', ''];
for (const c of cases) {
  lines.push(`### ${c.displayName}`, '', `- Stato: OPERATOR_REQUIRED (coorte ${c.cohort})`, `- Confronto: ${c.manualComparison}`, `- Finanza: ${c.financial ? `totale fatture €${c.financial.invoiceTotal}; tripla riconciliazione ${c.financial.tripleReconciliationVerified ? 'verde' : 'non verificata'}` : 'non disponibile'}`, '- Blocker residui:');
  for (const b of c.blockers) lines.push(`  - ${b.code}${b.field ? ` [${b.field}]` : ''}${b.reason ? ` — ${b.reason}` : ''}`, `    - Domanda operatore: ${b.operatorQuestion}`);
  lines.push('');
}
lines.push('## Integrità', '', `- final-report-r31.json SHA-256: ${sha(jsonPath)}`, `- operator-questions-r31.json SHA-256: ${sha(questionsPath)}`, '');
const mdPath = path.join(outDir, 'final-report-r31.md');
fs.writeFileSync(mdPath, lines.join('\n'));
console.log(JSON.stringify({jsonPath, mdPath, questionsPath, aggregate:report.aggregate, hashes:{json:sha(jsonPath),md:sha(mdPath),questions:sha(questionsPath)}}, null, 2));
