import type { AprInfissiIntakeFields } from "./infissiIntake";

export interface AprInfissiTechnicalEvidenceItem {
  sourcePath: string;
  oldMaterial: string;
  oldGlass: string;
  oldTransmittance: number | null;
  surfaceM2: number | null;
  newMaterial: string;
  newGlass: string;
  newTransmittance: number | null;
  installation: "verso_esterno" | "unknown";
  hasDarkeningClosure: boolean | null;
}

export interface AprInfissiMappedTechnicalItem {
  ordinal: number;
  sourcePath: string;
  oldMaterial: string;
  oldGlass: string;
  oldTransmittance: number;
  surfaceM2: number;
  newMaterial: string;
  newGlass: string;
  newTransmittance: number;
  installation: "verso_esterno";
  hasDarkeningClosure: boolean;
}

export type AprInfissiTechnicalMappingBlocker =
  | "technical-evidence-missing"
  | "technical-source-path-missing"
  | "technical-material-missing"
  | "technical-glass-missing"
  | "technical-numeric-value-missing"
  | "technical-installation-unobserved"
  | "technical-darkening-closure-unobserved"
  | "intake-aggregate-conflict";

export interface AprInfissiTechnicalMappingResult {
  status: "ready" | "blocked";
  items: AprInfissiMappedTechnicalItem[];
  blockers: AprInfissiTechnicalMappingBlocker[];
}

const MATERIALS = new Set(["legno", "pvc", "metallo"]);
const GLASSES = new Set(["singolo", "doppio", "triplo"]);

function positive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Mapper tecnico infissi deliberatamente source-driven.
 *
 * Non deduce trasmittanze o superfici dal tipo di vetro/materiale e non usa il
 * PDF ENEA concluso come sorgente operativa. Accetta soltanto evidenze tecniche
 * già estratte da documenti reali; il PDF concluso resta esclusivamente ground
 * truth per l'audit retrospettivo.
 */
export function mapInfissiTechnicalEvidence(
  intake: AprInfissiIntakeFields,
  evidence: AprInfissiTechnicalEvidenceItem[],
): AprInfissiTechnicalMappingResult {
  const blockers: AprInfissiTechnicalMappingBlocker[] = [];
  if (!evidence.length) blockers.push("technical-evidence-missing");
  if (evidence.some((item) => !item.sourcePath.trim())) blockers.push("technical-source-path-missing");
  if (evidence.some((item) => !MATERIALS.has(item.oldMaterial) || !MATERIALS.has(item.newMaterial))) {
    blockers.push("technical-material-missing");
  }
  if (evidence.some((item) => !GLASSES.has(item.oldGlass) || !GLASSES.has(item.newGlass))) {
    blockers.push("technical-glass-missing");
  }
  if (evidence.some((item) => (
    !positive(item.oldTransmittance)
    || !positive(item.surfaceM2)
    || !positive(item.newTransmittance)
  ))) blockers.push("technical-numeric-value-missing");
  if (evidence.some((item) => item.installation !== "verso_esterno")) {
    blockers.push("technical-installation-unobserved");
  }
  if (evidence.some((item) => item.hasDarkeningClosure === null)) {
    blockers.push("technical-darkening-closure-unobserved");
  }

  const aggregateMatches = (
    field: "oldMaterial" | "oldGlass" | "newMaterial" | "newGlass" | "hasAccessories",
    values: Array<string | boolean | null>,
  ) => {
    const intakeValue = intake[field];
    if (intakeValue === "" || intakeValue === null) return true;
    const present = values.filter((value): value is string | boolean => value !== null);
    const unique = [...new Set(present)];
    // Il CRM è aggregato: se i documenti mostrano più valori, non lo trattiamo
    // come conflitto. Blocchiamo soltanto quando il corpus è uniforme e diverso.
    return unique.length !== 1 || unique[0] === intakeValue;
  };

  if (
    !aggregateMatches("oldMaterial", evidence.map((item) => item.oldMaterial))
    || !aggregateMatches("oldGlass", evidence.map((item) => item.oldGlass))
    || !aggregateMatches("newMaterial", evidence.map((item) => item.newMaterial))
    || !aggregateMatches("newGlass", evidence.map((item) => item.newGlass))
    || !aggregateMatches("hasAccessories", evidence.map((item) => item.hasDarkeningClosure))
  ) blockers.push("intake-aggregate-conflict");

  if (blockers.length) return { status: "blocked", items: [], blockers };

  return {
    status: "ready",
    blockers: [],
    items: evidence.map((item, index) => ({
      ordinal: index + 1,
      sourcePath: item.sourcePath,
      oldMaterial: item.oldMaterial,
      oldGlass: item.oldGlass,
      oldTransmittance: item.oldTransmittance!,
      surfaceM2: item.surfaceM2!,
      newMaterial: item.newMaterial,
      newGlass: item.newGlass,
      newTransmittance: item.newTransmittance!,
      installation: "verso_esterno",
      hasDarkeningClosure: item.hasDarkeningClosure!,
    })),
  };
}
