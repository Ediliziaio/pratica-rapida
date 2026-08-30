export type AprCohortProcess = { pid: number; command: string };
export function loadedAprCohortServiceLabels(output: string): string[];
export function runningAprCohortProcesses(output: string): AprCohortProcess[];
export function quiescePreviousAprCohorts(input: {
  launchctlDomain: () => string;
  processList: () => string;
  allowedLabels?: string[];
  allowProcess?: (entry: AprCohortProcess) => boolean;
  bootout: (label: string) => void;
  terminate: (pid: number) => void;
  wait: (milliseconds: number) => Promise<void>;
}): Promise<{ stopped: true; labels: string[]; pids: number[] }>;
export function executeWithGuaranteedCohortQuiescence<T>(executeCase: () => Promise<T>, quiesce: () => Promise<void>): Promise<T>;
