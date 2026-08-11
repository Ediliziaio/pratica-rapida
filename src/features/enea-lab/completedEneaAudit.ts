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
}

const NUMERIC_FIELD = /^(?:immobile\.(?:superficie|gradi_giorno)|intervento\.(?:unita_totali|unita_oggetto)|impianto\.(?:numero_generatori|rendimento|potenza)|schermature\.spesa|schermature\.\d+\.(?:superficie|superficie_finestrata|gtot))$/;
const DATE_FIELD = /^intervento\.(?:data_inizio|data_fine)$/;

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

function sameValue(fieldId: string, mappedValue: string, completedValue: string): boolean {
  if (NUMERIC_FIELD.test(fieldId)) {
    const left = numeric(mappedValue);
    const right = numeric(completedValue);
    return left !== null && right !== null && Math.abs(left - right) < 0.005;
  }
  if (DATE_FIELD.test(fieldId)) return normalizeDate(mappedValue) === normalizeDate(completedValue);
  return normalizeText(mappedValue) === normalizeText(completedValue);
}

/**
 * Estrae dal PDF finale ENEA soltanto i campi che il workflow del laboratorio
 * prova a scrivere. I valori calcolati dal portale (per esempio Rsupp) restano
 * fuori dall'audit per evitare falsi errori.
 */
export function parseCompletedEneaText(text: string): CompletedEneaSnapshot {
  const source = compact(text);
  const fields: Record<string, string> = {};

  const cpid = capture(source, /\bCPID\s+([A-Z0-9-]+)(?:\s+Data chiusura|\s+del\s+)/i);
  set(fields, "immobile.anno", capture(source, /Anno di costruzione(?: inserire anche se stimato)?\s+(\d{4})/i));
  set(fields, "immobile.superficie", capture(source, /Superficie utile \[m²\][^0-9]*([0-9]+(?:[.,][0-9]+)?)/i));
  set(fields, "immobile.zona_climatica", capture(source, /Zona climatica\s+([A-F])\b/i));
  set(fields, "immobile.gradi_giorno", capture(source, /Gradi giorno\s+([0-9]+)\b/i));
  set(fields, "intervento.ambito", capture(source, /Intervento su\s+(.+?)\s+2\. Unità immobiliari/i));
  set(fields, "intervento.unita_totali", capture(source, /Numero totale delle unità immobiliari dell'edificio alla fine dei lavori\s+([0-9]+)/i));
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
    fields["impianto.generatore"] = generator[1].trim();
    fields["impianto.numero_generatori"] = generator[2];
    fields["impianto.rendimento"] = generator[3];
    fields["impianto.potenza"] = generator[4];
  }

  const screeningStart = source.indexOf("Scheda intervento SS. Schermature solari");
  const screeningEnd = source.indexOf("Spese congrue sostenute", screeningStart);
  const screeningText = screeningStart >= 0
    ? source.slice(screeningStart, screeningEnd > screeningStart ? screeningEnd : undefined)
    : "";
  const screeningPattern = /(\d+)\s+(Tenda o veneziana|Altra schermatura solare)\s+(Esterna)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+(Sud-Est|Sud-Ovest|Est|Sud|Ovest)\s+(Dichiarato dal fornitore)\s+([0-9]+(?:[.,][0-9]+)?)\s+(Tessuto|PVC|Metallo|Misto)\s+(Manuale|Automatico)/gi;
  let screeningCount = 0;
  for (const match of screeningText.matchAll(screeningPattern)) {
    const index = Number(match[1]) - 1;
    if (!Number.isInteger(index) || index < 0) continue;
    screeningCount = Math.max(screeningCount, index + 1);
    fields[`schermature.${index}.tipo`] = match[2];
    fields[`schermature.${index}.installazione`] = match[3];
    fields[`schermature.${index}.superficie`] = match[4];
    fields[`schermature.${index}.superficie_finestrata`] = match[5];
    fields[`schermature.${index}.esposizione`] = match[7];
    fields[`schermature.${index}.modalita_calcolo`] = match[8];
    fields[`schermature.${index}.gtot`] = match[9];
    fields[`schermature.${index}.materiale`] = match[10];
    fields[`schermature.${index}.regolazione`] = match[11];
  }
  set(fields, "schermature.spesa", capture(source, /Spese congrue sostenute \[€\]\s+([0-9]+(?:[.,][0-9]+)?)/i));

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
  let compared = 0;
  let matches = 0;

  for (const [fieldId, completedValue] of Object.entries(completed.fields)) {
    const field = mappedFields.get(fieldId);
    if (!field) continue;
    compared += 1;
    if (field.status === "ready" && !field.testOnly && sameValue(fieldId, field.value, completedValue)) {
      matches += 1;
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
