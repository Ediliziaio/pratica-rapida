import type { EneaLabMappedPractice } from "./types";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
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
 */
export function buildEneaPortalWorkflowScript(
  mapped: EneaLabMappedPractice,
): EneaPortalWorkflowPreparation {
  const indexes = screeningIndexes(mapped);
  const generator = buildEneaGeneratorPortalScript(mapped, true);
  const beneficiary = buildEneaBeneficiaryPortalScript(mapped);
  const building = buildEneaBuildingPortalScript(mapped);
  const intervention = buildEneaInterventionPortalScript(mapped);
  const plant = buildEneaPlantPortalScript(mapped);
  const summary = buildEneaScreeningSummaryPortalScript(mapped);
  const steps: EneaPortalWorkflowStep[] = [
    step("generator", generator.runtime),
    step("beneficiary", beneficiary.runtime),
    step("building", building.runtime),
    step("intervention", intervention.runtime),
    step("plant", plant.runtime),
    step("screening-summary", summary.runtime),
  ];
  const screeningSteps = indexes.map((index) => {
    const preparation = buildEneaScreeningPortalScript(mapped, index);
    return step(`screening-${index + 1}`, preparation.runtime);
  });

  return {
    script: buildEneaPortalWorkflowRuntimeScript({
      practiceCode: mapped.source.code,
      steps,
      screeningSteps,
    }),
    supportedPages: steps.map(({ pageName }) => pageName),
    screeningItemCount: screeningSteps.length,
  };
}
