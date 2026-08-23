import { buildEneaPayload, fingerprintPreparedPractice, validatePreparedPractice } from "./preparation";
import { buildEneaPortalWorkflowScript, type EneaPortalWorkflowPreparation } from "./portalWorkflow";
import type { EneaLabIssue, EneaLabMappedPractice, EneaLabPayload } from "./types";

export type EneaTestDraftPortalGate =
  | { status: "blocked"; reason: "package-not-current" | "payload-not-test-draft" | "draft-data-incomplete" | "payload-inconsistent" | "unsafe-workflow" | "workflow-incomplete"; workflow: null; fingerprint: null }
  | { status: "ready"; reason: null; workflow: EneaPortalWorkflowPreparation; fingerprint: string };

function stablePayload(payload: EneaLabPayload) {
  return JSON.stringify({
    mode: payload.mode,
    practiceCode: payload.practiceCode,
    fields: payload.fields,
    portalFields: payload.portalFields,
    excludedTestFields: payload.excludedTestFields,
    excludedUnverifiedFields: payload.excludedUnverifiedFields,
  });
}

/**
 * Gate dedicato alle pratiche TEST. Consente soltanto la preparazione dei campi
 * della futura bozza: il workflow restituito non salva, non apre anteprima e
 * non invia. Il salvataggio sarà una capability separata e auditata.
 */
export function prepareEneaTestDraftPortalCollaudo(
  mapped: EneaLabMappedPractice,
  issues: EneaLabIssue[],
  payload: EneaLabPayload,
  packageCurrent: boolean,
): EneaTestDraftPortalGate {
  if (!packageCurrent) return { status: "blocked", reason: "package-not-current", workflow: null, fingerprint: null };
  if (payload.mode !== "draft_test") return { status: "blocked", reason: "payload-not-test-draft", workflow: null, fingerprint: null };
  const independentIssues = validatePreparedPractice(mapped.source, mapped);
  const blockers = [...issues, ...independentIssues].filter((issue) => issue.severity === "blocker");
  if (blockers.length || !payload.readyForDraftSave || payload.interventionRequired.length) {
    return { status: "blocked", reason: "draft-data-incomplete", workflow: null, fingerprint: null };
  }
  const expected = buildEneaPayload(mapped, [], "draft_test", new Date(0));
  if (stablePayload(payload) !== stablePayload(expected)) {
    return { status: "blocked", reason: "payload-inconsistent", workflow: null, fingerprint: null };
  }
  const workflow = buildEneaPortalWorkflowScript(mapped, "test");
  if (/\.submit\s*\(|\bpreview\b|\banteprima\b|\binvia\b/i.test(workflow.script)) {
    return { status: "blocked", reason: "unsafe-workflow", workflow: null, fingerprint: null };
  }
  const prepared = new Set(workflow.preparedFieldIds);
  if (payload.portalFields.some(({ id }) => !prepared.has(id))) {
    return { status: "blocked", reason: "workflow-incomplete", workflow: null, fingerprint: null };
  }
  return {
    status: "ready",
    reason: null,
    workflow,
    fingerprint: `${fingerprintPreparedPractice(mapped, issues)}:${payload.portalFields.length}:${workflow.screeningItemCount}`,
  };
}
