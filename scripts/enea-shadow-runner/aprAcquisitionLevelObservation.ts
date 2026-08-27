export const APR_L1_ACQUISITION_OBSERVATION_VERSION = "apr-l1-acquisition-observation-v1" as const;

export interface AprL1AcquisitionObservation {
  schemaVersion: typeof APR_L1_ACQUISITION_OBSERVATION_VERSION;
  customerKey: string;
  practiceId: string;
  artifactId: string;
  status: "completed" | "blocked";
  blockerCodes: readonly string[];
}

export function verifyL1AcquisitionObservation(observation: AprL1AcquisitionObservation) {
  return observation.schemaVersion === APR_L1_ACQUISITION_OBSERVATION_VERSION
    && Boolean(observation.customerKey.trim())
    && Boolean(observation.practiceId.trim())
    && Boolean(observation.artifactId.trim())
    && (observation.status === "completed" || observation.blockerCodes.length > 0)
    && new Set(observation.blockerCodes).size === observation.blockerCodes.length
    && observation.blockerCodes.every((code) => Boolean(code.trim()));
}
