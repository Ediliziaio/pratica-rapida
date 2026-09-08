export type AprCaseObservation = { entry: Record<string, any> | null; verified: boolean };
export function classifyQuiescentCaseTruth(observation: AprCaseObservation): { kind: "saved" | "case_block" | "unresolved"; entry: Record<string, any> };
export function settleCaseTruthAfterWorkerQuiescence(input: {
  stopWorkerServices: () => Promise<void>;
  workerServicesActive: () => boolean;
  readObservation: () => AprCaseObservation;
  wait: (milliseconds: number) => Promise<void>;
  quiescenceTimeoutMs?: number;
  publishTerminalTruth?: (truth: { kind: string; entry: any; verified: boolean }) => void | Promise<void>;
  stabilityIntervalMs?: number;
}): Promise<{ kind: "saved" | "case_block" | "unresolved"; entry: Record<string, any> }>;
export function settleCaseTruthWhileWorkerContinues(input: {
  readObservation: () => AprCaseObservation;
  wait: (milliseconds: number) => Promise<void>;
  onUnresolved?: (truth: { kind: "unresolved"; entry: Record<string, any> }) => void | Promise<void>;
  publishTerminalTruth?: (truth: { kind: string; entry: any; verified: boolean }) => void | Promise<void>;
  stabilityIntervalMs?: number;
}): Promise<{ kind: "saved" | "case_block"; entry: Record<string, any> }>;
