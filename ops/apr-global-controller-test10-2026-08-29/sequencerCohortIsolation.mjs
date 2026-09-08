import { APR_COHORT_SERVICE_LABEL, protectedCohortBootout, protectedCohortTerminate } from "../../scripts/enea-shadow-runner/aprChromeKeepaliveProtection.mjs";

export { APR_COHORT_SERVICE_LABEL };

export function loadedAprCohortServiceLabels(launchctlDomainOutput) {
  const labels = new Set();
  for (const line of String(launchctlDomainOutput).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:\d+|-)\s+(?:\d+|-)\s+(com\.praticarapida\.apr-enea-cohort\d+-(?:supervisor|worker|watchdog))\s*$/);
    if (match) labels.add(match[1]);
  }
  return [...labels].sort();
}

export function runningAprCohortProcesses(psOutput) {
  return String(psOutput).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) return [];
    const command = match[2];
    if (!/apr-pilot-\d+-/.test(command)) return [];
    if (!/(?:apr-supervisor\.mjs|apr-enea-worker\.mjs|apr-watchdog\.mjs|apr-cohort-launchagent-supervisor)/.test(command)) return [];
    return [{ pid: Number(match[1]), command }];
  });
}

export async function quiescePreviousAprCohorts(input) {
  const allowedLabels = new Set(input.allowedLabels ?? []);
  const allowProcess = input.allowProcess ?? (() => false);
  const remaining = () => ({
    labels: loadedAprCohortServiceLabels(input.launchctlDomain()).filter((label) => !allowedLabels.has(label)),
    processes: runningAprCohortProcesses(input.processList()).filter((entry) => !allowProcess(entry)),
  });

  let observed = remaining();
  for (const label of observed.labels) protectedCohortBootout(label, input.bootout);
  if (observed.labels.length || observed.processes.length) await input.wait(500);

  observed = remaining();
  for (const label of observed.labels) protectedCohortBootout(label, input.bootout);
  for (const process of observed.processes) protectedCohortTerminate(process, input.terminate);
  if (observed.labels.length || observed.processes.length) await input.wait(1_000);

  observed = remaining();
  if (observed.labels.length || observed.processes.length) {
    throw new Error(`apr_previous_cohort_services_still_active:${JSON.stringify({ labels: observed.labels, pids: observed.processes.map((entry) => entry.pid) })}`);
  }
  return { stopped: true, labels: [], pids: [] };
}

export async function executeWithGuaranteedCohortQuiescence(executeCase, quiesce) {
  try { return await executeCase(); }
  finally { await quiesce(); }
}
