import type {
  Combustibile,
  ImpiantoTipo,
  Terminali,
} from "@/types/form-cliente";

export const ENEA_PLANT_DISTRIBUTION =
  "c. edifici a colonne montanti isolate secondo normativa e ubicate all'interno delle pareti";

export const ENEA_PLANT_REGULATION = "c. regolazione ad ambiente o a zona";

export const ENEA_PLANT_TYPE = {
  autonomo: "a. impianto autonomo",
  centralizzato: "b. impianto centralizzato",
  centralizzatoConContabilizzazione:
    "c. impianto centralizzato con contabilizzazione di calore per singolo utente",
} as const;

export const ENEA_PLANT_TERMINAL = {
  radiators: "d. radiatori",
  embeddedRadiantPanels: "f. pannelli radianti annegati nella struttura",
  other: "g. altro",
} as const;

export const ENEA_ENERGY_CARRIER = {
  naturalGas: "a. gas metano",
  diesel: "b. gasolio",
  lpg: "c. gpl",
  districtHeating: "d. teleriscaldamento",
  electricity: "f. energia elettrica",
} as const;

export function plantTypeFromForm(value: ImpiantoTipo | ""): string {
  if (value === "autonomo") return ENEA_PLANT_TYPE.autonomo;
  if (value === "centralizzato") return ENEA_PLANT_TYPE.centralizzato;
  if (value === "centralizzato_con_termostato") {
    return ENEA_PLANT_TYPE.centralizzatoConContabilizzazione;
  }
  return "";
}

export function plantTerminalFromForm(value: Terminali | ""): string {
  if (value === "caloriferi") return ENEA_PLANT_TERMINAL.radiators;
  if (value === "riscaldamento_pavimento") return ENEA_PLANT_TERMINAL.embeddedRadiantPanels;
  if (value === "split") return ENEA_PLANT_TERMINAL.other;
  return "";
}

export function energyCarrierFromForm(value: Combustibile | ""): string {
  if (value === "gas_metano") return ENEA_ENERGY_CARRIER.naturalGas;
  if (value === "gasolio") return ENEA_ENERGY_CARRIER.diesel;
  if (value === "gpl") return ENEA_ENERGY_CARRIER.lpg;
  if (value === "teleriscaldamento") return ENEA_ENERGY_CARRIER.districtHeating;
  if (value === "energia_elettrica") return ENEA_ENERGY_CARRIER.electricity;
  return "";
}
