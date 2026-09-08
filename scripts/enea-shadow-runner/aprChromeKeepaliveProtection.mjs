export const APR_CHROME_KEEPALIVE_PROTECTION_RULE_ID = "system-apr-chrome-keepalive-immortal-v1";

export const APR_COHORT_SERVICE_LABEL = /^com\.praticarapida\.apr-enea-cohort\d+-(?:supervisor|worker|watchdog)$/;

const APR_COHORT_PROCESS = /(?:apr-supervisor\.mjs|apr-enea-worker\.mjs|apr-watchdog\.mjs|apr-cohort-launchagent-supervisor)/;
const APR_COHORT_ROOT = /apr-pilot-\d+-/;
const CHROME_PROCESS = /(?:Google Chrome|Chromium|chrome)(?:\s|$)/i;
const CDP_PROFILE_OR_PORT = /--(?:user-data-dir|remote-debugging-port)=/;

export function isAprEneaChromeKeepaliveProcess(command) {
  const value = String(command ?? "");
  return CHROME_PROCESS.test(value) && CDP_PROFILE_OR_PORT.test(value);
}

export function assertAprCohortServiceMayStop(label) {
  if (!APR_COHORT_SERVICE_LABEL.test(String(label ?? ""))) {
    throw new Error(`apr_chrome_keepalive_protection_refused_service_stop:${String(label ?? "unknown")}`);
  }
}

export function classifyStoppableAprCohortProcess(pid, command) {
  const value = String(command ?? "");
  if (!Number.isInteger(pid) || pid <= 1) throw new Error("apr_chrome_keepalive_protection_invalid_pid");
  if (isAprEneaChromeKeepaliveProcess(value)) {
    throw new Error(`apr_chrome_keepalive_process_is_immortal:${pid}`);
  }
  if (!APR_COHORT_ROOT.test(value) || !APR_COHORT_PROCESS.test(value)) {
    throw new Error(`apr_chrome_keepalive_protection_refused_process_stop:${pid}`);
  }
  return { pid, command: value, role: value.match(APR_COHORT_PROCESS)?.[0] ?? "unknown" };
}

export function protectedCohortBootout(label, bootout) {
  assertAprCohortServiceMayStop(label);
  return bootout(label);
}

export function protectedCohortTerminate(entry, terminate) {
  const target = classifyStoppableAprCohortProcess(entry?.pid, entry?.command);
  return terminate(target.pid, target.command);
}
