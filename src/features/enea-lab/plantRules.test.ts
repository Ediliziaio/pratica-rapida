import { describe, expect, it } from "vitest";
import {
  ENEA_ENERGY_CARRIER,
  ENEA_PLANT_DISTRIBUTION,
  ENEA_PLANT_REGULATION,
  ENEA_PLANT_TERMINAL,
  ENEA_PLANT_TYPE,
  energyCarrierFromForm,
  plantTerminalFromForm,
  plantTypeFromForm,
} from "./plantRules";

describe("regole impianto termico esistente ENEA", () => {
  it("traduce il tipo impianto nelle opzioni ENEA", () => {
    expect(plantTypeFromForm("autonomo")).toBe(ENEA_PLANT_TYPE.autonomo);
    expect(plantTypeFromForm("centralizzato")).toBe(ENEA_PLANT_TYPE.centralizzato);
    expect(plantTypeFromForm("centralizzato_con_termostato"))
      .toBe(ENEA_PLANT_TYPE.centralizzatoConContabilizzazione);
  });

  it("traduce i terminali secondo la convenzione operativa", () => {
    expect(plantTerminalFromForm("caloriferi")).toBe(ENEA_PLANT_TERMINAL.radiators);
    expect(plantTerminalFromForm("riscaldamento_pavimento"))
      .toBe(ENEA_PLANT_TERMINAL.embeddedRadiantPanels);
    expect(plantTerminalFromForm("split")).toBe(ENEA_PLANT_TERMINAL.other);
  });

  it("mantiene fisse distribuzione C e regolazione ad ambiente o zona", () => {
    expect(ENEA_PLANT_DISTRIBUTION).toMatch(/^c\./);
    expect(ENEA_PLANT_REGULATION).toContain("ad ambiente o a zona");
  });

  it("traduce i vettori energetici disponibili nel modulo", () => {
    expect(energyCarrierFromForm("gas_metano")).toBe(ENEA_ENERGY_CARRIER.naturalGas);
    expect(energyCarrierFromForm("energia_elettrica")).toBe(ENEA_ENERGY_CARRIER.electricity);
    expect(energyCarrierFromForm("gpl")).toBe(ENEA_ENERGY_CARRIER.lpg);
    expect(energyCarrierFromForm("gasolio")).toBe(ENEA_ENERGY_CARRIER.diesel);
    expect(energyCarrierFromForm("teleriscaldamento")).toBe(ENEA_ENERGY_CARRIER.districtHeating);
  });
});
