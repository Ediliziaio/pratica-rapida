import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { analyzePracticeDocuments } from "./documentAnalysis";
import { auditCompletedEneaPractice, type CompletedEneaAuditResult } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { validatePreparedPractice } from "./preparation";
import { loadReadOnlyEneaHistoricalQueue } from "./readOnlySource";
import type { EneaLabMappedPractice } from "./types";

export type HistoricalAuditOutcome = "match" | "blocked" | "difference" | "error";

export interface HistoricalPracticeAudit {
  practiceCode: string;
  outcome: HistoricalAuditOutcome;
  compared: number;
  matches: number;
  mismatches: number;
  blockerCount: number;
  differenceFieldIds: string[];
  blockedDifferenceFieldIds: string[];
  error?: string;
}

export interface HistoricalBatchAuditReport {
  requested: number;
  available: number;
  audited: number;
  matches: number;
  correctlyBlocked: number;
  differences: number;
  errors: number;
  practices: HistoricalPracticeAudit[];
}

type HistoricalCompletedEneaAuditResult = CompletedEneaAuditResult & {
  screeningTypes?: Record<number, string>;
};

// Un PDF ENEA conclusivo per schermature contiene normalmente decine di campi
// confrontabili. Una manciata di coincidenze non e' evidenza sufficiente per
// certificare il mapper: potrebbe indicare un parser parziale o un documento
// diverso da quello atteso. Il collaudo storico deve quindi fallire chiuso.
const MIN_HISTORICAL_COMPARISONS = 10;
const HISTORICAL_INTERVENTION_FIELD = "intervento.tipo";
const HISTORICAL_PRACTICE_ID_FIELDS = [
  "intervento.data_inizio",
  "intervento.data_fine",
  "schermature.numero",
] as const;
const HISTORICAL_CRITICAL_COVERAGE_FIELDS = [
  "beneficiario.cointestazione",
  "immobile.superficie",
  "immobile.unita",
  "intervento.ambito",
  "intervento.unita_oggetto",
  "intervento.accorpamenti",
  "impianto.tipo",
  "impianto.terminali",
  "impianto.generatore",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
  "impianto.combustibile",
  "impianto.condizionamento",
  "schermature.spesa",
  "schermature.risparmio_energia",
] as const;
const HISTORICAL_BENEFICIARY_DESCRIPTOR_COVERAGE_FIELDS = [
  "beneficiario.nome",
  "beneficiario.cognome",
  "beneficiario.sesso",
  "beneficiario.data_nascita",
  "beneficiario.comune_nascita",
  "beneficiario.indirizzo_residenza",
  "beneficiario.civico_residenza",
  "beneficiario.cap_residenza",
  "beneficiario.comune_residenza",
] as const;
const HISTORICAL_BUILDING_DESCRIPTOR_COVERAGE_FIELDS = [
  "beneficiario.titolo",
  "immobile.anno",
  "immobile.destinazione_generale",
  "immobile.destinazione_particolare",
  "immobile.tipologia",
] as const;
const HISTORICAL_SCREENING_TECHNICAL_COVERAGE_SUFFIXES = [
  "tipo",
  "installazione",
  "superficie",
  "superficie_finestrata",
  "esposizione",
  "modalita_calcolo",
  "materiale",
  "regolazione",
] as const;
const HISTORICAL_DARKENING_CLOSURE_TYPES = new Set([
  "Persiana",
  "Persiana avvolgibile",
  "Altra chiusura oscurante",
]);
const HISTORICAL_SOLAR_SCREENING_TYPES = new Set([
  "Tenda o veneziana",
  "Schermatura integrata (veneziana nella vetrocamera)",
  "Altra schermatura solare",
]);
const HISTORICAL_CADASTRAL_ID_FIELDS = [
  "immobile.foglio",
  "immobile.mappale",
  "immobile.subalterno",
] as const;
const HISTORICAL_ADDRESS_ID_FIELDS = [
  "immobile.indirizzo",
  "immobile.civico",
  "immobile.cap",
  "immobile.comune",
] as const;

function normalizedCpid(cpid: string): string {
  return cpid.trim().toUpperCase();
}

function isValidHistoricalCpid(cpid: string | null): cpid is string {
  if (!cpid) return false;
  // Le pratiche Ecobonus osservate usano la forma numero-AAAAE-token.
  // Una stringa parziale o generica non deve bastare a certificare un match.
  return /^\d+-\d{4}E-[A-Z0-9]+$/i.test(cpid.trim());
}

function cpidYear(cpid: string): number | null {
  const match = cpid.trim().match(/^\d+-(\d{4})E-[A-Z0-9]+$/i);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function dateYear(value: string): number | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (iso) return Number(iso[1]);
  const italian = trimmed.match(/^\d{2}\/\d{2}\/(\d{4})$/);
  return italian ? Number(italian[1]) : null;
}

/**
 * Un CPID formalmente valido puo' comunque appartenere a un'altra annualita'.
 * Il PDF storico puo' certificare il collaudo solo quando abbiamo anche una
 * data di fine lavori verificabile e l'anno Ecobonus del CPID coincide con essa.
 * In assenza della data non assumiamo che l'annualita' sia corretta: la stessa
 * persona e lo stesso immobile possono avere schermature ENEA in anni diversi.
 */
export function isHistoricalCpidCoherentWithFinishDate(
  cpid: string | null,
  finishDate: string | null,
): boolean {
  if (!isValidHistoricalCpid(cpid) || !finishDate) return false;
  const completedYear = cpidYear(cpid);
  const expectedYear = dateYear(finishDate);
  return completedYear !== null && expectedYear !== null && completedYear === expectedYear;
}

/**
 * Il CPID e l'annualita' dimostrano che il file e' una pratica ENEA conclusa,
 * non che appartenga alla pratica CRM che stiamo collaudando. Prima di usare
 * un PDF come prova storica pretendiamo quindi un'identita' forte: il codice
 * fiscale del beneficiario deve coincidere e deve coincidere anche l'immobile,
 * provato da almeno due riferimenti catastali oppure dall'indirizzo completo.
 * In assenza di questa evidenza l'audit fallisce chiuso.
 */
export function hasHistoricalIdentityEvidence(audit: CompletedEneaAuditResult): boolean {
  const matched = new Set(audit.matchedFieldIds ?? []);
  if (!matched.has("beneficiario.cf")) return false;

  const cadastralMatches = HISTORICAL_CADASTRAL_ID_FIELDS
    .filter((fieldId) => matched.has(fieldId))
    .length;
  const fullAddressMatches = HISTORICAL_ADDRESS_ID_FIELDS
    .every((fieldId) => matched.has(fieldId));

  return cadastralMatches >= 2 || fullAddressMatches;
}

/**
 * Identita' e CPID non bastano a dimostrare che il PDF sia quello delle
 * schermature solari: la stessa persona e lo stesso immobile possono avere
 * piu interventi ENEA nello stesso anno. Pretendiamo quindi anche il match del
 * tipo di intervento, che nel PDF finale osservato compare come
 * "Comma 345B - Schermature solari". Se il parser non lo legge, l'audit resta
 * prudenzialmente una differenza invece di certificare un documento estraneo.
 */
function hasHistoricalInterventionEvidence(audit: CompletedEneaAuditResult): boolean {
  return (audit.matchedFieldIds ?? []).includes(HISTORICAL_INTERVENTION_FIELD);
}

/**
 * Anche beneficiario, immobile, tipo intervento e anno possono coincidere tra
 * due pratiche diverse. Per certificare proprio quella pratica richiediamo che
 * coincidano le due date lavori e il numero di schermature: sono ancore della
 * singola lavorazione, non semplici attributi anagrafici dell'immobile.
 */
function hasHistoricalPracticeEvidence(audit: CompletedEneaAuditResult): boolean {
  const matched = new Set(audit.matchedFieldIds ?? []);
  return HISTORICAL_PRACTICE_ID_FIELDS.every((fieldId) => matched.has(fieldId));
}

function hasHistoricalScreeningTechnicalCoverage(
  audit: CompletedEneaAuditResult,
  observed: ReadonlySet<string>,
): boolean {
  const indexes = new Set<number>();
  for (const fieldId of observed) {
    const match = fieldId.match(/^schermature\.(\d+)\./);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0) return false;
    indexes.add(index);
  }
  if (indexes.size === 0) return true;

  const orderedIndexes = [...indexes].sort((left, right) => left - right);
  if (!orderedIndexes.every((index, position) => index === position)) return false;

  const screeningTypes = (audit as HistoricalCompletedEneaAuditResult).screeningTypes;
  return orderedIndexes.every((index) => {
    const prefix = `schermature.${index}`;
    const hasBaseCoverage = HISTORICAL_SCREENING_TECHNICAL_COVERAGE_SUFFIXES.every(
      (suffix) => observed.has(`${prefix}.${suffix}`),
    );
    if (!hasBaseCoverage) return false;

    // Nel batch reale il tipo proviene dal mapper solo dopo che lo stesso campo
    // ha coinciso col PDF conclusivo. Possiamo quindi usarlo per pretendere la
    // prestazione primaria corretta: gTot per schermature solari, Rsupp per
    // chiusure oscuranti. I vecchi audit sintetici privi di metadato mantengono
    // il fallback storico, ma il percorso read-only di produzione lo valorizza.
    if (screeningTypes) {
      const type = screeningTypes[index];
      if (!type) return false;
      if (HISTORICAL_DARKENING_CLOSURE_TYPES.has(type)) {
        return observed.has(`${prefix}.rsupp`);
      }
      if (HISTORICAL_SOLAR_SCREENING_TYPES.has(type)) {
        return observed.has(`${prefix}.gtot`);
      }
      return false;
    }

    return observed.has(`${prefix}.gtot`) || observed.has(`${prefix}.rsupp`);
  });
}

/**
 * Un parser parziale puo' omettere un campo importante senza produrre mismatch,
 * perché compareMappedToCompletedEnea confronta solo cio' che riesce a leggere
 * nel PDF. Alcuni campi critici devono quindi risultare almeno osservati
 * (match oppure differenza) prima di certificare l'audit. Cointestazione,
 * superficie utile, unita immobiliari, dati dell'intervento, dati osservati
 * dell'impianto e del generatore, spesa e risparmio energetico restano
 * confrontabili anche quando sono blocker, cosi una pratica correttamente
 * bloccata puo' continuare a essere riconosciuta come tale. Quando il PDF ha
 * anche una riga tecnica schermatura realmente confrontata pretendiamo inoltre
 * tutti i descrittori anagrafico-edilizi. Per promuovere un audit senza mismatch
 * a match pretendiamo anche la riga tecnica completa: un attributo perso dal
 * parser non puo' sparire silenziosamente dalla certificazione storica.
 */
function hasHistoricalCriticalCoverage(audit: CompletedEneaAuditResult): boolean {
  const observed = new Set([
    ...(audit.matchedFieldIds ?? []),
    ...audit.differences.map(({ fieldId }) => fieldId),
  ]);
  const hasBaseCoverage = HISTORICAL_CRITICAL_COVERAGE_FIELDS
    .every((fieldId) => observed.has(fieldId));
  if (!hasBaseCoverage) return false;

  const hasTechnicalScreeningEvidence = [...observed]
    .some((fieldId) => /^schermature\.\d+\./.test(fieldId));
  if (!hasTechnicalScreeningEvidence) return true;

  if (!HISTORICAL_BENEFICIARY_DESCRIPTOR_COVERAGE_FIELDS
    .every((fieldId) => observed.has(fieldId))) {
    return false;
  }

  if (!HISTORICAL_BUILDING_DESCRIPTOR_COVERAGE_FIELDS
    .every((fieldId) => observed.has(fieldId))) {
    return false;
  }

  // Una pratica gia' discordante non viene mai certificata come match: puo'
  // soltanto restare difference oppure blocked. La copertura tecnica completa
  // e' quindi necessaria per la promozione a match, senza impedire di
  // riconoscere come blocked un audit che espone gia' differenze esplicite.
  if (audit.mismatches > 0) return true;

  return hasHistoricalScreeningTechnicalCoverage(audit, observed);
}

/**
 * Se una pratica ha piu PDF conclusivi/duplicati, non basta prendere il primo
 * file leggibile: potrebbe essere una copia parziale o un documento intermedio.
 * Preferiamo prima un documento con CPID strutturalmente valido (prova che e'
 * una pratica Ecobonus conclusa) e, a parita, quello che offre la maggiore
 * copertura di campi confrontabili. Non usiamo il numero di match come criterio,
 * per non scegliere il PDF che "fa apparire migliore" il mapper corrente.
 *
 * Fail-safe aggiuntivo: due CPID validi diversi nella stessa pratica indicano
 * allegati incoerenti o una pratica ENEA estranea. In quel caso non scegliamo
 * arbitrariamente un documento: l'audit deve fermarsi e richiedere verifica.
 */
export function selectBestHistoricalCompletedAudit(
  candidates: readonly CompletedEneaAuditResult[],
): CompletedEneaAuditResult | null {
  const distinctCpids = new Set(
    candidates
      .map(({ cpid }) => cpid)
      .filter(isValidHistoricalCpid)
      .map(normalizedCpid),
  );
  if (distinctCpids.size > 1) {
    throw new Error("PDF ENEA conclusivi con CPID discordanti nella stessa pratica.");
  }

  let best: CompletedEneaAuditResult | null = null;

  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }

    const candidateHasCpid = isValidHistoricalCpid(candidate.cpid);
    const bestHasCpid = isValidHistoricalCpid(best.cpid);
    if (candidateHasCpid !== bestHasCpid) {
      if (candidateHasCpid) best = candidate;
      continue;
    }

    if (candidate.compared > best.compared) best = candidate;
  }

  return best;
}

function readyMappedFieldValue(mapped: EneaLabMappedPractice, fieldId: string): string | null {
  const field = mapped.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === fieldId);
  if (!field || field.status !== "ready" || field.testOnly) return null;
  const value = field.value.trim();
  return value || null;
}

function readyMappedScreeningTypes(mapped: EneaLabMappedPractice): Record<number, string> {
  const screeningTypes: Record<number, string> = {};
  for (const field of mapped.sections.flatMap((section) => section.fields)) {
    const match = field.id.match(/^schermature\.(\d+)\.tipo$/);
    if (!match || field.status !== "ready" || field.testOnly) continue;
    const index = Number(match[1]);
    const value = field.value.trim();
    if (Number.isInteger(index) && index >= 0 && value) screeningTypes[index] = value;
  }
  return screeningTypes;
}

async function auditBestHistoricalCompletedEneaPractice(
  client: SupabaseClient<Database>,
  mapped: EneaLabMappedPractice,
): Promise<HistoricalCompletedEneaAuditResult> {
  const paths = mapped.source.completedEneaPaths ?? [];
  const candidates: CompletedEneaAuditResult[] = [];

  // auditCompletedEneaPractice resta fail-safe e valida path/tipo/dimensione.
  // Qui lo invochiamo su un path alla volta, cosi un primo PDF parziale non
  // impedisce di valutare un PDF conclusivo migliore presente nella stessa pratica.
  for (const path of paths) {
    try {
      candidates.push(await auditCompletedEneaPractice(client, {
        ...mapped,
        source: {
          ...mapped.source,
          completedEneaPaths: [path],
        },
      }));
    } catch {
      // Un allegato illeggibile non deve interrompere la ricerca degli altri
      // candidati; l'errore viene sollevato solo se nessun PDF e' utilizzabile.
    }
  }

  const best = selectBestHistoricalCompletedAudit(candidates);
  if (!best) throw new Error("Nessun PDF ENEA conclusivo leggibile per l'audit.");

  const finishDate = readyMappedFieldValue(mapped, "intervento.data_fine");
  if (
    isValidHistoricalCpid(best.cpid)
    && !isHistoricalCpidCoherentWithFinishDate(best.cpid, finishDate)
  ) {
    throw new Error(
      finishDate
        ? "PDF ENEA conclusivo con anno CPID non coerente con la data di fine lavori."
        : "Data di fine lavori verificabile assente: impossibile provare l'annualita' del PDF ENEA conclusivo.",
    );
  }

  return {
    ...best,
    screeningTypes: readyMappedScreeningTypes(mapped),
  };
}

export function classifyHistoricalAudit(
  audit: CompletedEneaAuditResult,
  blockerFieldIds: ReadonlySet<string>,
): Pick<HistoricalPracticeAudit, "outcome" | "differenceFieldIds" | "blockedDifferenceFieldIds"> {
  const differenceFieldIds = audit.differences.map(({ fieldId }) => fieldId);
  const blockedDifferenceFieldIds = differenceFieldIds.filter((fieldId) => blockerFieldIds.has(fieldId));

  // Fail-safe: un PDF leggibile senza alcun campo realmente confrontabile non
  // dimostra che il mapper corrente coincida con la pratica conclusa. Non deve
  // quindi produrre un falso "match" solo perché 0 mismatch su 0 confronti.
  if (audit.compared === 0) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Il CPID identifica la pratica ENEA conclusa. Non basta che sia non vuoto:
  // deve avere la struttura osservata delle pratiche Ecobonus, altrimenti un
  // parsing tronco potrebbe produrre una falsa prova di conclusione.
  if (!isValidHistoricalCpid(audit.cpid)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Fail-safe di copertura: CPID + poche coincidenze possono ancora provenire
  // da un parsing incompleto. Per schermature, sotto questa soglia il risultato
  // resta una differenza da investigare e non viene mai promosso a match/blocked.
  if (audit.compared < MIN_HISTORICAL_COMPARISONS) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // La stessa persona e lo stesso immobile possono avere piu pratiche ENEA.
  // Per certificare questo workflow serve una prova positiva che il PDF sia
  // proprio quello delle schermature solari, non soltanto un altro intervento.
  if (!hasHistoricalInterventionEvidence(audit)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Un PDF della stessa annualita' puo' condividere molti valori generici
  // (tipo intervento, destinazione d'uso, regole schermatura). Prima di poter
  // certificare match o blocked deve coincidere anche su beneficiario+immobile.
  if (!hasHistoricalIdentityEvidence(audit)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Stessa identita', stesso immobile e stesso tipo non identificano ancora la
  // singola pratica. Date lavori e numero schermature devono coincidere davvero.
  if (!hasHistoricalPracticeEvidence(audit)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Cointestazione, superficie utile, unita immobiliari, dati dell'intervento,
  // dell'impianto e del generatore, spesa e risparmio energetico sono campi
  // critici del flusso ENEA: se il parser non li ha neppure osservati, l'assenza
  // non deve trasformarsi in un falso match.
  if (!hasHistoricalCriticalCoverage(audit)) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Un confronto dei valori può essere perfetto e tuttavia il workflow attuale
  // può avere blocker (per esempio un gTot non documentato che per coincidenza
  // è uguale al valore usato nella pratica storica). In quel caso la pratica
  // non è automatizzabile end-to-end e non deve gonfiare il conteggio "match".
  if (audit.mismatches === 0 && blockerFieldIds.size > 0) {
    return { outcome: "blocked", differenceFieldIds, blockedDifferenceFieldIds };
  }
  if (audit.mismatches === 0) {
    return { outcome: "match", differenceFieldIds, blockedDifferenceFieldIds };
  }
  // Fail-safe: un contatore mismatch senza dettaglio dei campi non può essere
  // considerato "correttamente bloccato" solo perché 0 === 0. Lo trattiamo
  // come differenza reale finché l'audit non spiega quali campi divergono.
  if (differenceFieldIds.length === 0) {
    return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
  }
  if (blockedDifferenceFieldIds.length === differenceFieldIds.length) {
    return { outcome: "blocked", differenceFieldIds, blockedDifferenceFieldIds };
  }
  return { outcome: "difference", differenceFieldIds, blockedDifferenceFieldIds };
}

/**
 * Collaudo retrospettivo completamente read-only sulle pratiche concluse.
 * Non restituisce nomi, email, CF o altri dati personali: il report usa solo
 * il codice tecnico CRM e gli id dei campi che differiscono.
 */
export async function runHistoricalEneaBatchAudit(
  client: SupabaseClient<Database>,
  limit = 5,
): Promise<HistoricalBatchAuditReport> {
  const requested = Math.max(1, Math.min(20, Math.trunc(limit)));
  const historical = await loadReadOnlyEneaHistoricalQueue(client);
  const selected = historical.slice(0, requested);
  const practices: HistoricalPracticeAudit[] = [];

  for (const practice of selected) {
    try {
      const analysis = await analyzePracticeDocuments(client, practice);
      const mapped = mapSchermaturaPractice(practice, analysis, { includeTestConventions: false });
      // Per il collaudo storico la presenza del PDF finale prova che la pratica è
      // arrivata a conclusione: non va classificata come "modulo cliente in attesa".
      const validationSource = { ...practice, queueStatus: "ready" as const };
      const issues = validatePreparedPractice(validationSource, mapped, analysis);
      const blockerFieldIds = new Set(
        issues
          .filter((issue) => issue.severity === "blocker" && issue.fieldId)
          .map((issue) => issue.fieldId!),
      );
      const audit = await auditBestHistoricalCompletedEneaPractice(client, mapped);
      const classified = classifyHistoricalAudit(audit, blockerFieldIds);
      practices.push({
        practiceCode: practice.code,
        outcome: classified.outcome,
        compared: audit.compared,
        matches: audit.matches,
        mismatches: audit.mismatches,
        blockerCount: issues.filter((issue) => issue.severity === "blocker").length,
        differenceFieldIds: classified.differenceFieldIds,
        blockedDifferenceFieldIds: classified.blockedDifferenceFieldIds,
      });
    } catch (error) {
      practices.push({
        practiceCode: practice.code,
        outcome: "error",
        compared: 0,
        matches: 0,
        mismatches: 0,
        blockerCount: 0,
        differenceFieldIds: [],
        blockedDifferenceFieldIds: [],
        error: error instanceof Error ? error.message : "Audit storico non riuscito.",
      });
    }
  }

  return {
    requested,
    available: historical.length,
    audited: practices.length,
    matches: practices.filter(({ outcome }) => outcome === "match").length,
    correctlyBlocked: practices.filter(({ outcome }) => outcome === "blocked").length,
    differences: practices.filter(({ outcome }) => outcome === "difference").length,
    errors: practices.filter(({ outcome }) => outcome === "error").length,
    practices,
  };
}
