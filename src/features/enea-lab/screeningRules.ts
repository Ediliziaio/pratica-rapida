import type { SchermaturaTipo } from "@/types/form-cliente";

export const ENEA_SCREENING_TYPE = {
  shutter: "Persiana",
  rollerShutter: "Persiana avvolgibile",
  awning: "Tenda o veneziana",
  integrated: "Schermatura integrata (veneziana nella vetrocamera)",
  otherSolarScreening: "Altra schermatura solare",
  otherDarkeningClosure: "Altra chiusura oscurante",
} as const;

export const ENEA_SCREENING_INSTALLATION = {
  internal: "Interna",
  external: "Esterna",
} as const;

export const ENEA_SCREENING_CALCULATION = {
  supplierDeclared: "Dichiarato dal fornitore",
  closureTable: "Dalla tabella del programma Chiusure oscuranti(*)",
  uniEn13125: "Calcolato secondo UNI EN 13125",
} as const;

export const ENEA_SCREENING_MATERIAL = {
  fabric: "Tessuto",
  wood: "Legno",
  plastic: "Plastica",
  pvc: "PVC",
  metal: "Metallo",
  mixed: "Misto",
  other: "Altro",
} as const;

export const ENEA_SCREENING_REGULATION = {
  manual: "Manuale",
  automatic: "Automatico",
  servoAssisted: "Servoassistito",
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

function isPersiana(description: string): boolean {
  return /\bpersian[ae]\b/.test(normalize(description));
}

function isVenetianBlind(description: string): boolean {
  return /\bvenezian[ae]\b/.test(normalize(description));
}

export function screeningRules(
  declaredType: SchermaturaTipo | "",
  description: string,
  documentedGTot: number | null | undefined,
): EneaScreeningRuleResult {
  const normalized = normalize(description);
  const zanzariera = isZanzariera(description);
  const shutter = isShutter(description);
  const persiana = isPersiana(description);
  const darkeningClosure = shutter || persiana;
  const venetianBlind = isVenetianBlind(description);
  const integrated = /vetrocamera/.test(normalized) && (venetianBlind || /integrat/.test(normalized));
  const pergotenda = declaredType === "pergotenda" || /pergotend/.test(normalized);
  const pergola = declaredType === "pergola" || /pergola/.test(normalized);
  const awning = declaredType === "tende_da_sole"
    || /tenda da sole|tende da sole|tenda a bracci/.test(normalized)
    || (venetianBlind && !integrated);
  const explicitlyInternal = /\bintern[aoei]\b/.test(normalized);
  const explicitlyExternal = /\bestern[aoei]\b/.test(normalized);
  const installationConflict = explicitlyInternal && explicitlyExternal;
  const validDocumentedGTot = documentedGTot !== null
    && documentedGTot !== undefined
    && documentedGTot > 0
    && documentedGTot <= 0.35;

  const explicitlyWood = /\blegn[oa]\b/.test(normalized);
  const explicitlyPlastic = /\bplastic[ao]\b/.test(normalized);
  const explicitlyPvc = /\bpvc\b/.test(normalized);
  const explicitlyMetal = /allumini|metall/.test(normalized);
  const explicitMaterialCount = [explicitlyWood, explicitlyPlastic, explicitlyPvc, explicitlyMetal]
    .filter(Boolean).length;

  let material = "";
  if (zanzariera) material = ENEA_SCREENING_MATERIAL.mixed;
  else if (explicitMaterialCount > 1) material = "";
  else if (explicitlyWood) material = ENEA_SCREENING_MATERIAL.wood;
  else if (explicitlyPlastic) material = ENEA_SCREENING_MATERIAL.plastic;
  else if (explicitlyPvc) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (explicitlyMetal) material = ENEA_SCREENING_MATERIAL.metal;
  else if (pergotenda) material = ENEA_SCREENING_MATERIAL.pvc;
  else if (pergola) material = ENEA_SCREENING_MATERIAL.metal;
  else if (awning && !integrated) material = ENEA_SCREENING_MATERIAL.fabric;

  // Le indicazioni esplicite del documento prevalgono sui fallback per tipologia.
  // In particolare "senza motore" non deve essere intercettato dalla sola parola
  // "motore" e trasformato erroneamente in Automatico. Se il documento contiene
  // indicazioni incompatibili tra loro, il laboratorio non sceglie arbitrariamente:
  // lascia il campo vuoto e impone la riconciliazione prima del workflow ufficiale.
  const explicitlyNonMotorized = /non\s+motorizz|senza\s+(?:motore|motorizzazione)/.test(normalized);
  const explicitlyManual = /\bmanual(?:e|i)?\b/.test(normalized) || explicitlyNonMotorized;
  const explicitlyServoAssisted = /servo[\s-]*assistit/.test(normalized);
  const explicitlyMotorized = !explicitlyNonMotorized
    && /motorizz|(?:^|\W)motore(?:\W|$)|automatic/.test(normalized);
  const explicitRegulationCount = [explicitlyManual, explicitlyServoAssisted, explicitlyMotorized]
    .filter(Boolean).length;
  const regulation = explicitRegulationCount > 1
    ? ""
    : explicitlyManual
      ? ENEA_SCREENING_REGULATION.manual
      : explicitlyServoAssisted
        ? ENEA_SCREENING_REGULATION.servoAssisted
        : explicitlyMotorized
          ? ENEA_SCREENING_REGULATION.automatic
          : zanzariera
            ? ENEA_SCREENING_REGULATION.manual
            : pergotenda || pergola
              ? ENEA_SCREENING_REGULATION.automatic
              : (awning && !integrated) || shutter
                ? ENEA_SCREENING_REGULATION.manual
                : "";

  return {
    type: integrated
      ? ENEA_SCREENING_TYPE.integrated
      : shutter
        ? ENEA_SCREENING_TYPE.rollerShutter
        : persiana
          ? ENEA_SCREENING_TYPE.shutter
          : awning && !zanzariera && !pergotenda && !pergola
            ? ENEA_SCREENING_TYPE.awning
            : declaredType || zanzariera || pergotenda || pergola
              ? ENEA_SCREENING_TYPE.otherSolarScreening
              : "",
    installation: installationConflict
      ? ""
      : explicitlyInternal
        ? ENEA_SCREENING_INSTALLATION.internal
        : explicitlyExternal
          ? ENEA_SCREENING_INSTALLATION.external
          : integrated || venetianBlind
            ? ""
            : declaredType || description.trim()
              ? ENEA_SCREENING_INSTALLATION.external
              : "",
    gTot: darkeningClosure
      ? 0
      : validDocumentedGTot
        ? documentedGTot
        : integrated
          ? 0
          : zanzariera
            ? 0.33
            : 0.06,
    gTotFromDocument: !darkeningClosure && validDocumentedGTot,
    calculation: darkeningClosure
      ? ""
      : validDocumentedGTot
        ? ENEA_SCREENING_CALCULATION.supplierDeclared
        : integrated
          ? ""
          : declaredType || description.trim()
            ? ENEA_SCREENING_CALCULATION.supplierDeclared
            : "",
    material,
    regulation,
  };
}