import { createHash } from "node:crypto";
import type { AprCrmIntegrationCommand, AprCrmOperatorRequest } from "./aprCrmIntegrationContract";

export interface LocalCrmSimulationState {
  revision: number;
  customers: Record<string, { pipeline: string; status: string; artifacts: string[]; crmRevision?: number; operatorRequest?: AprCrmOperatorRequest }>;
  existingAutomations: readonly string[];
  crmDashboardIntegration: readonly string[];
  processedIdempotencyKeys: string[];
  audit: Array<{ idempotencyKey: string; customerId: string; commandKind: string; before: unknown; after: unknown; reason?: string; appliedRuleIds: readonly string[] }>;
}
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function applyAprCommandLocally(state: LocalCrmSimulationState, command: AprCrmIntegrationCommand): LocalCrmSimulationState {
  if (command.externalActionAllowed !== false || command.execution !== "local_simulation_only" || command.kind !== "move_customer") {
    throw new Error("Comando esterno/futuro vietato nella simulazione APR locale.");
  }
  if (state.processedIdempotencyKeys.includes(command.idempotencyKey)) return structuredClone(state);
  const customer = state.customers[command.customerId]; if (!customer) throw new Error("Cliente simulato assente.");
  const customerRevision = customer.crmRevision ?? state.revision;
  if (customer.pipeline !== command.expected.pipeline || customer.status !== command.expected.status || customerRevision !== command.expected.crmRevision) throw new Error("Conflitto revisione/stato CRM simulato: nessuna mutazione applicata.");
  const automationsBefore = fingerprint(state.existingAutomations); const dashboardBefore = fingerprint(state.crmDashboardIntegration);
  const next = structuredClone(state); const before = structuredClone(customer);
  next.customers[command.customerId].pipeline = command.desired.pipeline; next.customers[command.customerId].status = command.desired.status;
  next.customers[command.customerId].crmRevision = customerRevision + 1;
  if (command.desired.operatorRequest) next.customers[command.customerId].operatorRequest = structuredClone(command.desired.operatorRequest);
  if (command.desired.clearOperatorRequest) delete next.customers[command.customerId].operatorRequest;
  next.revision += 1; next.processedIdempotencyKeys.push(command.idempotencyKey);
  next.audit.push({ idempotencyKey: command.idempotencyKey, customerId: command.customerId, commandKind: command.kind, before,
    after: structuredClone(next.customers[command.customerId]), reason: command.reason, appliedRuleIds: command.appliedRuleIds });
  if (fingerprint(next.existingAutomations) !== automationsBefore || fingerprint(next.crmDashboardIntegration) !== dashboardBefore) throw new Error("Invariante CRM violata.");
  return next;
}

export function compensateAprCommandLocally(state: LocalCrmSimulationState, command: AprCrmIntegrationCommand): LocalCrmSimulationState {
  const next = structuredClone(state); const customer = next.customers[command.customerId]; if (!customer) throw new Error("Cliente simulato assente.");
  customer.pipeline = command.compensation.pipeline; customer.status = command.compensation.status; next.revision += 1;
  customer.crmRevision = (customer.crmRevision ?? command.expected.crmRevision + 1) + 1;
  if (command.compensation.operatorRequest) customer.operatorRequest = structuredClone(command.compensation.operatorRequest); else delete customer.operatorRequest;
  next.audit.push({ idempotencyKey: `${command.idempotencyKey}:compensate`, customerId: command.customerId, commandKind: "compensate", before: command.desired,
    after: structuredClone(customer), reason: `Compensazione locale: ${command.reason}`, appliedRuleIds: command.appliedRuleIds }); return next;
}
