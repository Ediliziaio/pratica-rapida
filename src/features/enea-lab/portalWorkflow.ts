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
  "schermature.numero",
] as const;
const OFFICIAL_STRUCTURED_FIELD_IDS = [
  "beneficiario.cf",
  "beneficiario.data_nascita",
  "beneficiario.cap_residenza",
  "beneficiario.telefono",
  "immobile.cap",
  "intervento.data_inizio",
  "intervento.data_fine",
] as const;
const OFFICIAL_DISCRETE_DOMAIN_FIELD_IDS = [
  "beneficiario.titolo",
  "beneficiario.sesso",
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
const FISCAL_CODE_OMOCODIA_DIGITS: Record<string, string> = {
  L: "0",
  M: "1",
  N: "2",
  P: "3",
  Q: "4",
  R: "5",
  S: "6",
  T: "7",
  U: "8",
  V: "9",
};
const FISCAL_CODE_MONTHS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  H: 6,
  L: 7,
  M: 8,
  P: 9,
  R: 10,
  S: 11,
  T: 12,
};

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

    // Il workflow official resta una barriera autonoma: una Rsupp già `ready`
    // deve ancora rispettare sintassi e unità della resistenza termica osservata.
    // Riutilizzare la stessa validazione fail-closed evita che annotazioni come
    // "0,08 kg" passino qui anche se UI e gate pre-collaudo le rifiutano.
    return validateOperatorOverride(field.id, value).valid;
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

function hasValidOfficialStructuredValues(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );

  // Alcuni input testuali hanno un formato ENEA deterministico (CF, date, CAP,
  // telefono). Se un mapping stale li marca `ready`, i builder di pagina li
  // copierebbero così come sono. Il workflow official li rivalida quindi con la
  // stessa regola dell'inserimento operatore prima di generare qualsiasi script.
  return OFFICIAL_STRUCTURED_FIELD_IDS.every((fieldId) => {
    const field = fields.get(fieldId);
    return !field
      || field.status !== "ready"
      || field.testOnly
      || validateOperatorOverride(fieldId, field.value).valid;
  });
}

function fiscalCodeNumericPair(value: string): number | null {
  const decoded = [...value.toUpperCase()]
    .map((character) => FISCAL_CODE_OMOCODIA_DIGITS[character] ?? character)
    .join("");
  return /^\d{2}$/.test(decoded) ? Number(decoded) : null;
}

function birthDateParts(value: string): { year: number; month: number; day: number } | null {
  const italian = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (italian) {
    return { year: Number(italian[3]), month: Number(italian[2]), day: Number(italian[1]) };
  }
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  return null;
}

function hasCoherentOfficialBeneficiaryIdentity(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const fiscalCode = fields.get("beneficiario.cf");
  const birthDate = fields.get("beneficiario.data_nascita");
  const sex = fields.get("beneficiario.sesso");

  // I mapping volutamente incompleti restano gestiti dalla readiness generale.
  // Se però i tre dati personali entreranno nel workflow official, devono essere
  // coerenti tra loro e non soltanto validi singolarmente.
  if (
    !fiscalCode
    || !birthDate
    || !sex
    || fiscalCode.status !== "ready"
    || birthDate.status !== "ready"
    || sex.status !== "ready"
    || fiscalCode.testOnly
    || birthDate.testOnly
    || sex.testOnly
  ) return true;

  const normalizedFiscalCode = fiscalCode.value.replace(/\s/g, "").toUpperCase();
  // Gli 11 numeri ammessi per i soggetti IVA non codificano data e sesso.
  if (/^\d{11}$/.test(normalizedFiscalCode)) return true;
  if (normalizedFiscalCode.length !== 16) return false;

  const fiscalYear = fiscalCodeNumericPair(normalizedFiscalCode.slice(6, 8));
  const fiscalMonth = FISCAL_CODE_MONTHS[normalizedFiscalCode[8]];
  const fiscalDayCode = fiscalCodeNumericPair(normalizedFiscalCode.slice(9, 11));
  const parsedBirthDate = birthDateParts(birthDate.value);
  if (fiscalYear === null || fiscalMonth === undefined || fiscalDayCode === null || !parsedBirthDate) return false;

  const fiscalSex = fiscalDayCode >= 41 && fiscalDayCode <= 71
    ? "F"
    : fiscalDayCode >= 1 && fiscalDayCode <= 31
      ? "M"
      : null;
  if (!fiscalSex) return false;
  const fiscalDay = fiscalSex === "F" ? fiscalDayCode - 40 : fiscalDayCode;

  return parsedBirthDate.year % 100 === fiscalYear
    && parsedBirthDate.month === fiscalMonth
    && parsedBirthDate.day === fiscalDay
    && sex.value.trim().toUpperCase() === fiscalSex;
}

function dateTimestamp(value: string): number | null {
  const italian = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (italian) return Date.UTC(Number(italian[3]), Number(italian[2]) - 1, Number(italian[1]));
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function hasValidOfficialInterventionChronology(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const start = fields.get("intervento.data_inizio");
  const finish = fields.get("intervento.data_fine");

  // La presenza e il formato dei singoli campi sono già gestiti dalla readiness
  // e dalla rivalidazione strutturata. Quando entrambe le date entreranno nel
  // workflow official, però, devono anche descrivere una sequenza temporale
  // coerente: una fine lavori precedente all'inizio non può essere copiata ENEA.
  if (
    !start
    || !finish
    || start.status !== "ready"
    || finish.status !== "ready"
    || start.testOnly
    || finish.testOnly
  ) return true;

  const startTime = dateTimestamp(start.value);
  const finishTime = dateTimestamp(finish.value);
  return startTime !== null && finishTime !== null && startTime <= finishTime;
}

function hasValidOfficialDiscreteDomains(mapped: EneaLabMappedPractice): boolean {
  const fields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );

  // I builder delle pagine ENEA scartano correttamente select/button che non
  // appartengono al contratto osservato. Nel workflow ufficiale quel comportamento
  // non deve però trasformarsi nell'omissione silenziosa di un campo già `ready`:
  // rivalidiamo quindi i domini discreti osservati di beneficiario, immobile,
  // intervento e impianto prima di costruire lo script pre-portale.
  return OFFICIAL_DISCRETE_DOMAIN_FIELD_IDS.every((fieldId) => {
    const field = fields.get(fieldId);
    return !field
      || field.status !== "ready"
      || field.testOnly
      || validateOperatorOverride(fieldId, field.value).valid;
  });
}

function hasSupportedOfficialCoOwnership(mapped: EneaLabMappedPractice): boolean {
  const field = mapped.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === "beneficiario.cointestazione");

  if (!field || field.status !== "ready" || field.testOnly) return true;
  const validation = validateOperatorOverride(field.id, field.value);
  if (!validation.valid) return false;

  // Il workflow osservato modella oggi soltanto l'anagrafica del beneficiario
  // principale: non esiste ancora uno step/contratto per inserire in sicurezza
  // i dati di un cointestatario. Finché quel percorso non viene osservato e
  // modellato sul portale reale, una cointestazione deve restare fail-closed.
  return validation.value === "No";
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

  // Anche gli input testuali con formato noto vengono rivalidati nell'ultima
  // barriera. In particolare un CF, CAP, telefono o data diventati stale non
  // possono essere copiati nel comando official solo perché risultano `ready`.
  if (!hasValidOfficialStructuredValues(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  // Un CF personale codifica data di nascita e sesso: tre valori singolarmente
  // validi ma tra loro incoerenti non devono produrre il workflow official. La
  // decodifica gestisce anche le sostituzioni di omocodia nelle posizioni numeriche.
  if (!hasCoherentOfficialBeneficiaryIdentity(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  // Le date possono essere singolarmente valide ma incompatibili tra loro.
  // La barriera official ricontrolla quindi anche la cronologia dell'intervento.
  if (!hasValidOfficialInterventionChronology(mapped)) {
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

  // Il laboratorio non ha ancora osservato e congelato il percorso ENEA per un
  // secondo beneficiario. Evitiamo quindi di dichiarare official un workflow che
  // compilerebbe soltanto il beneficiario principale lasciando fuori il cointestatario.
  if (!hasSupportedOfficialCoOwnership(mapped)) {
    return {
      script: "",
      supportedPages: [],
      screeningItemCount: 0,
      mode: "blocked",
    };
  }

  return buildEneaPortalWorkflowScript(mapped, "official");
}
