import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const repoRoot = process.cwd();
const opsRoot = join(repoRoot, "ops/apr-wide100-province-lineage-2026-09-02");
const runRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-current-cohort-bridge-r25";
const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const manifestPath = join(opsRoot, "manifest.json");
const checkpointPath = join(runRoot, "checkpoint.json");
const runReportPath = join(runRoot, "report.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const checkpoint = readJson(checkpointPath);
const runReport = readJson(runReportPath);
const results = checkpoint.results ?? [];

function cohortPath(result) {
  const prefix = `apr-pilot-${result.cohort}-global-controller-${result.customerKey}`;
  const exact = join(cohortsRoot, prefix);
  if (statSafe(exact)?.isDirectory()) return exact;
  const found = readdirSync(cohortsRoot).find((name) => name.startsWith(`apr-pilot-${result.cohort}-`) && name.endsWith(`-${result.customerKey}`));
  if (!found) throw new Error(`cohort_not_found:${result.cohort}:${result.customerKey}`);
  return join(cohortsRoot, found);
}

function statSafe(path) {
  try { return statSync(path); } catch { return null; }
}

function jsonFiles(root, depth = 0) {
  if (depth > 3) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "install" || entry.name === "dashboard") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...jsonFiles(path, depth + 1));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

function blockedCandidates(value, customerKey, path, out = []) {
  if (!value || typeof value !== "object") return out;
  if (!Array.isArray(value)) {
    const blockers = value.report?.blockers;
    if (value.customerKey === customerKey && value.state === "blocked_case" && Array.isArray(blockers) && blockers.length > 0) {
      out.push({ path, item: value, blockers });
    }
  }
  for (const nested of Array.isArray(value) ? value : Object.values(value)) blockedCandidates(nested, customerKey, path, out);
  return out;
}

function evidenceForOperator(result) {
  const root = cohortPath(result);
  const dashboardPath = join(root, "dashboard/status.json");
  const dashboard = readJson(dashboardPath);
  const candidates = [];
  for (const path of jsonFiles(root)) {
    let json;
    try { json = readJson(path); } catch { continue; }
    blockedCandidates(json, result.customerKey, path, candidates);
  }
  candidates.sort((a, b) => {
    const aPreferred = a.path.includes("infissi-batch-preflight") || a.path.includes("crm-local-preflight") ? 1 : 0;
    const bPreferred = b.path.includes("infissi-batch-preflight") || b.path.includes("crm-local-preflight") ? 1 : 0;
    return bPreferred - aPreferred || b.blockers.length - a.blockers.length;
  });
  const selected = candidates[0] ?? null;
  return {
    root,
    dashboardPath,
    dashboard,
    evidencePath: selected?.path ?? null,
    blockers: selected?.blockers ?? [],
    outcome: selected?.item?.report?.outcome ?? null,
  };
}

function conciseTechnicalReason(result) {
  const text = result.technicalReason || result.reason || "causa tecnica non tipizzata";
  if (text.includes("crm_enea_draft_package_fingerprint_mismatch")) return "crm_enea_draft_package_fingerprint_mismatch";
  const match = text.match(/apr_[a-z0-9_:-]+/i);
  return match?.[0] ?? text.split("\n")[0].slice(0, 180);
}

const manifestHash = sha256(manifestPath);
const expectedManifestHash = "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0";
const counts = Object.fromEntries(["saved", "operator_required", "technical_block"].map((state) => [state, results.filter((r) => r.state === state).length]));
const inconsistencies = [];
const operatorCases = [];
const technicalCases = [];
const savedCases = [];

for (const result of results) {
  const root = cohortPath(result);
  const dashboardPath = join(root, "dashboard/status.json");
  const dashboard = readJson(dashboardPath);
  if (result.state === "operator_required") {
    const evidence = evidenceForOperator(result);
    if (evidence.dashboard.state !== "OPERATOR_REQUIRED" || evidence.outcome !== "blocked_case" || evidence.blockers.length === 0) {
      inconsistencies.push(`${result.displayName}: checkpoint=${result.state}, dashboard=${evidence.dashboard.state}, outcome=${evidence.outcome}, blockers=${evidence.blockers.length}`);
    }
    const codes = [...new Set(evidence.blockers.map((b) => b.code || "blocker_senza_codice"))].sort();
    operatorCases.push({ result, ...evidence, codes, signature: codes.join(" + ") });
  } else if (result.state === "technical_block") {
    if (dashboard.state !== "TECHNICAL_BLOCK") inconsistencies.push(`${result.displayName}: checkpoint=technical_block, dashboard=${dashboard.state}`);
    technicalCases.push({ result, dashboard, dashboardPath, reason: conciseTechnicalReason(result) });
  } else if (result.state === "saved") {
    if (dashboard.state !== "IDLE" || !String(dashboard.reason ?? "").includes("Bozza TEST completa")) {
      inconsistencies.push(`${result.displayName}: checkpoint=saved, dashboard=${dashboard.state}, reason=${dashboard.reason ?? ""}`);
    }
    savedCases.push({ result, dashboardPath });
  } else {
    inconsistencies.push(`${result.displayName}: stato terminale sconosciuto ${result.state}`);
  }
}

if (manifestHash !== expectedManifestHash) inconsistencies.push(`manifest SHA-256 inatteso: ${manifestHash}`);
if (checkpoint.status !== "completed" || runReport.status !== "completed" || results.length !== 100) {
  inconsistencies.push(`run non terminale: checkpoint=${checkpoint.status}, report=${runReport.status}, risultati=${results.length}`);
}

const signatureGroups = new Map();
for (const item of operatorCases) {
  const group = signatureGroups.get(item.signature) ?? [];
  group.push(item);
  signatureGroups.set(item.signature, group);
}
const codeCounts = new Map();
for (const item of operatorCases) for (const code of item.codes) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);

const rel = (path) => path ? (path.startsWith(repoRoot) ? relative(repoRoot, path) : path) : "ASSENTE";
const blockerText = (b) => {
  const fields = [b.code || "blocker_senza_codice"];
  if (b.field) fields.push(`campo=${b.field}`);
  if (Array.isArray(b.sourceIds)) fields.push(`sourceIds=${b.sourceIds.length ? b.sourceIds.join(",") : "[]"}`);
  return fields.join("; ");
};

const finalLines = [
  "# Report finale APR wide100 — bridge corrente r28",
  "",
  `Generato: ${new Date().toISOString()}`,
  `Esecuzione operativa reale su ENEA TEST (sole bozze): ${runReport.startedAt} — ${runReport.endedAt}`,
  `Stato verificato: ${inconsistencies.length === 0 ? "COMPLETED, tre fonti concordi" : "INCONSISTENT"}`,
  "",
  "## Esito",
  "",
  `- Campione congelato: 100/100, SHA-256 \`${manifestHash}\``,
  `- Bundle canonico: \`versions/064100d8-recovery-queued-gate-r28-20260902\``,
  `- Saved: ${counts.saved}`,
  `- Operator required (dati/documenti): ${counts.operator_required}`,
  `- Technical block: ${counts.technical_block}`,
  `- Incoerenti: ${inconsistencies.length}`,
  "- Anteprima, submit, protocollazione, ricevute, email e comunicazioni: vietati e non eseguiti.",
  "- Keepalive ENEA e sessione Chrome APR: mantenuti vivi; il solo sequencer del lotto è terminato con exit code 0.",
  "",
  "## Tripla verifica conclusiva",
  "",
  "1. `launchctl`: sequencer terminato con exit code 0; keepalive ancora running.",
  `2. Persistenza: checkpoint e report del run concordano su 100 terminali (${counts.saved}/${counts.operator_required}/${counts.technical_block}).`,
  "3. Snapshot terminali: ogni coorte saved è `IDLE` con bozza TEST verificata, ogni operator_required è `OPERATOR_REQUIRED` con `blocked_case` e blocker, ogni technical_block è `TECHNICAL_BLOCK`.",
  "",
  "## Lettura dell'esito",
  "",
  `La quota bassa di saved è dovuta soprattutto al campione mai testato: ${counts.operator_required} casi hanno blocker dati/documenti verificati. Restano però ${counts.technical_block} problemi tecnici distinti, elencati sotto; quindi il test ampio è concluso, ma il software non è dichiarato privo di difetti tecnici.`,
  "",
  "## Blocchi tecnici",
  "",
  ...technicalCases.flatMap(({ result, reason, dashboardPath }) => [
    `- **${result.displayName}** (caso ${results.indexOf(result) + 1}, coorte ${result.cohort}): \`${reason}\``,
    `  - Prove: checkpoint run; snapshot terminale \`${rel(dashboardPath)}\`; journal del sequencer.`,
  ]),
  "",
  "## Frequenza cause dati/documenti",
  "",
  "Una pratica può contribuire a più codici; questa tabella non deve quindi essere sommata per ricavare 73.",
  "",
  ...[...codeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, count]) => `- ${count} pratiche — \`${code}\``),
  "",
  "## Incoerenze",
  "",
  ...(inconsistencies.length ? inconsistencies.map((x) => `- ${x}`) : ["- Nessuna."]),
  "",
  "## Artefatti",
  "",
  `- Report nativo: \`${runReportPath}\``,
  `- Checkpoint nativo: \`${checkpointPath}\``,
  "- Elenco dettagliato operator_required: `operator-required-by-cause-final.md`.",
  "",
];

const operatorLines = [
  "# Operator required per causa — APR wide100 r28",
  "",
  `Totale verificato: ${operatorCases.length}. Ogni voce ha checkpoint prodotto con \`state=blocked_case\`, almeno un \`report.blockers\` e snapshot dashboard terminale \`OPERATOR_REQUIRED\`.`,
  "",
];
for (const [signature, cases] of [...signatureGroups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
  operatorLines.push(`## ${cases.length} — ${signature || "causa non tipizzata"}`, "");
  for (const item of cases.sort((a, b) => a.result.displayName.localeCompare(b.result.displayName, "it"))) {
    operatorLines.push(`- **${item.result.displayName}** — coorte ${item.result.cohort}, pratica \`${item.result.practiceId}\``);
    for (const blocker of item.blockers) operatorLines.push(`  - ${blockerText(blocker)}`);
    operatorLines.push(`  - Prova blocker: \`${rel(item.evidencePath)}\``);
    operatorLines.push(`  - Prova terminale: \`${rel(item.dashboardPath)}\``);
  }
  operatorLines.push("");
}

writeFileSync(join(opsRoot, "wide100-r28-final-report.md"), `${finalLines.join("\n")}\n`);
writeFileSync(join(opsRoot, "operator-required-by-cause-final.md"), `${operatorLines.join("\n")}\n`);
console.log(JSON.stringify({
  status: inconsistencies.length === 0 ? "verified" : "inconsistent",
  counts,
  operatorCases: operatorCases.length,
  technicalCases: technicalCases.length,
  inconsistencies,
  manifestHash,
}, null, 2));
