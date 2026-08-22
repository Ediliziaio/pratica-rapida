export type AprInfissiPortalField =
  | "oldMaterial"
  | "oldGlass"
  | "oldTransmittance"
  | "surfaceM2"
  | "newMaterial"
  | "newGlass"
  | "newTransmittance"
  | "installation"
  | "hasDarkeningClosure";

export interface AprInfissiPortalObservedControl {
  field: AprInfissiPortalField;
  selector: string;
  control: "input" | "select";
}

export interface AprInfissiPortalObservedContract {
  portalYear: 2026;
  pageIdentity: string;
  rowControls: AprInfissiPortalObservedControl[];
  observedAt: string;
}

export type AprInfissiPortalContractBlocker =
  | "portal-year-not-2026"
  | "page-identity-missing"
  | "observation-timestamp-invalid"
  | "required-control-missing"
  | "duplicate-field-control"
  | "selector-empty"
  | "selector-unsafe";

export interface AprInfissiPortalContractValidation {
  valid: boolean;
  blockers: AprInfissiPortalContractBlocker[];
}

const REQUIRED_FIELDS: readonly AprInfissiPortalField[] = [
  "oldMaterial",
  "oldGlass",
  "oldTransmittance",
  "surfaceM2",
  "newMaterial",
  "newGlass",
  "newTransmittance",
  "installation",
  "hasDarkeningClosure",
];

function looksLikeActionSelector(selector: string): boolean {
  const normalized = selector.toLocaleLowerCase("it");
  return /submit|salva|save|avanti|next|conferma|confirm|invia|send/.test(normalized);
}

/**
 * Valida esclusivamente un contratto DOM osservato sul portale reale.
 * Nessun selettore viene dedotto dal nome del campo: finché non è stato letto
 * dalla pagina 2026, il contratto resta invalido e APR non genera compilazioni.
 */
export function validateAprInfissiPortalContract(
  contract: AprInfissiPortalObservedContract,
): AprInfissiPortalContractValidation {
  const blockers: AprInfissiPortalContractBlocker[] = [];
  if (contract.portalYear !== 2026) blockers.push("portal-year-not-2026");
  if (!contract.pageIdentity.trim()) blockers.push("page-identity-missing");
  if (!Number.isFinite(Date.parse(contract.observedAt))) blockers.push("observation-timestamp-invalid");

  const fields = contract.rowControls.map((control) => control.field);
  if (REQUIRED_FIELDS.some((field) => !fields.includes(field))) {
    blockers.push("required-control-missing");
  }
  if (new Set(fields).size !== fields.length) blockers.push("duplicate-field-control");
  if (contract.rowControls.some((control) => !control.selector.trim())) blockers.push("selector-empty");
  if (contract.rowControls.some((control) => looksLikeActionSelector(control.selector))) {
    blockers.push("selector-unsafe");
  }

  return { valid: blockers.length === 0, blockers };
}
