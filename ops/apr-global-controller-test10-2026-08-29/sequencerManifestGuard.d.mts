export interface SequencerManifestCase { customerKey: string; stage: string; }
export function validateSequencerManifest(manifest: unknown, cases: SequencerManifestCase[]): {
  expectedCount: number;
  excludedCustomerKeys: string[];
  allowedStages: string[];
};
