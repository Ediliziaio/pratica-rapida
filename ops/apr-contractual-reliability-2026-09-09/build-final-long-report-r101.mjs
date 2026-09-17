import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const workspace = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-contractual-reliability-r101-long-20260909";
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const terminalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/terminal-observability";
const comparisonPath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/saved-total-comparison-r101.json");
const manifestPath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/manifest-long-r101.json");
const familyPath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/preflight-stall-seven-minute-family.json");
const multiInvoicePath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/multi-invoice-product-row-family.json");
const prematureQuestionPath = path.join(workspace, "ops/apr-contractual-reliability-2026-09-09/premature-operator-question-emission.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const mainReportPath = path.join(runRoot, "report.json");
const mainCheckpointPath = path.join(runRoot, "checkpoint.json");
const journalPath = path.join(runRoot, "journal.ndjson");
const mainReport = readJson(mainReportPath);
const comparison = readJson(comparisonPath);

const taxonomy = [
  "SALVATA",
  "FALLITA_TECNICA",
  "BLOCCO_DOCUMENTALE_REALE",
  "BLOCCO_DATI_O_CONFLITTO_FONTI",
  "NON_PROCEDIBILE_PER_REGOLA",
  "ESCLUSA_A_MONTE",
  "INCONSISTENT_DA_VERIFICARE",
];

const manualTruth = {
  "sarah-mondini": {
    category: "FALLITA_TECNICA",
    note: "Verifica manuale primaria gia accettata: pratica chiusa come corretta; il blocco corrente su zero prodotti/misure appartiene alla famiglia parser multi-fattura, non a un dato realmente assente.",
  },
  "stefano-buosi": {
    category: "BLOCCO_DATI_O_CONFLITTO_FONTI",
    note: "Verifica manuale primaria gia accettata: le misure sono realmente assenti; il sistema le ha pubblicate impropriamente come TECHNICAL_BLOCK.",
  },
  "maria-sofia-tosatti": {
    note: "Verifica manuale primaria gia accettata: le misure esistono, manoscritte nello spazio finestra protetta; il preflight si arresta prima di formulare la domanda operatore.",
  },
  "roberta-di-cesare": {
    note: "Verifica manuale primaria gia accettata: le misure sono realmente assenti; il preflight si arresta prima di formulare la domanda operatore.",
  },
  "giulia-kasermann": {
    note: "Verifica manuale primaria gia accettata: le misure sono realmente assenti.",
  },
  "marian-maeschi": {
    note: "Verifica manuale primaria gia accettata: pratica chiusa come corretta; l'attuale segnalazione di misure mancanti non e una prova di assenza del dato.",
  },
};

function findDirectory(prefix, root) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(root, entry.name));
  if (entries.length !== 1) throw new Error(`directory_non_univoca:${prefix}:${entries.length}`);
  return entries[0];
}

function findTerminalSnapshot(cohort, customerKey) {
  const prefix = `apr-pilot-${cohort}-global-controller-${customerKey}`;
  const entries = fs.readdirSync(terminalRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => path.join(terminalRoot, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] ?? null;
}

function simplifiedCause(item) {
  const reason = item.reason ?? "";
  if (reason === "no_material_progress_for_7_minutes") return "preflight_no_material_progress_for_7_minutes";
  const economic = reason.match(/apr_enea_bridge_prepare_economic_unresolved:[a-z0-9-]+/);
  if (economic) return "apr_enea_bridge_prepare_economic_unresolved";
  const verification = reason.match(/apr_cdp_enea_field_verification_failed:([^\n.]+)/);
  if (verification) return `apr_cdp_enea_field_verification_failed:${verification[1]}`;
  const tokens = [...new Set(reason.match(/[a-z][a-z0-9]+(?:_[a-z0-9]+)+/g) ?? [])];
  return tokens.length ? tokens.join(", ") : reason || "nessuna_causa_registrata";
}

function operatorQuestion(item, category) {
  const key = item.customerKey;
  if (category === "SALVATA") return null;
  if (key === "sarah-mondini") return "Dopo la correzione generale del parser multi-fattura, vuoi includere Sarah Mondini nel replay di regressione?";
  if (key === "marcella-capatti") return "Quale fonte Infissi deve essere considerata corretta per risolvere il conflitto automatico rilevato nella pratica?";
  if (key === "giulia-kasermann") return "Inserisci il numero esatto dei prodotti e, per ogni schermatura, larghezza e altezza mancanti.";
  if (key === "stefano-buosi") return "Inserisci larghezza e altezza mancanti per ciascun infisso/prodotto della pratica.";
  if (key === "maria-sofia-tosatti") return "Confermi che vanno usate le misure manoscritte nello spazio 'finestra protetta' dell'ultima pagina?";
  if (key === "roberta-di-cesare") return "Inserisci larghezza e altezza mancanti per ciascuna schermatura della pratica.";
  if (item.reason === "no_material_progress_for_7_minutes") return "Dopo la correzione generale dello stallo preflight, vuoi includere questa pratica nel replay di regressione?";
  if (category === "INCONSISTENT_DA_VERIFICARE") return "Confermi di mantenere la pratica congelata finche checkpoint, blocker e case-truth non producono un verdetto concordante?";
  if (category === "FALLITA_TECNICA") return "Dopo la correzione generale della causa tecnica indicata, vuoi includere questa pratica nel replay operativo di regressione?";
  if (category === "BLOCCO_DATI_O_CONFLITTO_FONTI") return "Quale dato o fonte deve essere confermato per risolvere il conflitto indicato?";
  return "Confermi di mantenere la pratica fuori dall'elaborazione automatica fino alla risoluzione della causa indicata?";
}

function onboardingGap(item, category) {
  if (item.customerKey === "giulia-kasermann" || item.customerKey === "stefano-buosi") {
    return "Richiedere nel form iniziale misure fisiche standardizzate per ogni prodotto, con larghezza, altezza e cardinalita obbligatorie.";
  }
  if (item.customerKey === "marcella-capatti") {
    return "Rendere esplicita nel form la fonte autoritativa quando due fonti Infissi riportano dati incompatibili.";
  }
  if (category === "SALVATA" || category === "FALLITA_TECNICA" || category === "INCONSISTENT_DA_VERIFICARE") return null;
  return "Raccogliere all'origine il dato specifico indicato dalla domanda operatore.";
}

function classify(item, checkpointState, reportState, caseTruth) {
  if (item.reason === "no_material_progress_for_7_minutes") return "INCONSISTENT_DA_VERIFICARE";
  if (item.state === "inconsistent" || checkpointState === "inconsistent" || reportState === "inconsistent" || caseTruth?.status === "INCONSISTENT") {
    return "INCONSISTENT_DA_VERIFICARE";
  }
  const override = manualTruth[item.customerKey]?.category;
  if (override) return override;
  if (item.state === "saved" && checkpointState === "saved" && reportState === "saved" && caseTruth?.status === "READY" && caseTruth?.blockerCount === 0) return "SALVATA";
  if (item.state === "operator_required" && checkpointState === "operator_required" && reportState === "operator_required" && caseTruth?.status === "blocked_case" && caseTruth?.blockerCount > 0) return "BLOCCO_DATI_O_CONFLITTO_FONTI";
  if (item.state === "technical_block" && checkpointState === "technical_block" && reportState === "technical_block" && caseTruth?.status === "TECHNICAL_BLOCK") return "FALLITA_TECNICA";
  return "INCONSISTENT_DA_VERIFICARE";
}

const cases = mainReport.cases.map((item) => {
  const caseDir = findDirectory(`case-${item.cohort}-${item.customerKey}`, runRoot);
  const checkpointPath = path.join(caseDir, "checkpoint.json");
  const reportPath = path.join(caseDir, "report.json");
  const checkpoint = readJson(checkpointPath);
  const report = readJson(reportPath);
  const checkpointResult = checkpoint.results?.find((entry) => entry.customerKey === item.customerKey) ?? null;
  const reportCase = report.cases?.find((entry) => entry.customerKey === item.customerKey) ?? null;
  const terminalSnapshotPath = findTerminalSnapshot(item.cohort, item.customerKey);
  const terminalSnapshot = terminalSnapshotPath ? readJson(terminalSnapshotPath) : null;
  const caseTruth = terminalSnapshot?.caseTruth ?? null;
  const category = classify(item, checkpointResult?.state, reportCase?.state, caseTruth);
  const sourceAgreement = category === "SALVATA"
    ? item.state === "saved" && checkpointResult?.state === "saved" && reportCase?.state === "saved" && caseTruth?.status === "READY" && caseTruth?.blockerCount === 0
    : item.reason === "no_material_progress_for_7_minutes"
      ? false
      : item.state === checkpointResult?.state && item.state === reportCase?.state && caseTruth !== null;
  return {
    cohort: item.cohort,
    customerKey: item.customerKey,
    displayName: item.displayName,
    practiceId: item.practiceId,
    group: item.group,
    category,
    systemVerdict: item.state,
    draftId: item.draftId ?? null,
    completedPages: item.completedPages ?? 0,
    expectedPages: item.expectedPages ?? 0,
    exactCause: simplifiedCause(item),
    missingDocumentType: null,
    operatorQuestion: operatorQuestion(item, category),
    onboardingGap: onboardingGap(item, category),
    acceptedManualTruthNote: manualTruth[item.customerKey]?.note ?? null,
    tripleVerification: {
      outerReportState: item.state,
      checkpointState: checkpointResult?.state ?? null,
      reportState: reportCase?.state ?? null,
      reportBlockers: caseTruth?.reportBlockers ?? [],
      caseTruthStatus: caseTruth?.status ?? null,
      caseTruthBlockerCount: caseTruth?.blockerCount ?? null,
      sourcesAgree: sourceAgreement,
      conclusion: sourceAgreement ? "VERIFIED" : "INCONSISTENT",
    },
    evidence: {
      checkpointPath,
      reportPath,
      terminalSnapshotPath,
    },
  };
});

const categoryCounts = Object.fromEntries(taxonomy.map((category) => [category, cases.filter((item) => item.category === category).length]));
if (cases.length !== 63 || Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) !== 63) {
  throw new Error("classification_cardinality_mismatch");
}

const output = {
  version: "apr-contractual-reliability-r101-long-final-v1",
  generatedAt: new Date().toISOString(),
  status: "FINAL",
  scope: {
    runRoot,
    manifestPath,
    manifestSha256: sha256(manifestPath),
    cases: 63,
    note: "Questo lotto e un sottoinsieme operativo di 63 pratiche; non viene usato da solo per ricalcolare la percentuale contrattuale sul denominatore complessivo di 80.",
  },
  bundle: mainReport.bundle,
  execution: {
    startedAt: mainReport.startedAt,
    endedAt: mainReport.endedAt,
    status: mainReport.status,
    sequential: mainReport.policy?.sequential,
    freshGeneration: mainReport.policy?.freshGeneration,
    safety: mainReport.safety,
  },
  taxonomy,
  counts: categoryCounts,
  publishedSystemCounts: {
    saved: mainReport.saved,
    operatorRequired: mainReport.operatorRequired,
    technicalBlock: mainReport.technicalBlock,
    inconsistent: mainReport.inconsistent,
  },
  importantInterpretation: {
    historicalSavedRegression: {
      total: 31,
      saved: 30,
      inconsistentDueToPreflightStall: 1,
      failedName: "Armando Ranzoni",
    },
    remainingContractual: {
      total: 32,
      saved: 1,
      notSaved: 31,
    },
    noRealDocumentBlocksObservedInThisSubset: true,
    timeoutPolicy: "Gli 11 timeout pubblicati dal controller come TECHNICAL_BLOCK restano INCONSISTENT_DA_VERIFICARE perche il report/checkpoint interno resta working e il case-truth terminale manca.",
  },
  savedTotalComparison: {
    sourcePath: comparisonPath,
    status: comparison.status,
    counts: comparison.counts,
    discordant: comparison.discordant.map((entry) => ({
      customerKey: entry.customerKey,
      displayName: entry.displayName,
      aprTotalEuros: entry.aprTotal?.euros,
      humanTotalEuros: entry.humanTotal?.euros,
      deltaEuros: entry.deltaEuros,
    })),
    scopeNote: "Il confronto include 10 SAVED del mirato precedente piu tutte le 31 SAVED del lotto lungo: 41 osservazioni complessive.",
  },
  tomorrowPriorities: [
    { priority: 1, family: "multi_invoice_product_row_extraction", evidencePath: multiInvoicePath, actionTonight: "NOT_TOUCHED" },
    { priority: 2, family: "preflight_no_material_progress_until_outer_timeout", evidencePath: familyPath, actionTonight: "NOT_TOUCHED" },
    { priority: 3, family: "premature_operator_question_emission_and_non_retirement", evidencePath: prematureQuestionPath, actionTonight: "NOT_TOUCHED" },
  ],
  cases,
  integrity: {
    sourceHashes: {
      mainReportSha256: sha256(mainReportPath),
      mainCheckpointSha256: sha256(mainCheckpointPath),
      journalSha256: sha256(journalPath),
      manifestSha256: sha256(manifestPath),
      savedTotalComparisonSha256: sha256(comparisonPath),
    },
  },
};

if (process.argv.includes("--markdown")) {
  const lines = [];
  lines.push("# Report finale lotto lungo APR r101 — 9 settembre 2026", "");
  lines.push(`- Esecuzione: ${output.execution.startedAt} → ${output.execution.endedAt}`);
  lines.push(`- Bundle: ${output.bundle.path}`);
  lines.push(`- Worker SHA-256: \`${output.bundle.workerSha256}\``);
  lines.push(`- Manifest: 63 pratiche, SHA-256 \`${output.scope.manifestSha256}\``);
  lines.push(`- Sicurezza: solo bozze; anteprima=${output.execution.safety.previewAttempted}, submit=${output.execution.safety.submitAttempted}, comunicazioni=${output.execution.safety.communicationsAttempted}.`, "");
  lines.push("## Conteggi nelle 7 categorie", "");
  for (const category of taxonomy) lines.push(`- ${category}: ${categoryCounts[category]}`);
  lines.push("", "Il lotto lungo non e il denominatore contrattuale complessivo di 80 e quindi non viene usato da solo per ricalcolare la percentuale contrattuale.", "");
  lines.push("## Riscontri principali", "");
  lines.push("- Prime 31 pratiche gia salvate: 30 nuovamente SAVED; Armando Ranzoni entra nello stallo preflight e resta INCONSISTENT.");
  lines.push("- Restanti 32 pratiche: 1 SAVED (Fabrizio Pelizzari), 31 non salvate.");
  lines.push("- Timeout preflight: 11 casi, nessuna bozza, stato esterno TECHNICAL_BLOCK ma stato interno working e case-truth assente; classificati INCONSISTENT.");
  lines.push(`- Confronto totali read-only: ${comparison.counts.compared} confronti, ${comparison.counts.concordant} concordanti, ${comparison.counts.discordant} discordante.`);
  lines.push("- Discordanza totali: Santo Giuga, APR EUR 10.953,08 contro umano EUR 10.678,08, scarto +EUR 275,00.", "");
  lines.push("## Priorita per domani", "");
  lines.push("1. Parser multi-fattura / estrazione righe prodotto.");
  lines.push("2. Stallo preflight a 7 minuti, prima della formulazione della domanda operatore.");
  lines.push("3. Domande operatore emesse prematuramente e non ritirate dopo autorisoluzione.", "");
  for (const category of taxonomy) {
    const members = cases.filter((item) => item.category === category);
    lines.push(`## ${category} (${members.length})`, "");
    if (!members.length) {
      lines.push("Nessun caso.", "");
      continue;
    }
    for (const item of members) {
      lines.push(`- **${item.displayName}** (coorte ${item.cohort}${item.draftId ? `, bozza ${item.draftId}` : ""}) — ${item.exactCause}.`);
      if (item.acceptedManualTruthNote) lines.push(`  - Verita manuale accettata: ${item.acceptedManualTruthNote}`);
      if (item.operatorQuestion) lines.push(`  - operatorQuestion: ${item.operatorQuestion}`);
      if (item.onboardingGap) lines.push(`  - onboardingGap: ${item.onboardingGap}`);
      lines.push(`  - Tripla verifica: ${item.tripleVerification.conclusion}; checkpoint=${item.tripleVerification.checkpointState}, report=${item.tripleVerification.reportState}, case-truth=${item.tripleVerification.caseTruthStatus}.`);
    }
    lines.push("");
  }
  lines.push("## Integrita fonti", "");
  for (const [name, value] of Object.entries(output.integrity.sourceHashes)) lines.push(`- ${name}: \`${value}\``);
  process.stdout.write(`${lines.join("\n")}\n`);
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
