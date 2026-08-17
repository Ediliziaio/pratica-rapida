import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { extractPdfText } from "./documentAnalysis";
import type { EneaLabMappedPractice } from "./types";

export interface CompletedEneaSnapshot {
  cpid: string | null;
  fields: Record<string, string>;
  screeningCount: number;
}

export interface CompletedEneaDifference {
  fieldId: string;
  completedValue: string;
  mappedValue: string;
}

export interface CompletedEneaMatchedValue {
  fieldId: string;
  completedValue: string;
  mappedValue: string;
}

export interface CompletedEneaAuditResult {
  path: string;
  cpid: string | null;
  compared: number;
  matches: number;
  mismatches: number;
  differences: CompletedEneaDifference[];
  /** Id dei campi realmente confrontati e coincidenti; usati dall'audit storico
   * per provare che il PDF appartenga alla stessa persona/immobile, non solo
   * che condivida valori generici con il mapper corrente. */
  matchedFieldIds?: string[];
  /** Valori effettivamente osservati nei match. Servono a distinguere due PDF
   * con lo stesso CPID che risultano entrambi compatibili col mapper ma che si
   * contraddicono fra loro oltre la tolleranza numerica ammessa. */
  matchedValues?: CompletedEneaMatchedValue[];
}

const NUMERIC_FIELD = /^(?:immobile\.(?:superficie|unita|gradi_giorno|fascia_solare)|intervento\.unita_oggetto|impianto\.(?:numero_generatori|rendimento|potenza)|schermature\.(?:numero|spesa|risparmio_energia)|schermature\.\d+\.(?:superficie|superficie_finestrata|rsupp|gtot))$/;
const DATE_FIELD = /^(?:beneficiario\.data_nascita|intervento\.(?:data_inizio|data_fine))$/;
const PORTAL_DERIVED_EVIDENCE_FIELDS = new Set([
  "immobile.codice_comune",
  "immobile.zona_climatica",
  "immobile.gradi_giorno",
  "immobile.fascia_solare",
]);

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capture(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function set(fields: Record<string, string>, fieldId: string, value: string | null) {
  if (value) fields[fieldId] = value;
}

function normalizeDate(value: string): string {
  const italian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (italian) return `${italian[3]}-${italian[2]}-${italian[1]}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : value;
}

function numeric(value: string): number | null {
  const normalized = value.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const tokens = normalized.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  if (tokens.length !== 1) return null;
  const parsed = Number(tokens[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string): string {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/^[a-z]\.[ ]*/, "")
    .replace(/[–—]/g, "-")
    .trim();
}

function normalizeMunicipality(value: string): string {
  return normalizeText(value).replace(/\s*\([a-z]{2}\)\s*$/i, "").trim();
}

function equivalentText(fieldId: string, value: string): string {
  const normalized = normalizeText(value);
  if (fieldId === "beneficiario.titolo") {
    if (normalized === "proprietario o comproprietario") return "proprietario / comproprietario";
    if (normalized === "detentore o affittuario") return "detentore / affittuario";
    if (normalized === "familiare o convivente") return "familiare / convivente";
  }
  if (fieldId === "immobile.tipologia") {
    if (/edificio a schiera e condominio fino a tre piani/.test(normalized)) return "edificio fino a 3 piani";
    if (/edificio a schiera e condominio oltre tre piani/.test(normalized)) return "edificio oltre 3 piani (4+)";
  }
  if (fieldId === "impianto.generatore") {
    if (normalized === "caldaia ad acqua calda standard") return "acqua calda standard";
    if (normalized === "caldaia a gas a condensazione") return "gas a condensazione";
    if (normalized === "pompa di calore / impianto geotermico") return "impianto geotermico";
    if (normalized === "altro (energia elettrica)") return "energia elettrica";
  }
  return normalized;
}

function sameValue(fieldId: string, mappedValue: string, completedValue: string): boolean {
  if (NUMERIC_FIELD.test(fieldId)) {
    const left = numeric(mappedValue);
    const right = numeric(completedValue);
    return left !== null && right !== null && Math.abs(left - right) < 0.005;
  }
  if (DATE_FIELD.test(fieldId)) return normalizeDate(mappedValue) === normalizeDate(completedValue);
  if (/^(?:beneficiario\.(?:comune_nascita|comune_residenza)|immobile\.comune)$/.test(fieldId)) {
    return normalizeMunicipality(mappedValue) === normalizeMunicipality(completedValue);
  }
  return equivalentText(fieldId, mappedValue) === equivalentText(fieldId, completedValue);
}

function splitStreetAndCivic(value: string): { street: string; civic: string } | null {
  const match = value.trim().match(/^(.+?)\s+([0-9][0-9A-Za-z./-]*)$/);
  if (!match) return null;
  return { street: match[1].trim(), civic: match[2].trim() };
}

function parseAddressBlock(
  value: string | null,
): { street: string; civic: string; cap: string; municipality: string } | null {
  if (!value) return null;
  const match = value.match(/^(.+?)\s+-\s+(\d{5})\s+(.+?)(?:\s+\([A-Z]{2}\))?$/i);
  if (!match) return null;
  const street = splitStreetAndCivic(match[1]);
  if (!street) return null;
  return {
    street: street.street,
    civic: street.civic,
    cap: match[2],
    municipality: match[3].trim(),
  };
}

/**
 * Estrae dal PDF finale ENEA i campi scritti dal workflow e i valori derivati
 * dal portale che servono a verificare il contratto tecnico osservato. I dati
 * climatici restano evidenza storica: non vengono trasformati in default del CRM.
 */
export function parseCompletedEneaText(text: string): CompletedEneaSnapshot {
  const source = compact(text);
  const fields: Record<string, string> = {};

  // Il PDF ENEA reale ripete lo stesso CPID in intestazione e nel footer. Un
  // documento concatenato/misto con CPID diversi non deve invece essere usato
  // come ground truth: raccogliamo tutte le occorrenze strutturate e accettiamo
  // il CPID soltanto quando, dopo la deduplica, ne resta esattamente uno.
  const cpids = [...new Set(
    Array.from(
      source.matchAll(/\bCPID\s+([A-Z0-9-]+)(?:\s+Data chiusura|\s+del\s+)/gi),
      (match) => match[1].trim().toUpperCase(),
    ),
  )];
  const cpid = cpids.length === 1 ? cpids[0] : null;
  set(fields, "intervento.tipo", capture(source, /\b(Comma\s+345B\s+-\s+Schermature solari)\b/i));

  const worksAddress = parseAddressBlock(capture(
    source,
    /Indirizzo:\s+(.+?)\s+Scala:/i,
  ));
  if (worksAddress) {
    fields["immobile.indirizzo"] = worksAddress.street;
    fields["immobile.civico"] = worksAddress.civic;
    fields["immobile.cap"] = worksAddress.cap;
    fields["immobile.comune"] = worksAddress.municipality;
  }

  set(fields, "immobile.codice_comune", capture(source, /Codice nazionale del Comune:\s*([A-Z0-9]+)\s+Sezione:/i));
  set(fields, "immobile.foglio", capture(source, /Foglio:\s*([^\s]+)\s+Particella:/i));
  set(fields, "immobile.mappale", capture(source, /Particella:\s*([^\s]+)\s+Subalterno:/i));
  set(fields, "immobile.subalterno", capture(source, /Subalterno:\s*([^\s]+)\s+2\. Anno di costruzione/i));
  set(fields, "immobile.anno", capture(source, /Anno di costruzione(?: inserire anche se stimato)?\s+(\d{4})/i));
  set(fields, "immobile.superficie", capture(source, /Superficie utile \[m²\][^0-9]*([0-9]+(?:[.,][0-9]+)?)/i));
  set(fields, "immobile.zona_climatica", capture(source, /(?:11\.\s*)?Zona climatica\s+([A-F])\b/i));
  set(fields, "immobile.gradi_giorno", capture(source, /(?:12\.\s*)?Gradi giorno\s+([0-9]+)\b/i));
  set(fields, "immobile.fascia_solare", capture(source, /(?:13\.\s*)?Fascia solare\s+([0-9]+)\b/i));
  set(fields, "immobile.unita", capture(
    source,
    /2\. Unità immobiliari Numero totale delle unità immobiliari dell'edificio alla fine dei lavori\s+([0-9]+)/i,
  ));

  set(fields, "beneficiario.nome", capture(source, /Proprietario o detentore dell'edificio o avente diritto\s+Nome:\s*(.+?)\s+Cognome:/i));
  set(fields, "beneficiario.cognome", capture(source, /\sCognome:\s*(.+?)\s+Codice fiscale:/i));
  set(fields, "beneficiario.cf", capture(source, /Codice fiscale:\s*([A-Z0-9]{11,16})\s+Sesso:/i));
  set(fields, "beneficiario.sesso", capture(source, /Sesso:\s*([MF])\s+Data di nascita:/i));
  set(fields, "beneficiario.data_nascita", capture(source, /Data di nascita:\s*(\d{2}\/\d{2}\/\d{4})\s+Comune di nascita:/i));
  set(fields, "beneficiario.comune_nascita", capture(source, /Comune di nascita:\s*(.+?)\s+Residenza:/i));

  const residence = parseAddressBlock(capture(
    source,
    /Residenza:\s+(.+?)\s+4\. Altri beneficiari/i,
  ));
  if (residence) {
    fields["beneficiario.indirizzo_residenza"] = residence.street;
    fields["beneficiario.civico_residenza"] = residence.civic;
    fields["beneficiario.cap_residenza"] = residence.cap;
    fields["beneficiario.comune_residenza"] = residence.municipality;
  }

  const physicalBeneficiaries = source.match(
    /4\. Altri beneficiari \(persone fisiche\)\s*(.*?)\s*5\. Altri beneficiari \(persone giuridiche\)/i,
  );
  const legalBeneficiaries = source.match(
    /5\. Altri beneficiari \(persone giuridiche\)\s*(.*?)\s*6\. Titolo di possesso/i,
  );
  if (physicalBeneficiaries && legalBeneficiaries) {
    const hasOtherBeneficiaries = Boolean(
      compact(physicalBeneficiaries[1]) || compact(legalBeneficiaries[1]),
    );
    fields["beneficiario.cointestazione"] = hasOtherBeneficiaries ? "Sì" : "No";
  }

  set(fields, "beneficiario.titolo", capture(source, /6\. Titolo di possesso\s+(.+?)\s+7\. Destinazione d'uso generale/i));
  set(fields, "immobile.destinazione_generale", capture(source, /7\. Destinazione d'uso generale\s+(.+?)\s+8\. Destinazione d'uso particolare/i));
  set(fields, "immobile.destinazione_particolare", capture(source, /8\. Destinazione d'uso particolare\s+(.+?)\s+9\. Tipologia edilizia/i));
  set(fields, "immobile.tipologia", capture(source, /9\. Tipologia edilizia\s+(.+?)\s+10\. Superficie utile/i));

  set(fields, "intervento.ambito", capture(source, /Intervento su\s+(.+?)\s+2\. Unità immobiliari/i));
  set(fields, "intervento.unita_oggetto", capture(source, /Numero di unità immobiliari oggetto dell'intervento per cui si chiede la detrazione.*?Si considera la situazione catastale all'inizio dei lavori\s+([0-9]+)/i));
  set(fields, "intervento.accorpamenti", capture(source, /Si sono verificati degli accorpamenti di unità immobiliari\?.*?presente scheda descrittiva\s+(Sì|Si|No)/i));
  set(fields, "intervento.data_inizio", capture(source, /Data d'inizio dei lavori\s+(\d{2}\/\d{2}\/\d{4})/i));
  set(fields, "intervento.data_fine", capture(source, /Data di ultimazione dei lavori \(collaudo\)\s+(\d{2}\/\d{2}\/\d{4})/i));
  set(fields, "impianto.tipo", capture(source, /1\. Tipo di impianto Indicare la tipologia prevalente\s+(.+?)\s+2\. Terminali di erogazione/i));
  set(fields, "impianto.terminali", capture(source, /2\. Terminali di erogazione Indicare la tipologia prevalente\s+(.+?)\s+3\. Tipo di distribuzione/i));
  set(fields, "impianto.combustibile", capture(source, /6\. Vettore energetico Indicare la tipologia prevalente\s+(.+?)\s+7\. Impianto di climatizzazione estiva/i));
  set(fields, "impianto.condizionamento", capture(source, /7\. Impianto di climatizzazione estiva\s+(Sì|Si|No)/i));

  const generator = source.match(/(Caldaia ad acqua calda standard|Caldaia ad acqua calda a bassa temperatura|Caldaia a gas a condensazione|Caldaia a gasolio a condensazione|Pompa di calore \/ Impianto geotermico|Generatore aria calda|Scambiatore per teleriscaldamento|Caldaia a biomassa|Altro \([^)]+\))\s+([0-9]+)\s+[^=]{0,12}=\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (generator) {
    fields["impianto.generatore"] = generator[1];
    fields["impianto.numero_generatori"] = generator[2];
    fields["impianto.rendimento"] = generator[3];
    fields["impianto.potenza"] = generator[4];
  }

  const screeningStart = source.indexOf("Scheda intervento SS. Schermature solari");
  const screeningEnd = source.indexOf("Spese congrue sostenute", screeningStart);
  const screeningText = screeningStart >= 0
    ? source.slice(screeningStart, screeningEnd > screeningStart ? screeningEnd : undefined)
    : "";
  // Conta le righe numerate anche quando la tipologia non e' supportata, ma
  // pretende la struttura "etichetta testuale + Interna/Esterna + superficie".
  // Cosi i numeri interi dei dati tecnici (es. superficie finestrata "3" seguita
  // da "Sud" quando Rsupp e' assente) non diventano falsi ordinali; una tipologia
  // sconosciuta con struttura ENEA resta invece nel conteggio e forza fail-closed.
  const screeningRowPattern = /(?:^|\s)(\d{1,3})\s+(?=[A-Za-zÀ-ÿ][^0-9]{0,140}\s+(?:Interna|Esterna)\s+[0-9])/g;
  const screeningOrdinals = Array.from(screeningText.matchAll(screeningRowPattern), (match) => Number(match[1]));
  // Rsupp e gTot non sono simmetrici: nelle schermature solari il gTot e'
  // prestazione necessaria mentre Rsupp puo' essere assente; nelle chiusure
  // oscuranti la Rsupp e' necessaria e il gTot puo' essere assente. Il parser
  // deve riflettere il workflow official e non scartare PDF conclusivi validi.
  const screeningPattern = /(\d+)\s+(Persiana avvolgibile|Persiana|Tenda o veneziana|Schermatura integrata \(veneziana nella vetrocamera\)|Altra schermatura solare|Altra chiusura oscurante)\s+(Interna|Esterna)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)(?:\s+([0-9]+(?:[.,][0-9]+)?))?\s+(Nord-Est|Sud-Est|Sud-Ovest|Nord-Ovest|P-orizzontale|Nord|Est|Sud|Ovest)\s+(Dichiarato dal fornitore|Dalla tabella del programma Chiusure oscuranti(?:\(\*\))?|Calcolato secondo UNI EN 13125)(?:\s+([0-9]+(?:[.,][0-9]+)?))?\s+(Tessuto|Legno|Plastica|PVC|Metallo|Misto|Altro)\s+(Manuale|Automatico|Servoassistito)/gi;
  const parsedScreeningOrdinals: number[] = [];
  const darkeningClosureTypes = new Set(["Persiana", "Persiana avvolgibile", "Altra chiusura oscurante"]);
  const northExposures = new Set(["Nord", "Nord-Est", "Nord-Ovest"]);
  for (const match of screeningText.matchAll(screeningPattern)) {
    const ordinal = Number(match[1]);
    const index = ordinal - 1;
    if (!Number.isInteger(index) || index < 0) continue;
    const type = match[2];
    const rsupp = match[6] ?? null;
    const exposure = match[7];
    const gtot = match[9] ?? null;
    const isDarkeningClosure = darkeningClosureTypes.has(type);
    // Non trasformiamo l'opzionalita' in assenza di controllo: la prestazione
    // primaria resta obbligatoria in base al tipo di schermatura.
    if ((isDarkeningClosure && !rsupp) || (!isDarkeningClosure && !gtot)) continue;
    // Per le schermature solari ENEA esclude Nord, Nord-Est e Nord-Ovest;
    // per le chiusure oscuranti (persiane/avvolgibili/altre chiusure) sono
    // invece ammesse tutte le esposizioni. L'audit storico deve rispettare
    // questa distinzione e restare fail-closed sulle combinazioni non valide.
    if (northExposures.has(exposure) && !isDarkeningClosure) continue;
    parsedScreeningOrdinals.push(ordinal);
    fields[`schermature.${index}.tipo`] = type;
    fields[`schermature.${index}.installazione`] = match[3];
    fields[`schermature.${index}.superficie`] = match[4];
    fields[`schermature.${index}.superficie_finestrata`] = match[5];
    set(fields, `schermature.${index}.rsupp`, rsupp);
    fields[`schermature.${index}.esposizione`] = exposure;
    fields[`schermature.${index}.modalita_calcolo`] = match[8].startsWith("Dalla tabella del programma Chiusure oscuranti")
      ? "Dalla tabella del programma Chiusure oscuranti(*)"
      : match[8];
    set(fields, `schermature.${index}.gtot`, gtot);
    fields[`schermature.${index}.materiale`] = match[10];
    fields[`schermature.${index}.regolazione`] = match[11];
  }
  const uniqueScreeningOrdinals = new Set(screeningOrdinals);
  const uniqueParsedScreeningOrdinals = new Set(parsedScreeningOrdinals);
  const orderedScreeningOrdinals = [...uniqueScreeningOrdinals].sort((left, right) => left - right);
  const screeningStructureValid = screeningOrdinals.length > 0
    && screeningOrdinals.length === uniqueScreeningOrdinals.size
    && orderedScreeningOrdinals.every((ordinal, index) => ordinal === index + 1)
    && uniqueParsedScreeningOrdinals.size === uniqueScreeningOrdinals.size
    && orderedScreeningOrdinals.every((ordinal) => uniqueParsedScreeningOrdinals.has(ordinal));
  // -1 e' un sentinel fail-safe: indica che il PDF contiene righe schermatura
  // numerate ma il parser non le ha lette tutte in modo univoco e consecutivo.
  // In audit il confronto con schermature.numero fallira' invece di certificare
  // per errore un PDF parzialmente interpretato.
  const screeningCount = screeningStructureValid ? orderedScreeningOrdinals.length : -1;
  set(fields, "schermature.spesa", capture(source, /Spese congrue sostenute \[€\]\s+([0-9]+(?:[.,][0-9]+)?)/i));
  set(fields, "schermature.risparmio_energia", capture(
    source,
    /2\. Risparmio stimato di energia primaria non rinnovabile \[kWh\/anno\].*?([0-9]+(?:[.,][0-9]+)?)\s+Il documento originale cartaceo/i,
  ));

  return { cpid, fields, screeningCount };
}

export function compareMappedToCompletedEnea(
  mapped: EneaLabMappedPractice,
  completed: CompletedEneaSnapshot,
  path = "",
): CompletedEneaAuditResult {
  const mappedFields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const differences: CompletedEneaDifference[] = [];
  const matchedFieldIds: string[] = [];
  const matchedValues: CompletedEneaMatchedValue[] = [];
  let compared = 0;
  let matches = 0;

  // Il PDF storico contiene una riga numerata per ogni schermatura. Il solo
  // confronto dei campi presenti nel PDF non rileverebbe eventuali elementi
  // extra nel mapper (o righe perse dal parser): il numero totale e' quindi
  // una prova strutturale obbligatoria, trattata come un normale campo audit.
  const mappedScreeningCount = mappedFields.get("schermature.numero");
  const completedScreeningCount = String(completed.screeningCount);
  compared += 1;
  if (
    mappedScreeningCount?.status === "ready"
    && !mappedScreeningCount.testOnly
    && sameValue("schermature.numero", mappedScreeningCount.value, completedScreeningCount)
  ) {
    matches += 1;
    matchedFieldIds.push("schermature.numero");
    matchedValues.push({
      fieldId: "schermature.numero",
      completedValue: completedScreeningCount,
      mappedValue: mappedScreeningCount.value,
    });
  } else {
    differences.push({
      fieldId: "schermature.numero",
      completedValue: completedScreeningCount,
      mappedValue: !mappedScreeningCount
        ? "Campo non disponibile"
        : mappedScreeningCount.status === "missing"
          ? "Intervento umano richiesto"
          : mappedScreeningCount.value,
    });
  }

  for (const [fieldId, completedValue] of Object.entries(completed.fields)) {
    // Codice comunale, zona climatica, gradi giorno e fascia solare sono dati
    // osservati nel PDF finale ma derivati dal Comune dal portale ENEA. Restano
    // evidenza storica del contratto reale, senza essere attribuiti al mapper né
    // trasformati in falsi mismatch su campi che il workflow non deve scrivere.
    if (PORTAL_DERIVED_EVIDENCE_FIELDS.has(fieldId)) continue;
    const field = mappedFields.get(fieldId);
    compared += 1;
    if (!field) {
      differences.push({
        fieldId,
        completedValue,
        mappedValue: "Campo non disponibile",
      });
      continue;
    }
    if (field.status === "ready" && !field.testOnly && sameValue(fieldId, field.value, completedValue)) {
      matches += 1;
      matchedFieldIds.push(fieldId);
      matchedValues.push({ fieldId, completedValue, mappedValue: field.value });
      continue;
    }
    differences.push({
      fieldId,
      completedValue,
      mappedValue: field.status === "missing" ? "Intervento umano richiesto" : field.value,
    });
  }

  return {
    path,
    cpid: completed.cpid,
    compared,
    matches,
    mismatches: differences.length,
    differences,
    matchedFieldIds,
    matchedValues,
  };
}

/** Download read-only del primo PDF conclusivo valido e confronto col mapper corrente. */
export async function auditCompletedEneaPractice(
  client: SupabaseClient<Database>,
  mapped: EneaLabMappedPractice,
): Promise<CompletedEneaAuditResult> {
  const paths = mapped.source.completedEneaPaths ?? [];
  if (!paths.length) throw new Error("Nessun PDF ENEA conclusivo associato alla pratica.");

  for (const path of paths) {
    if (!path.startsWith(`${mapped.source.id}/`) || !/\.pdf$/i.test(path)) continue;
    const { data, error } = await client.storage.from("enea-documents").download(path);
    if (error || !data) continue;
    if (data.size > 20 * 1024 * 1024) continue;
    const completed = parseCompletedEneaText(await extractPdfText(data));
    if (Object.keys(completed.fields).length) return compareMappedToCompletedEnea(mapped, completed, path);
  }

  throw new Error("Nessun PDF ENEA conclusivo leggibile per l'audit.");
}
