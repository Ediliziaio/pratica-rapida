export const APR_CHROME_KEEPALIVE_PROTECTION_RULE_ID: "system-apr-chrome-keepalive-immortal-v1";
export const APR_COHORT_SERVICE_LABEL: RegExp;
export function isAprEneaChromeKeepaliveProcess(command: unknown): boolean;
export function assertAprCohortServiceMayStop(label: unknown): void;
export function classifyStoppableAprCohortProcess(pid: number, command: unknown): { pid: number; command: string; role: string };
export function protectedCohortBootout<T>(label: string, bootout: (label: string) => T): T;
export function protectedCohortTerminate<T>(entry: { pid: number; command: string }, terminate: (pid: number, command: string) => T): T;
