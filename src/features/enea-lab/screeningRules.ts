import type { SchermaturaTipo } from "@/types/form-cliente";

export const ENEA_SCREENING_TYPE = {
  awning: "Tenda o veneziana",
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
  gTot: number;
  gTotFromDocument: boolean;
  calculation: string;
  material: string;
  regulation: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it");
}

function isZanzariera(description: string): boolean {
  return /zanzarier/.test(normalize(description));
}

function isShutter(description: string): boolean {
  return /tapparell|avvolgibil/.test(normalize(description));
}

export function screeningRules(
  declaredType: SchermaturaTipo | "",
  description: string,
  documentedGTot: number | null | undefined,
): EneaScreeningRuleResult {
  const normalized = normalize(description);
  const zanzariera = isZanzariera(description);
  const shutter = isShutter(description);
  const pergotenda = declaredType === "pergotenda" || /pergotend/.test(normalized);
  const pergola = declaredType === "pergola" || /pergola/.test(normalized);
  const awning = declaredType === "tende_da_sole"
    || /tenda da sole|tende da sole|tenda a bracci/.test(normalized);
  const validDocumentedGTot = documentedGTot !== null
    && documentedGTot !== undefined
    && documentedGTot > 0
    && documentedGTot <= 0.35;

  let material = "";
  if (zanzariera) material = ENEA_SCREENING_MATERIAL.mixed;
  else if (/\bpvc\b/.test(normalized)) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (/allumini|metall/.test(normalized)) material = ENEA_SCREENING_MATERIAL.metal;
  else if (pergotenda) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (pergola) material = ENEA_SCREENING_MATERIAL.metal;
  else if (awning) material = ENEA_SCREENING_MATERIAL.fabric;

  const explicitlyMotorized = /motoriz|motore|automatic/.test(normalized);
  const regulation = explicitlyMotorized
    ? ENEA_SCREENING_REGULATION.automatic
    : zanzariera
      ? ENEA_SCREENING_REGULATION.manual
      : pergotenda || pergola
        ? ENEA_SCREENING_REGULATION.automatic
        : awning || shutter
          ? ENEA_SCREENING_REGULATION.manual
          : "";

  return {
    type: awning && !zanzariera && !shutter && !pergotenda && !pergola
      ? ENEA_SCREENING_TYPE.awning
      : declaredType || zanzariera || shutter || pergotenda || pergola
        ? ENEA_SCREENING_TYPE.otherSolarScreening
        : "",
    installation: declaredType || description.trim()
      ? ENEA_SCREENING_INSTALLATION.external
      : "",
    gTot: validDocumentedGTot ? documentedGTot : zanzariera ? 0.33 : 0.06,
    gTotFromDocument: validDocumentedGTot,
    calculation: declaredType || description.trim()
      ? ENEA_SCREENING_CALCULATION.supplierDeclared
      : "",
    material,
    regulation,
  };
}
