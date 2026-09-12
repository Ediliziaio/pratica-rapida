import { ENEA_PREFLIGHT_STEPS, type EneaPreflightStep } from "./preflightContract";
import { OPERATIONAL_RULES } from "./operationalRules";

export const ENEA_OPERATIONAL_BASELINE_VERSION = "enea-operational-baseline-v1" as const;

export const ENEA_OPERATIONAL_CHECKLIST = Object.freeze(ENEA_PREFLIGHT_STEPS.map((step, index) => ({
  order: index + 1,
  step,
  rule: "Valutare fonte originaria e poi policy consolidata; ticket solo per conflitto esplicito o fonte realmente mancante.",
})));

export type BaselineStatus = "green" | "real_conflict" | "source_missing" | "channel_limit";
export interface BaselineField { field: string; value: string; source: string; rule: string; status: "resolved" | "blocked" }
export interface BaselineScenario {
  id: string; label: string; expected: "ready" | "requested_operator" | "submitted_manual_exception";
  status: BaselineStatus; reason: string; fields: readonly BaselineField[];
}

const policyFields: readonly BaselineField[] = Object.entries(OPERATIONAL_RULES).map(([field, rule]) => ({
  field, value: "da fonte oppure policy autorizzata", source: "registro operativo", rule, status: "resolved",
}));

const completePilot = (id: string, label: string, expected: BaselineScenario["expected"] = "ready"): BaselineScenario => ({
  id, label, expected, status: "green", reason: "Pilot completato con fonti originarie e policy autorizzate; benchmark storico escluso dal mapping.",
  fields: policyFields,
});

export const ENEA_OPERATIONAL_BASELINE: readonly BaselineScenario[] = Object.freeze([
  completePilot("costigliolo", "Costigliolo"), completePilot("federigo", "Federigo"),
  completePilot("claudio", "Claudio"), completePilot("luigi", "Luigi"),
  completePilot("patrizia", "Patrizia", "submitted_manual_exception"),
  { id:"sara", label:"Sara Agostinelli", expected:"requested_operator", status:"real_conflict", reason:"Form: una pergola; documento: righe tecniche multiple non riconciliate uno-a-uno.", fields:policyFields },
  { id:"samuele", label:"Samuele Colombo", expected:"requested_operator", status:"source_missing", reason:"Economia e righe note; matrice tecnica obbligatoria non integralmente attestata.", fields:policyFields },
  { id:"vito", label:"Vito Fusillo", expected:"requested_operator", status:"source_missing", reason:"Fonte tecnica parziale non dimostra tutti gli attributi obbligatori.", fields:policyFields },
  { id:"zeno", label:"Zeno Righetti", expected:"requested_operator", status:"real_conflict", reason:"Gruppi/prodotti misti non riconciliati uno-a-uno alle schermature.", fields:policyFields },
  { id:"matteo", label:"Matteo Maranesi", expected:"requested_operator", status:"source_missing", reason:"Economia lorda riconciliata a €9.350,01; set tecnico finale non integralmente attestato.", fields:policyFields },
]);

export function baselineGate(scenarios: readonly BaselineScenario[] = ENEA_OPERATIONAL_BASELINE) {
  const regressions = scenarios.filter((item) => item.status === "green" && item.fields.some((field) => field.status === "blocked"));
  return { version: ENEA_OPERATIONAL_BASELINE_VERSION, allowed: regressions.length === 0, regressions } as const;
}

export function completePreflightMatrix(input: Record<EneaPreflightStep, BaselineField[]>): BaselineField[] {
  return ENEA_PREFLIGHT_STEPS.flatMap((step) => input[step].map((field) => ({ ...field, field: `${step}.${field.field}` })));
}
