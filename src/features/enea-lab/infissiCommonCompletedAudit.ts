import { parseCompletedEneaText, type CompletedEneaSnapshot } from "./completedEneaAudit";
import { ENEA_INTERVENTION_TYPE } from "./interventionRules";
import type { EneaLabMappedPractice } from "./types";

export interface AprInfissiCommonFieldComparison {
  fieldId: string;
  mappedValue: string;
  completedValue: string;
  status: "match" | "difference" | "not-compared";
}

export interface AprInfissiCommonCompletedAuditResult {
  status: "match" | "difference" | "blocked";
  compared: number;
  matches: number;
  differences: AprInfissiCommonFieldComparison[];
  comparisons: AprInfissiCommonFieldComparison[];
  completed: CompletedEneaSnapshot;
}

const PORTAL_DERIVED = new Set([
  "immobile.codice_comune",
  "immobile.zona_climatica",
  "immobile.gradi_giorno",
  "immobile.fascia_solare",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("it")
    .replace(/[–—]/g, "-");
}

function numeric(value: string): number | null {
  const token = value.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/)?.[0];
  if (!token) return null;
  const parsed = Number(token.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function same(fieldId: string, mapped: string, completed: string): boolean {
  if (/^(?:immobile\.(?:superficie|unita)|intervento\.unita_oggetto|impianto\.(?:numero_generatori|rendimento|potenza))$/.test(fieldId)) {
    const left = numeric(mapped);
    const right = numeric(completed);
    return left !== null && right !== null && Math.abs(left - right) <= 0.01;
  }
  if (/^(?:beneficiario\.data_nascita|intervento\.(?:data_inizio|data_fine))$/.test(fieldId)) {
    const toIso = (value: string) => {
      const it = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return it ? `${it[3]}-${it[2]}-${it[1]}` : value.trim();
    };
    return toIso(mapped) === toIso(completed);
  }
  return normalize(mapped) === normalize(completed);
}

/**
 * Estrae dal PDF ENEA concluso i campi comuni e aggiunge il tipo intervento
 * 345A quando realmente presente nel testo. Non confronta la sezione tecnica
 * Infissi: quella è gestita separatamente riga-per-riga.
 */
export function parseCompletedEneaInfissiCommon(text: string): CompletedEneaSnapshot {
  const completed = parseCompletedEneaText(text);
  if (/Comma\s+345A\s*-\s*Interventi sull'involucro/i.test(text)) {
    completed.fields["intervento.tipo"] = ENEA_INTERVENTION_TYPE.envelope;
  }
  return completed;
}

export function auditInfissiCommonMappingAgainstCompleted(
  mapped: EneaLabMappedPractice,
  completed: CompletedEneaSnapshot,
): AprInfissiCommonCompletedAuditResult {
  if (mapped.source.form.prodotto.tipo !== "infissi") {
    throw new Error("Audit comune Infissi richiede prodotto infissi");
  }
  const mappedFields = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const comparisons: AprInfissiCommonFieldComparison[] = [];

  for (const [fieldId, completedValue] of Object.entries(completed.fields)) {
    if (fieldId.startsWith("schermature.") || PORTAL_DERIVED.has(fieldId)) continue;
    const field = mappedFields.get(fieldId);
    if (!field || field.status !== "ready" || field.testOnly) {
      comparisons.push({
        fieldId,
        mappedValue: field?.value ?? "Campo non disponibile",
        completedValue,
        status: "difference",
      });
      continue;
    }
    comparisons.push({
      fieldId,
      mappedValue: field.value,
      completedValue,
      status: same(fieldId, field.value, completedValue) ? "match" : "difference",
    });
  }

  if (!comparisons.length) {
    return { status: "blocked", compared: 0, matches: 0, differences: [], comparisons, completed };
  }
  const differences = comparisons.filter((item) => item.status === "difference");
  return {
    status: differences.length ? "difference" : "match",
    compared: comparisons.length,
    matches: comparisons.length - differences.length,
    differences,
    comparisons,
    completed,
  };
}
