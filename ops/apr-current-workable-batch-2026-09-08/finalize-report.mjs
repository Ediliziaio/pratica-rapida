import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const runRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-current-workable-batch-r86-20260908";
const manifestPath = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-current-workable-batch-2026-09-08/manifest.json";
const reportPath = path.join(runRoot, "report.json");
const outputJson = path.join(runRoot, "final-report-grouped.json");
const outputMarkdown = path.join(runRoot, "final-report-grouped.md");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, value); } finally { closeSync(descriptor); }
  renameSync(temporary, file);
}

let report;
while (true) {
  try { report = readJson(reportPath); } catch { report = null; }
  if (report?.status === "completed" && report.processed === report.total) break;
  await sleep(30_000);
}
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const byPractice = new Map(report.cases.map((item) => [item.practiceId, item]));
const groupOrder = ["original_workable", "new_pipeline", "linea_sole_potito"];
const groups = Object.fromEntries(groupOrder.map((group) => {
  const cases = manifest.cases.filter((item) => item.group === group).map((item) => ({ ...byPractice.get(item.practiceId), group }));
  return [group, {
    total: cases.length,
    saved: cases.filter((item) => item.state === "saved").length,
    operatorRequired: cases.filter((item) => item.state === "operator_required").length,
    technicalBlock: cases.filter((item) => item.state === "technical_block").length,
    inconsistent: cases.filter((item) => item.state === "inconsistent").length,
    cases,
    incomplete: cases.filter((item) => item.state !== "saved").map((item) => ({
      displayName: item.displayName,
      practiceId: item.practiceId,
      state: item.state,
      exactCause: item.reason ?? "Motivo non disponibile nel report terminale",
      operatorQuestion: item.operatorQuestion ?? null,
      missingDocumentType: item.missingDocumentType ?? null,
    })),
  }];
}));
const final = {
  version: "apr-current-workable-batch-final-grouped-v1",
  generatedAt: new Date().toISOString(),
  sourceReport: reportPath,
  sourceReportSha256: sha256(readFileSync(reportPath)),
  manifest: { path: manifestPath, sha256: sha256(manifestBytes), groups: manifest.selection.groups },
  totals: { total: report.total, saved: report.saved, operatorRequired: report.operatorRequired, technicalBlock: report.technicalBlock, inconsistent: report.inconsistent },
  groups,
  safety: report.safety,
};
atomicWrite(outputJson, `${JSON.stringify(final, null, 2)}\n`);
const lines = [
  "# APR r86 — rapporto finale raggruppato",
  "",
  `Totale: ${report.total}; complete: ${report.saved}; intervento operatore: ${report.operatorRequired}; blocchi tecnici: ${report.technicalBlock}; incoerenti: ${report.inconsistent}.`,
  "",
];
for (const group of groupOrder) {
  const value = groups[group];
  lines.push(`## ${group}`, "", `Totale ${value.total}; complete ${value.saved}; operatore ${value.operatorRequired}; tecniche ${value.technicalBlock}; incoerenti ${value.inconsistent}.`, "");
  for (const item of value.incomplete) lines.push(`- ${item.displayName} — ${item.state} — ${item.exactCause}`);
  lines.push("");
}
lines.push("Nessuna anteprima, trasmissione o comunicazione autorizzata o eseguita.", "");
atomicWrite(outputMarkdown, lines.join("\n"));
const message = `APR r86 lotto concluso: ${report.saved}/${report.total} bozze complete; operatore ${report.operatorRequired}, tecniche ${report.technicalBlock}, incoerenti ${report.inconsistent}.`;
const response = await fetch("https://ntfy.sh/apr-giuliano-x7q2m9", { method: "POST", body: message });
atomicWrite(path.join(runRoot, "final-notification.json"), `${JSON.stringify({ at: new Date().toISOString(), ok: response.ok, status: response.status, messageSha256: sha256(message) }, null, 2)}\n`);
