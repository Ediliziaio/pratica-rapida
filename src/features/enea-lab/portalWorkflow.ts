import type { EneaLabMappedPractice } from "./types";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";
import { buildEneaInterventionPortalScript } from "./portalIntervention";
import { buildEneaPlantPortalScript } from "./portalPlant";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";
import { ENEA_SCREENING_TYPE } from "./screeningRules";
import {
  buildEneaPortalWorkflowRuntimeScript,
  type EneaPortalScriptOptions,
  type EneaPortalWorkflowStep,
} from "./portalScript";

export interface EneaPortalWorkflowPreparation {
  script: string;
  supportedPages: string[];
  screeningItemCount: number;
  mode: "test" | "official" | "blocked";
}

const NORTHERN_EXPOSURES = new Set(["Nord", "Nord-Est", "Nord-Ovest"]);
const NORTH_COMPATIBLE_TYPES = new Set<string>([
  ENEA_SCREENING_TYPE.shutter,
  ENEA_SCREENING_TYPE.rollerShutter,
  ENEA_SCREENING_TYPE.otherDarkeningClosure,
]);

function screeningIndexes(mapped: EneaLabMappedPractice): number[] {
  const indexes = mapped.sections
    .flatMap((section) => section.fields)
    .flatMap((field) => {
      const match = field.id.match(/^schermature\.(\d+)\.tipo$/);
      return match ? [Number(match[1])] : [];
    });
  return [...new Set(indexes)].sort((a, b) => a - b);
}

function hasConsistentOfficialScreeningIndexes(mapped: EneaLabMappedPractice): boolean {
  const countField = mapped.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.numero");
  if (countField?.status !== "ready" || countField.testOnly) return false;
  const count = Number(countField.value.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isInteger(count) || count < 1) return false;

  const indexes = screeningIndexes(mapped);
  if (indexes.length !== count) return false;
  return indexes.every((index, position) => index === position);
}

function hasCompatibleOfficialScreeningExposures(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );

  return screeningIndexes(mapped).every((index) => {
    const exposure = fields.get(`schermature.${index}.esposizione`);
    if (exposure?.status !== "ready" || exposure.testOnly || !NORTHERN_EXPOSURES.has(exposure.value)) return true;

    const type = fields.get(`schermature.${index}.tipo`);
    return type?.status === "ready"
      && !type.testOnly
      && NORTH_COMPATIBLE_TYPES.has(type.value);
  });
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
    mode,
  };
}

export function buildEneaOfficialPortalWorkflowScript(
  mapped: EneaLabMappedPractice,
): EneaPortalWorkflowPreparation {
  // Il numero riepilogativo e gli indici tecnici devono descrivere esattamente
  // lo stesso insieme 0..n-1. Un campo stale oltre il conteggio non deve creare
  // una finestra schermatura aggiuntiva nel workflow ufficiale.
  if (!hasConsistentOfficialScreeningIndexes(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  // ENEA ammette Nord/Nord-Est/Nord-Ovest per le chiusure oscuranti, non per
  // le schermature solari. Il workflow ufficiale resta fail-closed anche se un
  // valore manuale singolarmente valido viene abbinato a una tipologia
  // incompatibile: in quel caso non viene generato alcuno script eseguibile.
  if (!hasCompatibleOfficialScreeningExposures(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }
  return buildEneaPortalWorkflowScript(mapped, "official");
}
