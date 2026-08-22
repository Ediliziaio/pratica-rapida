import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";
import { buildEneaInterventionPortalScript } from "./portalIntervention";
import { buildEneaPlantPortalScript } from "./portalPlant";
import {
  buildEneaPortalWorkflowRuntimeScript,
  type EneaPortalScriptOptions,
  type EneaPortalWorkflowStep,
} from "./portalScript";
import type { EneaLabMappedPractice } from "./types";

export interface AprInfissiCommonPortalWorkflow {
  script: string;
  supportedPages: string[];
  mode: "official-readiness";
}

function step(id: string, runtime: EneaPortalScriptOptions): EneaPortalWorkflowStep {
  return { id, ...runtime };
}

/**
 * Workflow delle sole pagine comuni Infissi. Non contiene alcuna pagina
 * schermature e non abilita valori convenzionali del generatore.
 * Il runtime riempie soltanto controlli già ready e non salva/avanza/invia.
 */
export function buildAprInfissiCommonPortalWorkflow(
  mapped: EneaLabMappedPractice,
): AprInfissiCommonPortalWorkflow {
  if (mapped.source.form.prodotto.tipo !== "infissi") {
    throw new Error("APR Infissi workflow comune richiede prodotto infissi");
  }
  if (mapped.sections.some((section) => section.fields.some((field) => field.id.startsWith("schermature.")))) {
    throw new Error("APR Infissi workflow comune rifiuta campi schermature");
  }

  const generator = buildEneaGeneratorPortalScript(mapped, false);
  const beneficiary = buildEneaBeneficiaryPortalScript(mapped);
  const building = buildEneaBuildingPortalScript(mapped);
  const intervention = buildEneaInterventionPortalScript(mapped);
  const plant = buildEneaPlantPortalScript(mapped);
  const steps: EneaPortalWorkflowStep[] = [
    step("generator", generator.runtime),
    step("beneficiary", beneficiary.runtime),
    step("building", building.runtime),
    step("intervention", intervention.runtime),
    step("plant", plant.runtime),
  ];

  const script = buildEneaPortalWorkflowRuntimeScript({
    practiceCode: mapped.source.code,
    steps,
    screeningSteps: [],
  });

  if (/schermatur/i.test(script)) {
    throw new Error("APR Infissi workflow comune contiene riferimenti schermature");
  }

  return {
    script,
    supportedPages: steps.map((item) => item.pageName),
    mode: "official-readiness",
  };
}
