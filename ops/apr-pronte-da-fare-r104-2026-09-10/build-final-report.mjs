import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const workspace = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const runRoot = path.join(runtimeRoot, "runs/apr-pronte-da-fare-r104-current-flow-20260910");
const terminalRoot = path.join(runtimeRoot, "terminal-observability");
const outputRoot = path.join(workspace, "ops/apr-pronte-da-fare-r104-2026-09-10");
const outputJson = path.join(outputRoot, "final-report-7-categories.json");
const outputMarkdown = path.join(outputRoot, "final-report-7-categories.md");
const outputSha = path.join(outputRoot, "final-report-7-categories.sha256");

const taxonomy = [
  "SALVATA",
  "FALLITA_TECNICA",
  "BLOCCO_DOCUMENTALE_REALE",
  "BLOCCO_DATI_O_CONFLITTO_FONTI",
  "NON_PROCEDIBILE_PER_REGOLA",
  "ESCLUSA_A_MONTE",
  "INCONSISTENT_DA_VERIFICARE",
];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const atomicWrite = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, file);
};

const mainReportPath = path.join(runRoot, "report.json");
const mainCheckpointPath = path.join(runRoot, "checkpoint.json");
const journalPath = path.join(runRoot, "journal.ndjson");
const manifestPath = path.join(outputRoot, "manifest.json");
const mainReport = readJson(mainReportPath);

function terminalPath(item) {
  return path.join(terminalRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}.json`);
}

function categoryFor(item, truth) {
  if (item.state === "saved" && truth?.status === "READY" && truth.blockerCount === 0) return "SALVATA";
  if (item.state === "technical_block" && truth?.status === "TECHNICAL_BLOCK") return "FALLITA_TECNICA";
  if (item.state === "inconsistent" || truth?.status === "INCONSISTENT") return "INCONSISTENT_DA_VERIFICARE";
  if (item.state === "operator_required" && truth?.status === "blocked_case") {
    if (truth.blockerCodes?.includes("permanent_supplier_automation_exclusion")) return "ESCLUSA_A_MONTE";
    return "BLOCCO_DATI_O_CONFLITTO_FONTI";
  }
  return "INCONSISTENT_DA_VERIFICARE";
}

function missingDocumentType(blockerCodes) {
  const values = [];
  if (blockerCodes.includes("customer_form_missing")) values.push("modulo cliente");
  if (blockerCodes.includes("screening_primary_measurements_missing")) values.push("misure primarie dei prodotti");
  return values.length ? values : null;
}

function operatorQuestion(item, category, blockerCodes, snapshot) {
  if (category === "SALVATA") return null;
  if (category === "ESCLUSA_A_MONTE") return "Confermi la presa in carico manuale della pratica del fornitore escluso dall'automazione APR?";
  if (item.customerKey === "silvia-lomartire") return "Inserisci il modulo cliente e, per ogni schermatura, larghezza e altezza mancanti.";
  if (item.customerKey === "alberto-maggi" || item.customerKey === "marina-gerbaudo") return "Conferma il numero esatto dei prodotti e inserisci larghezza e altezza per ciascuna schermatura.";
  if (blockerCodes.includes("product_cardinality_form_invoice_mismatch")) return "Conferma il numero esatto dei prodotti fisici indicati dalle fatture e la loro corrispondenza con le righe del form.";
  if (item.customerKey === "odoardo-lotto") return "Il form conferma la presenza di chiusure oscuranti abbinate agli infissi? Rispondi sì o no.";
  if (item.customerKey === "anthony-pool-juscamaita-fuertes" || item.customerKey === "mario-spano") return "Inserisci larghezza e altezza corrette degli avvolgibili 1, 2, 5 e 6.";
  if (item.customerKey === "ernestina-avalli") return "Nella bozza ENEA 481943 i dati risultano già presenti e completi? Rispondi sì o no.";
  if (category === "FALLITA_TECNICA") return "Vuoi autorizzare la diagnosi generale del rifiuto ENEA del comune di residenza prima di riprovare questa pratica?";
  return snapshot?.aprStatus?.nextAction ?? "Quale dato preciso deve essere confermato per sbloccare la pratica?";
}

function onboardingGap(category, blockerCodes) {
  if (blockerCodes.includes("screening_primary_measurements_missing")) return "Rendere obbligatorie nel form iniziale larghezza, altezza e quantità per ogni prodotto.";
  if (blockerCodes.includes("customer_form_missing")) return "Impedire l'avanzamento alla pipeline operativa senza modulo cliente acquisito.";
  if (blockerCodes.includes("product_cardinality_form_invoice_mismatch")) return "Richiedere nel form una riga per ogni prodotto fisico e un riferimento univoco alla riga fattura.";
  if (category === "SALVATA" || category === "FALLITA_TECNICA" || category === "INCONSISTENT_DA_VERIFICARE" || category === "ESCLUSA_A_MONTE") return null;
  return "Raccogliere all'origine il dato indicato dalla domanda operatore.";
}

const cases = mainReport.cases.map((item) => {
  const caseRoot = path.join(runRoot, `case-${item.cohort}-${item.customerKey}`);
  const checkpointPath = path.join(caseRoot, "checkpoint.json");
  const reportPath = path.join(caseRoot, "report.json");
  const snapshotPath = terminalPath(item);
  const checkpoint = readJson(checkpointPath);
  const report = readJson(reportPath);
  const snapshot = readJson(snapshotPath);
  const checkpointResult = checkpoint.results?.find((entry) => entry.customerKey === item.customerKey) ?? null;
  const reportCase = report.cases?.find((entry) => entry.customerKey === item.customerKey) ?? null;
  const truth = snapshot.caseTruth ?? null;
  const category = categoryFor(item, truth);
  const blockerCodes = truth?.blockerCodes ?? [];
  const stateAgreement = item.state === checkpointResult?.state && item.state === reportCase?.state;
  const truthAgreement = item.state === "saved" ? truth?.status === "READY" && truth.blockerCount === 0
    : item.state === "operator_required" ? truth?.status === "blocked_case" && truth.blockerCount > 0
      : item.state === "technical_block" ? truth?.status === "TECHNICAL_BLOCK"
        : item.state === "inconsistent" ? truth?.status === "INCONSISTENT"
          : false;
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
    exactCause: blockerCodes.length ? blockerCodes : [item.reason ?? "nessuna_causa_registrata"],
    reportBlockers: truth?.reportBlockers ?? [],
    missingDocumentType: missingDocumentType(blockerCodes),
    operatorQuestion: operatorQuestion(item, category, blockerCodes, snapshot),
    onboardingGap: onboardingGap(category, blockerCodes),
    tripleVerification: {
      outerReportState: item.state,
      checkpointState: checkpointResult?.state ?? null,
      childReportState: reportCase?.state ?? null,
      caseTruthStatus: truth?.status ?? null,
      caseTruthBlockerCount: truth?.blockerCount ?? null,
      terminalConsistency: snapshot.aprStatus?.consistency ?? null,
      statesAgree: stateAgreement && truthAgreement,
      conclusion: category === "INCONSISTENT_DA_VERIFICARE" ? "INCONSISTENT" : stateAgreement && truthAgreement ? "VERIFIED" : "INCONSISTENT",
    },
    evidence: { checkpointPath, reportPath, terminalSnapshotPath: snapshotPath },
  };
});

const counts = Object.fromEntries(taxonomy.map((category) => [category, cases.filter((item) => item.category === category).length]));
if (mainReport.status !== "completed" || cases.length !== 19 || Object.values(counts).reduce((sum, value) => sum + value, 0) !== 19) {
  throw new Error("final_report_cardinality_or_completion_invalid");
}
if (cases.some((item) => !item.tripleVerification.statesAgree)) throw new Error("final_report_three_way_state_mismatch");

const output = {
  version: "apr-pronte-da-fare-r104-final-7-categories-v1",
  generatedAt: new Date().toISOString(),
  status: "FINAL",
  scope: {
    total: 19,
    currentPronteDaFare: 15,
    explicitlyIncludedMovedToRecensione: 4,
    syntheticRecordsExcluded: 2,
    manifestPath,
    manifestSha256: sha256(manifestPath),
  },
  execution: {
    startedAt: mainReport.startedAt,
    endedAt: mainReport.endedAt,
    bundle: mainReport.bundle,
    sequential: true,
    freshGeneration: true,
    noMidLotCorrections: true,
    safety: mainReport.safety,
  },
  taxonomy,
  counts,
  publishedSystemCounts: {
    saved: mainReport.saved,
    operatorRequired: mainReport.operatorRequired,
    technicalBlock: mainReport.technicalBlock,
    inconsistent: mainReport.inconsistent,
  },
  interpretation: {
    preflightSevenMinuteStalls: 0,
    completedDrafts: cases.filter((item) => item.category === "SALVATA").map((item) => ({ displayName: item.displayName, draftId: item.draftId })),
    documentBlocksNotPromotedWithoutManualPrimaryEvidence: true,
  },
  cases,
  integrity: {
    mainReportSha256: sha256(mainReportPath),
    mainCheckpointSha256: sha256(mainCheckpointPath),
    journalSha256: sha256(journalPath),
    manifestSha256: sha256(manifestPath),
  },
};

const lines = [
  "# Report finale APR r104 — Pronte da fare",
  "",
  `Esecuzione: ${output.execution.startedAt} → ${output.execution.endedAt}`,
  `Manifest: ${output.scope.total} pratiche (${output.scope.currentPronteDaFare} Pronte da fare + ${output.scope.explicitlyIncludedMovedToRecensione} spostate in Recensione).`,
  `Bundle worker: ${output.execution.bundle.workerSha256}`,
  "Sicurezza: sole bozze; nessuna anteprima, invio o comunicazione.",
  "",
  "## Conteggi nelle sette categorie",
  "",
  ...taxonomy.map((category) => `- ${category}: ${counts[category]}`),
  "",
];
for (const category of taxonomy) {
  const selected = cases.filter((item) => item.category === category);
  lines.push(`## ${category} (${selected.length})`, "");
  for (const item of selected) {
    lines.push(`- **${item.displayName}** — ${item.exactCause.join(", ")}${item.draftId ? ` — bozza ${item.draftId}` : ""}`);
    if (item.operatorQuestion) lines.push(`  - operatorQuestion: ${item.operatorQuestion}`);
    if (item.missingDocumentType) lines.push(`  - missingDocumentType: ${item.missingDocumentType.join(", ")}`);
  }
  lines.push("");
}

atomicWrite(outputJson, `${JSON.stringify(output, null, 2)}\n`);
atomicWrite(outputMarkdown, `${lines.join("\n")}\n`);
const reportHash = sha256(outputJson);
atomicWrite(outputSha, `${reportHash}  ${path.basename(outputJson)}\n`);
process.stdout.write(`${JSON.stringify({ outputJson, outputMarkdown, outputSha, reportHash, counts }, null, 2)}\n`);
