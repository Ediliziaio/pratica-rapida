import type { EneaLabMappedPractice } from "./types";
import { buildEneaPortalRuntimeScript, type EneaPortalScriptOptions } from "./portalScript";
import { USER_AUTHORIZED_RULE_IDS } from "@/features/enea-shadow-crm/operationalRegistry";

export interface EneaCalculationPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
  allocationRuntime: EneaPortalScriptOptions | null;
}

function numericValue(value: string): string {
  const compact = value.trim().replace(/[^0-9,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

/** Collega il calcolo locale versionato al solo campo risparmio osservato su ENEA. */
export function buildEneaCalculationPortalScript(mapped: EneaLabMappedPractice): EneaCalculationPortalPreparation {
  const fields = mapped.sections.flatMap(({ fields }) => fields);
  const field = fields
    .find(({ id }) => id === "schermature.risparmio_energia");
  const authorized = field?.status === "ready"
    && field.source === "Regola controllata"
    && field.note?.includes("screening-energy-savings-v1");
  const value = authorized ? numericValue(field.value) : "";
  const runtime: EneaPortalScriptOptions = {
    fields: value ? [{ portalId: "id-risp", control: "input", value }] : [],
    pageName: "Calcolo costi e detrazioni",
    markerIds: ["id-risp"],
    successMessage: "ENEA Lab: risparmio energetico compilato. Nessun salvataggio o invio eseguito.",
  };
  const principalHome = fields.find(({ id }) => id === "beneficiario.abitazione_principale");
  const expense = fields.find(({ id }) => id === "schermature.spesa");
  const secondaryHome = principalHome?.status === "ready" && principalHome.value.trim().toLocaleLowerCase("it") === "no";
  const expenseValue = expense?.status === "ready" && expense.source === "Calcolo ENEA" ? numericValue(expense.value) : "";
  const allocationRuntime: EneaPortalScriptOptions | null = secondaryHome && expenseValue ? {
    fields: [],
    pageName: "Allocazione costi e detrazioni",
    markerIds: [],
    hostRoute: "calcolo",
    expenseAllocation: {
      fieldId: "schermature.spesa",
      interventionLabel: "Schermature solari",
      value: expenseValue,
      rate: 36,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation, "system-atomic-checkpoint-resume"],
    },
    successMessage: "APR: allocazione 36% preparata; salvataggio separato, anteprima e invio vietati.",
  } : null;
  return {
    script: buildEneaPortalRuntimeScript(runtime),
    readyFieldIds: [...(value ? ["schermature.risparmio_energia"] : []), ...(allocationRuntime ? ["schermature.spesa"] : [])],
    skippedFieldIds: value ? [] : ["schermature.risparmio_energia"],
    runtime,
    allocationRuntime,
  };
}
