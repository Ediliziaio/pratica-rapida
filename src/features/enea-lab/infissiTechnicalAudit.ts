import type { CompletedEneaInfissiSnapshot } from "./completedEneaInfissi";
import type { AprInfissiMappedTechnicalItem } from "./infissiTechnicalMapping";

export type AprInfissiTechnicalField =
  | "oldMaterial"
  | "oldGlass"
  | "oldTransmittance"
  | "surfaceM2"
  | "newMaterial"
  | "newGlass"
  | "newTransmittance"
  | "installation"
  | "hasDarkeningClosure";

export interface AprInfissiTechnicalFieldComparison {
  ordinal: number;
  field: AprInfissiTechnicalField;
  aprValue: string | number | boolean;
  completedEneaValue: string | number | boolean;
  status: "match" | "difference";
}

export interface AprInfissiTechnicalAuditResult {
  status: "match" | "difference" | "blocked";
  comparisons: AprInfissiTechnicalFieldComparison[];
  blockers: string[];
}

const NUMERIC_FIELDS = new Set<AprInfissiTechnicalField>([
  "oldTransmittance",
  "surfaceM2",
  "newTransmittance",
]);

function equalNumeric(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

/**
 * Confronto campo-per-campo fra output APR source-driven e PDF ENEA concluso.
 * Il PDF è usato soltanto come ground truth di verifica e non alimenta il mapper.
 */
export function auditInfissiTechnicalMappingAgainstCompleted(
  mapped: AprInfissiMappedTechnicalItem[],
  completed: CompletedEneaInfissiSnapshot,
): AprInfissiTechnicalAuditResult {
  const blockers: string[] = [];
  if (!mapped.length) blockers.push("apr-technical-items-missing");
  if (!completed.items.length) blockers.push("completed-enea-items-missing");
  if (mapped.length !== completed.items.length) blockers.push("technical-item-count-mismatch");

  if (blockers.length) return { status: "blocked", comparisons: [], blockers };

  const fields: AprInfissiTechnicalField[] = [
    "oldMaterial",
    "oldGlass",
    "oldTransmittance",
    "surfaceM2",
    "newMaterial",
    "newGlass",
    "newTransmittance",
    "installation",
    "hasDarkeningClosure",
  ];

  const comparisons: AprInfissiTechnicalFieldComparison[] = [];
  for (let index = 0; index < mapped.length; index += 1) {
    const aprItem = mapped[index];
    const eneaItem = completed.items[index];
    if (aprItem.ordinal !== eneaItem.ordinal) {
      blockers.push(`technical-item-ordinal-mismatch:${index + 1}`);
      continue;
    }

    for (const field of fields) {
      const aprValue = aprItem[field] as string | number | boolean;
      const completedEneaValue = eneaItem[field] as string | number | boolean;
      const match = NUMERIC_FIELDS.has(field)
        ? equalNumeric(Number(aprValue), Number(completedEneaValue))
        : aprValue === completedEneaValue;
      comparisons.push({
        ordinal: aprItem.ordinal,
        field,
        aprValue,
        completedEneaValue,
        status: match ? "match" : "difference",
      });
    }
  }

  if (blockers.length) return { status: "blocked", comparisons, blockers };
  return {
    status: comparisons.some((comparison) => comparison.status === "difference")
      ? "difference"
      : "match",
    comparisons,
    blockers: [],
  };
}
