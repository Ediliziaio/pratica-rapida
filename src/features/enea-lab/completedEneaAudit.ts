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
}

const NUMERIC_FIELD = /^(?:immobile\.superficie|intervento\.unita_oggetto|impianto\.(?:numero_generatori|rendimento|potenza)|schermature\.(?:numero|spesa|risparmio_energia)|schermature\.\d+\.(?:superficie|superficie_finestrata|gtot))$/;
const DATE_FIELD = /^(?:beneficiario\.data_nascita|intervento\.(?:data_inizio|data_fine))$/;

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
  const match = value.replace(/\.(?=\d{3}(?:\D|$))/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
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
 * Estrae dal PDF finale ENEA soltanto i campi che il workflow del laboratorio
 * prova effettivamente a scrivere. I valori caricati/calcolati dal portale
 * (per esempio zona climatica, gradi giorno e Rsupp) restano fuori dall'audit
 * per evitare falsi errori.
 */
export function parseCompletedEneaText(text: string): CompletedEneaSnapshot {
  const source = compact(text);
  const fields: Record<string, string> = {};

  const cpid = capture(source, /\bCPID\s+([A-Z0-9-]+)(?:\s+Data chiusura|\s+del\s+)/i);
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

  set(fields, "immobile.foglio", capture(source, /Foglio:\s*([^\s]+)\s+Particella:/i));
  set(fields, "immobile.mappale", capture(source, /Particella:\s*([^\s]+)\s+Subalterno:/i));
  set(fields, "immobile.subalterno", capture(source, /Subalterno:\s*([^\s]+)\s+2\. Anno di costruzione/i));
  set(fields, "immobile.anno", capture(source, /Anno di costruzione(?: inserire anche se stimato)?\s+(\d{4})/i));
  set(fields, "immobile.superficie", capture(source, /Superficie utile \[m²\][^0-9]*([0-9]+(?:[.,][0-9]+)?)/i));

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

  const generator = source.match(/(?:Caldaia ad acqua calda standard|Caldaia ad acqua calda a bassa temperatura|Caldaia a gas a condensazione|Caldaia a gasolio a condensazione|Pompa di calore \/ Impianto geotermico|Generatore aria calda|Scambiatore per teleriscaldamento|Caldaia a biomassa|Altro \([^)]+\))\s+([0-9]+)\s+[^=]{0,12}=\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (generator) {
    fields["impianto.numero_generatori"] = generator[1];
    fields["impianto.rendimento"] = generator[2];
    fields["impianto.potenza"] = generator[3];
  }

  const screeningStart = source.indexOf("Scheda intervento SS. Schermature solari");
  const screeningEnd = source.indexOf("Spese congrue sostenute", screeningStart);
  const screeningText = screeningStart >= 0
    ? source.slice(screeningStart, screeningEnd > screeningStart ? screeningEnd : undefined)
    : "";
  // Conta qualunque riga numerata che inizi con un'etichetta testuale, non solo
  // i tipi che il parser sa interpretare. Una riga non riconosciuta deve rendere
  // la struttura incompleta invece di sparire dal conteggio e produrre un falso
  // match sul numero schermature.
  const screeningRowPattern = /(?:^|\s)(\d+)\s+(?=[A-Za-zÀ-ÿ])/g;
  const screeningOrdinals = Array.from(screeningText.matchAll(screeningRowPattern), (match) => Number(match[1]));
  const screeningPattern = /(\d+)\s+(Persiana avvolgibile|Persiana|Tenda o veneziana|Schermatura integrata \(veneziana nella vetrocamera\)|Altra schermatura solare|Altra chiusura oscurante)\s+(Interna|Esterna)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+(Nord-Est|Sud-Est|Sud-Ovest|Nord-Ovest|P-orizzontale|Nord|Est|Sud|Ovest)\s+(Dichiarato dal fornitore|Dalla tabella del programma Chiusure oscuranti(?:\(\*\))?|Calcolato secondo UNI EN 13125)\s+([0-9]+(?:[.,][0-9]+)?)\s+(Tessuto|Legno|Plastica|PVC|Metallo|Misto|Altro)\s+(Manuale|Automatico|Servoassistito)/gi;
  const parsedScreeningOrdinals: number[] = [];
  const darkeningClosureTypes = new Set(["Persiana", "Persiana avvolgibile", "Altra chiusura oscurante"]);
  const northExposures = new Set(["Nord", "Nord-Est", "Nord-Ovest"]);
  for (const match of screeningText.matchAll(screeningPattern)) {
    const ordinal = Number(match[1]);
    const index = ordinal - 1;
    if (!Number.isInteger(index) || index < 0) continue;
    const type = match[2];
    const exposure = match[7];
    // Per le schermature solari ENEA esclude Nord, Nord-Est e Nord-Ovest;
    // per le chiusure oscuranti (persiane/avvolgibili/altre chiusure) sono
    // invece ammesse tutte le esposizioni. L'audit storico deve rispettare
    // questa distinzione e restare fail-closed sulle combinazioni non valide.
    if (northExposures.has(exposure) && !darkeningClosureTypes.has(type)) continue;
    parsedScreeningOrdinals.push(ordinal);
    fields[`schermature.${index}.tipo`] = type;
    fields[`schermature.${index}.installazione`] = match[3];
    fields[`schermature.${index}.superficie`] = match[4];
    fields[`schermature.${index}.superficie_finestrata`] = match[5];
    fields[`schermature.${index}.esposizione`] = exposure;
    fields[`schermature.${index}.modalita_calcolo`] = match[8].startsWith("Dalla tabella del programma Chiusure oscuranti")
      ? "Dalla tabella del programma Chiusure oscuranti(*)"
      : match[8];
    fields[`schermature.${index}.gtot`] = match[9];
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