import type { AprInfissiIntakeFields } from "./infissiIntake";
import {
  compareInfissiIntakeToCompleted,
  type CompletedEneaInfissiSnapshot,
  type InfissiAggregateComparison,
} from "./completedEneaInfissi";

export type AprInfissiHistoricalAuditStatus = "match" | "blocked" | "difference" | "error";

export type AprInfissiHistoricalAuditBlocker =
  | "completed-enea-items-missing"
  | "completed-enea-expense-missing"
  | "completed-enea-item-order-invalid"
  | "completed-enea-numeric-value-invalid"
  | "completed-enea-installation-unobserved"
  | "completed-enea-darkening-closure-unobserved"
  | "aggregate-field-mixed"
  | "aggregate-field-missing"
  | "aggregate-field-mismatch";

export interface AprInfissiHistoricalAuditResult {
  status: AprInfissiHistoricalAuditStatus;
  blockers: AprInfissiHistoricalAuditBlocker[];
  comparisons: InfissiAggregateComparison[];
  itemCount: number;
  expense: number | null;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function hasSequentialOrdinals(snapshot: CompletedEneaInfissiSnapshot): boolean {
  return snapshot.items.every((item, index) => item.ordinal === index + 1);
}

/**
 * Converte un PDF ENEA infissi già concluso in ground truth verificabile.
 *
 * Il risultato resta completamente read-only: non produce selettori, script o
 * valori da scrivere nel portale. Serve a congelare ciò che ENEA ha realmente
 * accettato per una pratica storica e a distinguere divergenze reali da campi
 * che il CRM aggrega in modo meno granulare (per esempio vetri vecchi misti).
 */
export function auditHistoricalInfissi(
  intake: AprInfissiIntakeFields,
  snapshot: CompletedEneaInfissiSnapshot,
): AprInfissiHistoricalAuditResult {
  const blockers: AprInfissiHistoricalAuditBlocker[] = [];

  if (snapshot.items.length === 0) blockers.push("completed-enea-items-missing");
  if (!isPositiveFinite(snapshot.expense ?? Number.NaN)) {
    blockers.push("completed-enea-expense-missing");
  }
  if (snapshot.items.length > 0 && !hasSequentialOrdinals(snapshot)) {
    blockers.push("completed-enea-item-order-invalid");
  }

  if (snapshot.items.some((item) => (
    !isPositiveFinite(item.oldTransmittance)
    || !isPositiveFinite(item.surfaceM2)
    || !isPositiveFinite(item.newTransmittance)
  ))) {
    blockers.push("completed-enea-numeric-value-invalid");
  }

  if (snapshot.items.some((item) => item.installation === "unknown")) {
    blockers.push("completed-enea-installation-unobserved");
  }
  if (snapshot.items.some((item) => item.hasDarkeningClosure === null)) {
    blockers.push("completed-enea-darkening-closure-unobserved");
  }

  const comparisons = compareInfissiIntakeToCompleted(intake, snapshot);
  if (comparisons.some((comparison) => comparison.status === "mismatch")) {
    blockers.push("aggregate-field-mismatch");
  }
  if (comparisons.some((comparison) => comparison.status === "mixed")) {
    blockers.push("aggregate-field-mixed");
  }
  if (comparisons.some((comparison) => comparison.status === "missing")) {
    blockers.push("aggregate-field-missing");
  }

  const structuralError = blockers.some((blocker) => blocker.startsWith("completed-enea-"));
  const mismatch = blockers.includes("aggregate-field-mismatch");
  const incompleteAggregate = blockers.includes("aggregate-field-mixed")
    || blockers.includes("aggregate-field-missing");

  const status: AprInfissiHistoricalAuditStatus = structuralError
    ? "error"
    : mismatch
      ? "difference"
      : incompleteAggregate
        ? "blocked"
        : "match";

  return {
    status,
    blockers,
    comparisons,
    itemCount: snapshot.items.length,
    expense: snapshot.expense,
  };
}
