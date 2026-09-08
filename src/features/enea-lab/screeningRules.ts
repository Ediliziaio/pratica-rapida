import type { SchermaturaTipo } from "@/types/form-cliente";
import { resolveScreeningMechanism } from "@/features/enea-shadow-crm/operationalRules";
import { classifyScreeningProduct, resolveScreeningGTot } from "@/features/enea-shadow-crm/productClassifier";

export const ENEA_SCREENING_TYPE = {
  awning: "Tenda o veneziana",
  persiana: "Persiana",
  rollerShutter: "Persiane avvolgibili",
  otherSolarScreening: "Altra schermatura solare",
} as const;

export const ENEA_SCREENING_INSTALLATION = {
  external: "Esterna",
} as const;

export const ENEA_SCREENING_CALCULATION = {
  supplierDeclared: "Dichiarato dal fornitore",
} as const;

export const ENEA_SCREENING_MATERIAL = {
  fabric: "Tessuto",
  pvc: "PVC",
  metal: "Metallo",
  mixed: "Misto",
} as const;

export const ENEA_SCREENING_REGULATION = {
  manual: "Manuale",
  automatic: "Automatico",
} as const;

export interface EneaScreeningRuleResult {
  type: string;
  installation: string;
  gTot: number | null;
  gTotFromDocument: boolean;
  gTotResolutionStatus: "resolved" | "operator_required";
  gTotRuleId: string;
  calculation: string;
  material: string;
  regulation: string;
  regulationConflict: boolean;
  supplementaryThermalResistance: number | null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it");
}

export function screeningRules(
  declaredType: SchermaturaTipo | "",
  description: string,
  documentedGTot: number | null | undefined,
): EneaScreeningRuleResult {
  const normalized = normalize(description);
  const classification = classifyScreeningProduct(description, declaredType);
  const zanzariera = classification.family === "zanzariera";
  const shutter = classification.family === "tapparella" || classification.family === "avvolgibile";
  const persiana = classification.family === "persiana";
  const pergotenda = declaredType === "pergotenda" || /pergotend/.test(normalized);
  const pergola = declaredType === "pergola" || /pergola/.test(normalized);
  const awning = declaredType === "tende_da_sole"
    || /tenda da sole|tende da sole|tenda a bracci/.test(normalized);
  const validDocumentedGTot = documentedGTot !== null
    && documentedGTot !== undefined
    && documentedGTot > 0
    && documentedGTot <= 0.35;
  const gTotResolution = resolveScreeningGTot(description, declaredType, documentedGTot);

  let material = "";
  if (persiana || shutter) material = ENEA_SCREENING_MATERIAL.metal;
  else if (zanzariera) material = ENEA_SCREENING_MATERIAL.mixed;
  else if (pergotenda) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (pergola) material = ENEA_SCREENING_MATERIAL.metal;
  else if (/\bpvc\b/.test(normalized)) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (/allumini|metall/.test(normalized)) material = ENEA_SCREENING_MATERIAL.metal;
  else if (awning) material = ENEA_SCREENING_MATERIAL.fabric;

  const describedMechanism = resolveScreeningMechanism(description);
  const explicitlyMotorized = describedMechanism.value === "automatico";
  const regulation = describedMechanism.value === "manuale"
    ? ENEA_SCREENING_REGULATION.manual
    : explicitlyMotorized
      ? ENEA_SCREENING_REGULATION.automatic
      : zanzariera
        ? ENEA_SCREENING_REGULATION.manual
      : pergotenda || pergola
        ? ENEA_SCREENING_REGULATION.automatic
      : awning || shutter || persiana
        ? ENEA_SCREENING_REGULATION.manual
        : "";

  return {
    type: persiana
      ? ENEA_SCREENING_TYPE.persiana
      : shutter
        ? ENEA_SCREENING_TYPE.rollerShutter
      : awning && !zanzariera && !shutter && !pergotenda && !pergola
      ? ENEA_SCREENING_TYPE.awning
      : declaredType || zanzariera || shutter || pergotenda || pergola
        ? ENEA_SCREENING_TYPE.otherSolarScreening
        : "",
    installation: declaredType || description.trim()
      ? ENEA_SCREENING_INSTALLATION.external
      : "",
    gTot: gTotResolution.value,
    gTotFromDocument: validDocumentedGTot,
    gTotResolutionStatus: gTotResolution.source === "operator_required" ? "operator_required" : "resolved",
    gTotRuleId: gTotResolution.ruleId,
    calculation: declaredType || description.trim()
      ? ENEA_SCREENING_CALCULATION.supplierDeclared
      : "",
    material,
    regulation,
    regulationConflict: describedMechanism.conflict,
    supplementaryThermalResistance: persiana || shutter ? 0.17 : null,
  };
}
