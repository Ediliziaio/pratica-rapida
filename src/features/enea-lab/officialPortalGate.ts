import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import { buildEneaOfficialPortalWorkflowScript, type EneaPortalWorkflowPreparation } from "./portalWorkflow";
import type { EneaLabDocumentAnalysis, EneaLabMappedPractice, EneaLabPayload } from "./types";

export type EneaOfficialPortalGateReason =
  | "package-not-current"
  | "payload-not-official"
  | "official-data-incomplete"
  | "payload-inconsistent";

export type EneaOfficialPortalGate =
  | {
      status: "blocked";
      reason: EneaOfficialPortalGateReason;
      workflow: null;
    }
  | {
      status: "ready";
      reason: null;
      workflow: EneaPortalWorkflowPreparation;
    };

function isInternalPlaceholder(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("it");
  return normalized === "non indicato" || normalized === "intervento umano richiesto";
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  if (normalizedLeft.length !== left.length || normalizedRight.length !== right.length) return false;
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function samePortalFields(
  left: EneaLabPayload["portalFields"],
  right: EneaLabPayload["portalFields"],
): boolean {
  if (left.length !== right.length) return false;
  if (new Set(left.map((field) => field.id)).size !== left.length) return false;

  const expectedById = new Map(right.map((field) => [field.id, field]));
  return left.every((field) => {
    const expected = expectedById.get(field.id);
    return Boolean(expected)
      && field.label === expected?.label
      && field.sectionId === expected?.sectionId
      && field.sectionTitle === expected?.sectionTitle
      && field.value === expected?.value
      && field.source === expected?.source
      && field.testOnly === expected?.testOnly;
  });
}

function hasConsistentOfficialPayload(mapped: EneaLabMappedPractice, payload: EneaLabPayload): boolean {
  if (payload.practiceCode !== mapped.source.code) return false;
  if (!payload.portalFields.length) return false;
  if (payload.portalFields.some((field) => field.testOnly || isInternalPlaceholder(field.value))) return false;

  // Ricostruisce localmente la parte deterministica del payload ufficiale dal
  // mapping corrente. Il gate non deve fidarsi di un JSON copiato, alterato o
  // appartenente a un'altra pratica anche se espone flag di readiness validi.
  const expected = buildEneaPayload(mapped, [], "official", new Date(0));
  return sameStringRecord(payload.fields, expected.fields)
    && samePortalFields(payload.portalFields, expected.portalFields)
    && sameStringSet(payload.excludedTestFields, expected.excludedTestFields)
    && sameStringSet(payload.excludedUnverifiedFields, expected.excludedUnverifiedFields);
}

function hasManuallyVerifiedEligibleExpense(mapped: EneaLabMappedPractice): boolean {
  const expense = mapped.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.spesa");
  return expense?.status === "ready" && expense.source === "Inserimento operatore";
}

/**
 * Ultima barriera locale prima del collaudo sul portale reale.
 * Non apre ENEA e non esegue il comando: restituisce il workflow ufficiale
 * soltanto se il pacchetto corrente e il payload ufficiale sono coerenti.
 */
export function prepareEneaOfficialPortalCollaudo(
  mapped: EneaLabMappedPractice,
  payload: EneaLabPayload,
  packageCurrent: boolean,
  analysis?: EneaLabDocumentAnalysis,
): EneaOfficialPortalGate {
  if (!packageCurrent) {
    return { status: "blocked", reason: "package-not-current", workflow: null };
  }
  if (payload.mode !== "official") {
    return { status: "blocked", reason: "payload-not-official", workflow: null };
  }

  // L'audit storico ha mostrato che il totale fiscale della fattura può non
  // coincidere con la "spesa congrua sostenuta" effettivamente riportata nel
  // riepilogo ENEA conclusivo. Il totale estratto resta quindi una proposta di
  // lavoro: prima del portale reale la spesa deve essere riscritta/verificata
  // esplicitamente dall'operatore, non soltanto ereditata dal parser.
  if (!hasManuallyVerifiedEligibleExpense(mapped)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }

  // I flag del payload sono una rappresentazione derivata e non una fonte di
  // verità. Prima del collaudo ricontrolliamo direttamente mapping e analisi
  // documentale correnti: un JSON con readiness manipolata o un blocker emerso
  // dai documenti non deve poter essere escluso dal gate finale.
  const independentBlockers = validatePreparedPractice(mapped.source, mapped, analysis)
    .filter((issue) => issue.severity === "blocker");
  if (
    independentBlockers.length > 0
    || !payload.readyForOfficialSubmission
    || payload.interventionRequired.length > 0
  ) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasConsistentOfficialPayload(mapped, payload)) {
    return { status: "blocked", reason: "payload-inconsistent", workflow: null };
  }

  const workflow = buildEneaOfficialPortalWorkflowScript(mapped);
  return workflow.mode === "official"
    ? { status: "ready", reason: null, workflow }
    : { status: "blocked", reason: "payload-inconsistent", workflow: null };
}
