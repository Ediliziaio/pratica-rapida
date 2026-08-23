import type { EneaLabMappedPractice } from "./types";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
import { buildEneaCalculationPortalScript } from "./portalCalculation";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";
import { buildEneaInterventionPortalScript } from "./portalIntervention";
import { buildEneaPlantPortalScript } from "./portalPlant";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";
import {
  buildEneaPortalWorkflowRuntimeScript,
  type EneaPortalScriptOptions,
  type EneaPortalWorkflowStep,
} from "./portalScript";

export interface EneaPortalWorkflowPreparation {
  script: string;
  supportedPages: string[];
  screeningItemCount: number;
  mode: "test" | "official";
  steps: EneaPortalWorkflowStep[];
  screeningSteps: EneaPortalWorkflowStep[];
  preparedFieldIds: string[];
}

function screeningIndexes(mapped: EneaLabMappedPractice): number[] {
  const indexes = mapped.sections
    .flatMap((section) => section.fields)
    .flatMap((field) => {
      const match = field.id.match(/^schermature\.(\d+)\.tipo$/);
      return match ? [Number(match[1])] : [];
    });
  return [...new Set(indexes)].sort((a, b) => a - b);
}

function step(id: string, runtime: EneaPortalScriptOptions): EneaPortalWorkflowStep {
  return { id, ...runtime };
}

/**
 * Un solo comando da riutilizzare nella Console: riconosce la pagina aperta e
 * applica la preparazione corrispondente senza salvare o avanzare.
 *
 * `test` mantiene i valori convenzionali del generatore usati nel collaudo.
 * `official` esclude ogni valore test-only: un generatore viene compilato solo
 * se i valori provengono da dati verificati della pratica.
 */
export function buildEneaPortalWorkflowScript(
  mapped: EneaLabMappedPractice,
  mode: "test" | "official" = "test",
): EneaPortalWorkflowPreparation {
  const indexes = screeningIndexes(mapped);
  const generator = buildEneaGeneratorPortalScript(mapped, mode === "test");
  const beneficiary = buildEneaBeneficiaryPortalScript(mapped);
  const building = buildEneaBuildingPortalScript(mapped);
  const intervention = buildEneaInterventionPortalScript(mapped);
  const plant = buildEneaPlantPortalScript(mapped);
  const summary = buildEneaScreeningSummaryPortalScript(mapped);
  const calculation = buildEneaCalculationPortalScript(mapped);
  const steps: EneaPortalWorkflowStep[] = [
    step("generator", generator.runtime),
    step("beneficiary", beneficiary.runtime),
    step("building", building.runtime),
    step("intervention", intervention.runtime),
    step("plant", plant.runtime),
    step("screening-summary", summary.runtime),
    ...(calculation.allocationRuntime ? [step("calculation-expense-allocation", calculation.allocationRuntime)] : []),
    step("calculation", calculation.runtime),
  ];
  const screeningPreparations = indexes.map((index) => {
    const preparation = buildEneaScreeningPortalScript(mapped, index, mode === "test");
    return preparation;
  });
  const screeningSteps = screeningPreparations.map((preparation, position) => {
    return step(`screening-${indexes[position] + 1}`, preparation.runtime);
  });
  const preparedFieldIds = [
    ...generator.readyFieldIds,
    ...beneficiary.readyFieldIds,
    ...building.readyFieldIds,
    ...intervention.readyFieldIds,
    ...plant.readyFieldIds,
    ...summary.readyFieldIds,
    ...calculation.readyFieldIds,
    ...screeningPreparations.flatMap(({ readyFieldIds }) => readyFieldIds),
  ];

  return {
    script: buildEneaPortalWorkflowRuntimeScript({
      practiceCode: mapped.source.code,
      // L'allocazione economica richiede un Salva auditato e resta quindi una
      // capability del worker persistente, non del comando manuale di sola
      // preparazione dei campi.
      steps: steps.filter((candidate) => !candidate.expenseAllocation),
      screeningSteps,
    }),
    supportedPages: steps.map(({ pageName }) => pageName),
    screeningItemCount: screeningSteps.length,
    mode,
    steps,
    screeningSteps,
    preparedFieldIds,
  };
}

export function buildEneaOfficialPortalWorkflowScript(
  mapped: EneaLabMappedPractice,
): EneaPortalWorkflowPreparation {
  return buildEneaPortalWorkflowScript(mapped, "official");
}
