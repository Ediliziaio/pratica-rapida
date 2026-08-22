import type { AprInfissiMappedTechnicalItem } from "./infissiTechnicalMapping";

export type EneaClimateZone = "A" | "B" | "C" | "D" | "E" | "F";

export const INFISSI_UW_LIMITS: Readonly<Record<EneaClimateZone, number>> = {
  A: 2.60,
  B: 2.60,
  C: 1.75,
  D: 1.67,
  E: 1.30,
  F: 1.00,
};

export interface AprInfissiTransmittanceCheck {
  ordinal: number;
  limit: number;
  oldTransmittance: number;
  newTransmittance: number;
  oldAboveLimit: boolean;
  newWithinLimit: boolean;
}

export interface AprInfissiTransmittanceGateResult {
  status: "pass" | "blocked";
  checks: AprInfissiTransmittanceCheck[];
  blockers: string[];
}

/**
 * Verifica i requisiti di trasmittanza del D.M. 6/8/2020 Allegato E, tabella 1:
 * U iniziale > limite e U finale <= limite. La zona climatica deve essere
 * osservata/fornita esplicitamente; questa funzione non la deduce dall'indirizzo.
 */
export function validateAprInfissiTransmittance(
  climateZone: EneaClimateZone | null | undefined,
  items: AprInfissiMappedTechnicalItem[],
): AprInfissiTransmittanceGateResult {
  if (!climateZone || !(climateZone in INFISSI_UW_LIMITS)) {
    return { status: "blocked", checks: [], blockers: ["climate-zone-unobserved"] };
  }
  if (!items.length) return { status: "blocked", checks: [], blockers: ["technical-items-missing"] };

  const limit = INFISSI_UW_LIMITS[climateZone];
  const checks = items.map((item) => ({
    ordinal: item.ordinal,
    limit,
    oldTransmittance: item.oldTransmittance,
    newTransmittance: item.newTransmittance,
    oldAboveLimit: item.oldTransmittance > limit,
    newWithinLimit: item.newTransmittance <= limit,
  }));
  const blockers = checks.flatMap((check) => [
    ...(!check.oldAboveLimit ? [`old-transmittance-not-above-limit:${check.ordinal}`] : []),
    ...(!check.newWithinLimit ? [`new-transmittance-above-limit:${check.ordinal}`] : []),
  ]);

  return { status: blockers.length ? "blocked" : "pass", checks, blockers };
}
