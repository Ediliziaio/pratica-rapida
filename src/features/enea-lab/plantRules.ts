import type {
  Combustibile,
  ImpiantoTipo,
  Terminali,
} from "@/types/form-cliente";

export const ENEA_PLANT_DISTRIBUTIONS = {
  internalColumns: "a. edifici a colonne montanti situate totalmente all'interno degli ambienti riscaldati",
  uninsulatedColumnsInWalls: "b. edifici a colonne montanti, non isolate termicamente, inserite all'interno delle pareti",
  insulatedColumnsInWalls:
    "c. edifici a colonne montanti isolate secondo normativa e ubicate all'interno delle pareti",
  horizontalOrRing: "d. edifici con distribuzione orizzontale o ad anello",
} as const;

export const ENEA_PLANT_DISTRIBUTION = ENEA_PLANT_DISTRIBUTIONS.insulatedColumnsInWalls;

export const ENEA_PLANT_REGULATIONS = {
  centralized: "a. regolazione centralizzata",
  terminal: "b. regolazione su terminale di erogazione",
  roomOrZone: "c. regolazione ad ambiente o a zona",
} as const;

export const ENEA_PLANT_REGULATION = ENEA_PLANT_REGULATIONS.roomOrZone;

export const ENEA_PLANT_TYPE = {
  autonomo: "a. impianto autonomo",
  centralizzato: "b. impianto centralizzato",
  centralizzatoConContabilizzazione:
    "c. impianto centralizzato con contabilizzazione di calore per singolo utente",
  centralizzatoPiuGeneratori:
    "d. impianto centralizzato con più generatori di calore",
  centralizzatoPiuGeneratoriConContabilizzazione:
    "e. impianto centralizzato con più generatori di calore e contabilizzazione del calore per singolo utente",
} as const;

export const ENEA_PLANT_TERMINAL = {
  thermoconvectors: "a. termoconvettori",
  fanCoils: "b. ventilconvettori",
  hotAirOutlets: "c. bocchette aria calda",
  radiators: "d. radiatori",
  isolatedRadiantPanels: "e. pannelli radianti isolati dalle strutture",
  embeddedRadiantPanels: "f. pannelli radianti annegati nella struttura",
} as const;

export const ENEA_ENERGY_CARRIER = {
  naturalGas: "a. gas metano",
  diesel: "b. gasolio",
  lpg: "c. gpl",
  districtHeating: "d. teleriscaldamento",
  fuelOil: "e. olio combustibile",
  electricity: "f. energia elettrica",
  biomass: "g. biomassa",
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
  // Il CRM usa "split" come categoria propria, ma il portale osservato espone
  // soltanto una voce generica "Altro" che richiede una riconciliazione non
  // modellata dal laboratorio. Non deduciamo quindi un terminale ENEA: il campo
  // resta fail-closed finché un operatore non verifica una voce rappresentabile.
  if (value === "split") return "";
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
