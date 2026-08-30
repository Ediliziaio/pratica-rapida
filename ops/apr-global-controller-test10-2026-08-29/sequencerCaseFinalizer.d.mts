export type AprCaseObservation = { entry: Record<string, any> | null; verified: boolean };
export function classifyQuiescentCaseTruth(observation: AprCaseObservation): { kind: "saved" | "case_block" | "unresolved"; entry: Record<string, any> };
export function settleCaseTruthAfterWorkerQuiescence(input: {
  stopWorkerServices: () => Promise<void>;
  workerServicesActive: () => boolean;
  readObservation: () => AprCaseObservation;
  wait: (milliseconds: number) => Promise<void>;
  quiescenceTimeoutMs?: number;
  stabilityIntervalMs?: number;
}): Promise<{ kind: "saved" | "case_block" | "unresolved"; entry: Record<string, any> }>;
