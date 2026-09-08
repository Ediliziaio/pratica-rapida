export const SEQUENCER_OPERATOR_ISOLATION_RULE_IDS: readonly string[];
export const SEQUENCER_COMMON_FAILURE_CODES: readonly string[];
export function createVerifiedCommonTechnicalFailure(code: string, reason: string, evidence?: Record<string, unknown>): Error;
export function classifySequencerFailure(error: unknown): any;
export function executeSequencerCaseBulkhead<T>(input: { runCase: () => Promise<T>; isolateCase: (failure: any, error: unknown) => Promise<void> }): Promise<any>;
