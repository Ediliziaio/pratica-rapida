export type AprSupportedProductModule = "screening" | "infissi";

export interface AprCommonBlockerShape {
  code: string;
  field?: string | null;
  fieldId?: string | null;
  reason?: string | null;
  message?: string | null;
}

const SCREENING_ONLY_CODES = new Set([
  "crm-source-not-screening",
  "screenings_missing",
  "screening_primary_measurements_missing",
  "screening-list-empty",
]);

export function isScreeningOnlyCommonBlocker(blocker: AprCommonBlockerShape) {
  const field = (blocker.field ?? blocker.fieldId ?? "").toLowerCase();
  if (/^(?:screenings?|schermature?)(?:\.|$)/.test(field)) return true;
  if (SCREENING_ONLY_CODES.has(blocker.code)) return true;
  if (/^(?:missing|review)-schermature(?:\.|$)/.test(blocker.code)) return true;
  if (/^(?:screening|persiana|avvolgibile|zanzariera)_/.test(blocker.code)) return true;
  return /^invoice_[a-f0-9]{8}$/.test(blocker.code)
    && /nessuna riga di schermatura con dimensioni e gtot/i.test(blocker.reason ?? blocker.message ?? "");
}

export function commonBlockerProductModules(blocker: AprCommonBlockerShape): readonly AprSupportedProductModule[] {
  return isScreeningOnlyCommonBlocker(blocker) ? ["screening"] : ["screening", "infissi"];
}

export function commonBlockerAppliesToModule(blocker: AprCommonBlockerShape, module: AprSupportedProductModule) {
  return commonBlockerProductModules(blocker).includes(module);
}
