import type { EneaLabMappedPractice } from "./types";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";
import { buildEneaBuildingPortalScript } from "./portalBuilding";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";
import { buildEneaInterventionPortalScript } from "./portalIntervention";
import { buildEneaPlantPortalScript } from "./portalPlant";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { buildEneaScreeningSummaryPortalScript } from "./portalScreeningSummary";
import { validateOperatorOverride } from "./operatorValidation";
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
const OFFICIAL_NUMERIC_FIELD_IDS = [
  "immobile.anno",
  "immobile.superficie",
  "immobile.unita",
  "intervento.unita_oggetto",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
] as const;
const OFFICIAL_DISCRETE_DOMAIN_FIELD_IDS = [
  "beneficiario.sesso",
  "beneficiario.titolo",
  "immobile.destinazione_generale",
  "immobile.destinazione_particolare",
  "immobile.tipologia",
  "intervento.ambito",
  "intervento.accorpamenti",
  "intervento.tipo",
  "intervento.impianto_centralizzato",
  "impianto.tipo",
  "impianto.terminali",
  "impianto.distribuzione",
  "impianto.regolazione",
  "impianto.combustibile",
  "impianto.condizionamento",
] as const;

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

  // Questo builder viene usato anche dai test di serializzazione su mapping
  // volutamente incompleti. In quel caso la readiness complessiva resta compito
  // del gate pre-collaudo. Quando però il riepilogo è già `ready`, gli indici
  // tecnici devono coincidere esattamente con 0..n-1: nessuna riga stale può
  // produrre una finestra schermatura ufficiale aggiuntiva.
  if (countField?.status !== "ready" || countField.testOnly) return true;
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

function hasValidOfficialScreeningRsupp(mapped: EneaLabMappedPractice): boolean {
  const fields = mapped.sections.flatMap((section) => section.fields);

  return screeningIndexes(mapped).every((index) => {
    const field = fields.find((candidate) => candidate.id === `schermature.${index}.rsupp`);
    if (!field || field.status !== "ready" || field.testOnly) return true;

    const value = field.value.trim();
    if (!value || /^(?:Non indicato|Intervento umano richiesto)$/i.test(value)) return true;
    if (field.source !== "Inserimento operatore") return false;

    // Non ripulire concatenando cifre separate da testo: "0,08 x 2" non deve
    // diventare silenziosamente 0,082. La Rsupp è opzionale, ma se viene portata
    // nel workflow ufficiale deve essere un singolo valore numerico verificato.
    const tokens = value.match(/[+-]?\d+(?:[.,]\d+)*/g) ?? [];
    if (tokens.length !== 1) return false;
    const normalized = tokens[0]
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0;
  });
}

function hasValidOfficialNumericValues(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );

  // Il workflow official può essere costruito anche su mapping volutamente
  // incompleti nei test di serializzazione. Non imponiamo qui la presenza dei
  // campi: se però un valore numerico che finirà nel portale è già `ready` e
  // non test-only, deve superare di nuovo la validazione nota del laboratorio.
  // La barriera vale sia per il generatore sia per immobile/intervento: così una
  // superficie stale come "2 x 9 m²" non può arrivare all'input ENEA.
  return OFFICIAL_NUMERIC_FIELD_IDS.every((fieldId) => {
    const field = fields.get(fieldId);
    return !field
      || field.status !== "ready"
      || field.testOnly
      || validateOperatorOverride(fieldId, field.value).valid;
  });
}

function hasValidOfficialDiscreteDomains(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );

  // I builder delle pagine ENEA scartano correttamente select/button che non
  // appartengono al contratto osservato. Nel workflow ufficiale quel comportamento
  // non deve però trasformarsi nell'omissione silenziosa di un campo già `ready`:
  // rivalidiamo quindi tutti i domini discreti noti di beneficiario, immobile,
  // intervento e impianto prima di costruire lo script pre-portale.
  return OFFICIAL_DISCRETE_DOMAIN_FIELD_IDS.every((fieldId) => {
    const field = fields.get(fieldId);
    return !field
      || field.status !== "ready"
      || field.testOnly
      || validateOperatorOverride(fieldId, field.value).valid;
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

  // Rsupp è un campo opzionale del portale osservato. Se però è presente nel
  // mapping ufficiale, non deve essere normalizzato da una stringa ambigua né
  // provenire da una fonte automatica: serve un singolo numero non negativo
  // verificato esplicitamente dall'operatore.
  if (!hasValidOfficialScreeningRsupp(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  // I numeri di immobile, intervento e generatore possono essere normalizzati
  // dai builder di pagina oppure passati direttamente agli input ENEA. Prima di
  // costruire il comando official rivalidiamo quindi qualsiasi valore ready:
  // una stringa ambigua non deve mai essere reinterpretata o inviata così com'è.
  if (!hasValidOfficialNumericValues(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  // I select/button delle pagine non-schermatura hanno domini discreti osservati.
  // Un valore `ready` ma fuori dominio non deve essere semplicemente omesso dal
  // builder né arrivare al runtime come scelta impossibile: il workflow ufficiale
  // deve fermarsi prima di produrre uno script.
  if (!hasValidOfficialDiscreteDomains(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  return buildEneaPortalWorkflowScript(mapped, "official");
}
