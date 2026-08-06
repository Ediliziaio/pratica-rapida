import type { ImpiantoTipo, ProdottoTipo } from "@/types/form-cliente";

export const ENEA_INTERVENTION_SCOPE = {
  unitInMultiUnitBuilding: "Singola unità immobiliare (in un edificio costituito da più unità immobiliari)",
  singleUnitBuilding: "Edificio costituito da una singola unità immobiliare",
  wholeBuilding: "Intero edificio (qualsiasi altro tipo di edificio non incluso nei casi sopra riportati)",
} as const;

export const ENEA_INTERVENTION_TYPE = {
  envelope: "Comma 345A - Interventi sull'involucro",
  screening: "Comma 345B - Schermature solari",
  heatPump: "Comma 347A - Sostituzione di impianto di climatizzazione",
} as const;

export function interventionScopeFromUnitCount(value: string): string {
  const count = Number(value.trim());
  if (!Number.isInteger(count) || count < 1) return "";
  return count === 1
    ? ENEA_INTERVENTION_SCOPE.singleUnitBuilding
    : ENEA_INTERVENTION_SCOPE.unitInMultiUnitBuilding;
}

export function interventionTypeFromProduct(product: ProdottoTipo): string {
  if (product === "schermature") return ENEA_INTERVENTION_TYPE.screening;
  if (product === "impianto_termico") return ENEA_INTERVENTION_TYPE.heatPump;
  return ENEA_INTERVENTION_TYPE.envelope;
}

export function centralizedPlantFromType(type: ImpiantoTipo | ""): string {
  if (type === "autonomo") return "No";
  if (type === "centralizzato" || type === "centralizzato_con_termostato") return "Sì";
  return "";
}
