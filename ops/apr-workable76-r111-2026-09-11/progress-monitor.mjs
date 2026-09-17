import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const runRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911";
const expectedTotal = 76;
const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const controllerPidPath = path.join(runRoot, "detached-controller.pid");
const reportPath = path.join(runRoot, "report.json");
const statePath = path.join(runRoot, "independent-monitor.json");
const journalPath = path.join(runRoot, "independent-monitor.ndjson");
const liveQuestionsPath = path.join(runRoot, "operator-questions-live.json");
const localizationIssuesPath = path.join(runRoot, "localization-issues-live.json");
const milestonesDirectory = path.join(runRoot, "milestones");
const ntfyUrl = "https://ntfy.sh/apr-giuliano-x7q2m9";
const pollMs = 60_000;
const startupGraceMs = 180_000;
const silenceLimitMs = 12 * 60_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); }
  finally { closeSync(descriptor); }
  renameSync(temporary, file);
}
function append(event, detail = {}) {
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  writeFileSync(journalPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`, { flag: "a" });
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function questionId(customerKey, question) {
  return createHash("sha256").update(`${customerKey}\n${question}`).digest("hex");
}
function collectOperatorQuestions(report) {
  const questions = [];
  for (const item of report?.cases ?? []) {
    if (item.state !== "operator_required" || !Number.isInteger(item.cohort)) continue;
    const cohortRoot = path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
    const preflight = readJson(path.join(cohortRoot, "crm-local-preflight/checkpoint.json"));
    const preflightItem = (preflight?.items ?? []).find((entry) => entry.customerKey === item.customerKey);
    const blockers = preflightItem?.report?.blockers ?? [];
    for (const blocker of blockers) {
      if (blocker?.code === "crm_practice_exact_match_not_found") continue;
      const operatorQuestion = typeof blocker?.operatorQuestion === "string" ? blocker.operatorQuestion.trim() : "";
      if (!operatorQuestion) continue;
      questions.push({
        id: questionId(item.customerKey, operatorQuestion),
        customerKey: item.customerKey,
        displayName: item.displayName,
        practiceId: item.practiceId,
        cohort: item.cohort,
        blockerCode: blocker.code ?? null,
        operatorQuestion,
        exactCause: blocker.exactCause ?? blocker.reason ?? item.reason ?? null,
        missingDocumentType: blocker.missingDocumentType ?? null,
        sourcePath: path.join(cohortRoot, "crm-local-preflight/checkpoint.json"),
      });
    }
  }
  return questions;
}
function collectLocalizationIssues(report) {
  const issues = [];
  for (const item of report?.cases ?? []) {
    if (item.state !== "operator_required" || !Number.isInteger(item.cohort)) continue;
    const cohortRoot = path.join(cohortsRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
    const preflight = readJson(path.join(cohortRoot, "crm-local-preflight/checkpoint.json"));
    const preflightItem = (preflight?.items ?? []).find((entry) => entry.customerKey === item.customerKey);
    for (const blocker of preflightItem?.report?.blockers ?? []) {
      if (blocker?.code !== "crm_practice_exact_match_not_found") continue;
      issues.push({
        customerKey: item.customerKey,
        displayName: item.displayName,
        practiceId: item.practiceId,
        cohort: item.cohort,
        classification: "localization_issue",
        exactCause: blocker.exactCause ?? blocker.reason ?? item.reason ?? null,
        expectedStage: null,
        locatedStage: null,
        sourcePath: path.join(cohortRoot, "crm-local-preflight/checkpoint.json"),
      });
    }
  }
  return issues;
}
function completeMilestoneMarkdown(report, operatorQuestions, localizationIssues) {
  const lines = [
    `# APR r111 — report completo ${report.processed}/${report.total}`,
    "",
    `Aggiornato: ${report.updatedAt}`,
    `Salvate: ${report.saved}`,
    `Intervento operatore: ${report.operatorRequired}`,
    `Blocchi tecnici: ${report.technicalBlock}`,
    `Incoerenti: ${report.inconsistent}`,
    "",
    "## Domande operatore vere",
    "",
    ...(operatorQuestions.length
      ? operatorQuestions.map((entry) => `- ${entry.displayName}: ${entry.operatorQuestion} — Evidenza: ${entry.exactCause ?? "non disponibile"}`)
      : ["Nessuna."]),
    "",
    "## Problemi di localizzazione CRM (non domande operatore)",
    "",
    ...(localizationIssues.length
      ? localizationIssues.map((entry) => `- ${entry.displayName}: ${entry.exactCause ?? "pratica non localizzata nella fase attesa"}`)
      : ["Nessuno."]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
function writeCompleteReport(stem, report) {
  const operatorQuestions = collectOperatorQuestions(report);
  const localizationIssues = collectLocalizationIssues(report);
  const complete = {
    ...report,
    version: "apr-sequential-independent-complete-milestone-v1",
    operatorQuestions,
    localizationIssues,
  };
  atomicWrite(path.join(milestonesDirectory, `${stem}.json`), complete);
  atomicWrite(path.join(milestonesDirectory, `${stem}.md`), completeMilestoneMarkdown(complete, operatorQuestions, localizationIssues));
}
function writeCompleteMilestones(report) {
  if (!report || report.processed <= 0) return;
  for (let processed = 10; processed <= report.processed; processed += 10) {
    const baseStem = `report-${String(processed).padStart(3, "0")}`;
    const base = readJson(path.join(milestonesDirectory, `${baseStem}.json`));
    if (base) writeCompleteReport(`${baseStem}-complete`, base);
  }
  if (report.status === "completed" && report.processed === expectedTotal) writeCompleteReport("report-final-complete", report);
}
async function notify(message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ntfyUrl, { method: "POST", body: message, signal: controller.signal });
    append("notification_completed", { message, delivered: response.ok, httpStatus: response.status });
    return response.ok;
  } catch (error) {
    append("notification_failed", { message, error: error instanceof Error ? error.message : String(error) });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const startedAtMs = Date.now();
let state = readJson(statePath) ?? {
  version: "apr-independent-progress-monitor-v1",
  startedAt: new Date().toISOString(),
  status: "waiting_for_controller",
  lastProcessed: 0,
  lastProgressAt: new Date().toISOString(),
  launchNotificationSent: false,
  stopAlertSent: false,
  silenceAlertForProcessed: null,
  finalNotificationSent: false,
  operatorQuestionNotifications: [],
};
if (!Array.isArray(state.operatorQuestionNotifications)) state.operatorQuestionNotifications = [];

for (;;) {
  const report = readJson(reportPath);
  const processed = Number(report?.processed ?? 0);
  const operatorQuestions = collectOperatorQuestions(report);
  const localizationIssues = collectLocalizationIssues(report);
  atomicWrite(liveQuestionsPath, {
    version: "apr-live-operator-questions-v1",
    updatedAt: new Date().toISOString(),
    total: operatorQuestions.length,
    questions: operatorQuestions,
  });
  atomicWrite(localizationIssuesPath, {
    version: "apr-live-localization-issues-v1",
    updatedAt: new Date().toISOString(),
    total: localizationIssues.length,
    issues: localizationIssues,
  });
  writeCompleteMilestones(report);
  for (const question of operatorQuestions) {
    if (state.operatorQuestionNotifications.some((entry) => entry.id === question.id)) continue;
    const notification = { id: question.id, customerKey: question.customerKey, operatorQuestion: question.operatorQuestion, intentAt: new Date().toISOString(), state: "intent_recorded" };
    state.operatorQuestionNotifications.push(notification);
    atomicWrite(statePath, state);
    const delivered = await notify(`Domanda operatore — ${question.displayName}: ${question.operatorQuestion}`);
    notification.state = delivered ? "delivered" : "failed_without_retry";
    notification.completedAt = new Date().toISOString();
    atomicWrite(statePath, state);
  }
  if (processed > state.lastProcessed) {
    state.lastProcessed = processed;
    state.lastProgressAt = new Date().toISOString();
    state.silenceAlertForProcessed = null;
    append("material_progress_observed", { processed, total: expectedTotal, currentCustomerKey: report?.currentCustomerKey ?? null });
  }

  if (report?.status === "completed" && processed === expectedTotal) {
    state.status = "completed";
    state.completedAt = new Date().toISOString();
    if (!state.finalNotificationSent) {
      state.finalNotificationSent = true;
      atomicWrite(statePath, state);
      await notify(`APR r111 concluso: ${processed}/${expectedTotal} — salvate ${report.saved}, operatore ${report.operatorRequired}, tecniche ${report.technicalBlock}, incoerenti ${report.inconsistent}.`);
    }
    atomicWrite(statePath, state);
    break;
  }

  let controllerPid = null;
  if (existsSync(controllerPidPath)) {
    const parsed = Number(readFileSync(controllerPidPath, "utf8").trim());
    if (Number.isInteger(parsed)) controllerPid = parsed;
  }
  const alive = pidAlive(controllerPid);
  if (alive) {
    state.status = "monitoring";
    state.controllerPid = controllerPid;
    if (!state.launchNotificationSent && report?.status === "running") {
      state.launchNotificationSent = true;
      atomicWrite(statePath, state);
      await notify(`APR r111 avviato: ${processed}/${expectedTotal}. Monitor indipendente attivo.`);
    }
  } else if (Date.now() - startedAtMs >= startupGraceMs) {
    state.status = "controller_stopped_before_completion";
    if (!state.stopAlertSent) {
      state.stopAlertSent = true;
      atomicWrite(statePath, state);
      await notify(`ATTENZIONE APR r111: controller terminato prima del completamento, stato ${processed}/${expectedTotal}.`);
    }
    atomicWrite(statePath, state);
    break;
  }

  const lastProgressMs = Date.parse(state.lastProgressAt);
  if (alive && Number.isFinite(lastProgressMs) && Date.now() - lastProgressMs >= silenceLimitMs && state.silenceAlertForProcessed !== processed) {
    state.silenceAlertForProcessed = processed;
    atomicWrite(statePath, state);
    await notify(`ATTENZIONE APR r111: nessun esito terminale nuovo da 12 minuti, fermo a ${processed}/${expectedTotal}; controller ancora attivo.`);
  }

  state.checkedAt = new Date().toISOString();
  state.processed = processed;
  state.currentCustomerKey = report?.currentCustomerKey ?? null;
  atomicWrite(statePath, state);
  await sleep(pollMs);
}
