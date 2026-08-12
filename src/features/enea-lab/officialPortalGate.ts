import { buildEneaOfficialPortalWorkflowScript, type EneaPortalWorkflowPreparation } from "./portalWorkflow";
import type { EneaLabMappedPractice, EneaLabPayload } from "./types";

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

function hasConsistentOfficialPayload(payload: EneaLabPayload): boolean {
  if (!payload.portalFields.length) return false;
  if (payload.portalFields.some((field) => field.testOnly || isInternalPlaceholder(field.value))) return false;

  const fieldIds = Object.keys(payload.fields).sort();
  const portalFieldIds = payload.portalFields.map((field) => field.id).sort();
  if (fieldIds.length !== portalFieldIds.length) return false;
  return fieldIds.every((fieldId, index) => fieldId === portalFieldIds[index]);
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
): EneaOfficialPortalGate {
  if (!packageCurrent) {
    return { status: "blocked", reason: "package-not-current", workflow: null };
  }
  if (payload.mode !== "official") {
    return { status: "blocked", reason: "payload-not-official", workflow: null };
  }
  if (!payload.readyForOfficialSubmission || payload.interventionRequired.length > 0) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasConsistentOfficialPayload(payload)) {
    return { status: "blocked", reason: "payload-inconsistent", workflow: null };
  }

  const workflow = buildEneaOfficialPortalWorkflowScript(mapped);
  return workflow.mode === "official"
    ? { status: "ready", reason: null, workflow }
    : { status: "blocked", reason: "payload-inconsistent", workflow: null };
}
