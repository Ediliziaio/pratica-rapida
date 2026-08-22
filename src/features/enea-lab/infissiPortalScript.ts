import type { CompletedEneaInfissiSnapshot } from "./completedEneaInfissi";
import {
  validateAprInfissiPortalContract,
  type AprInfissiPortalField,
  type AprInfissiPortalObservedContract,
} from "./infissiPortalContract";

export interface AprInfissiPortalScriptPreparation {
  mode: "ready" | "blocked";
  script: string;
  rowCount: number;
  reason?: string;
}

function title(value: string): string {
  return value.length ? `${value[0].toLocaleUpperCase("it")}${value.slice(1)}` : value;
}

function decimal(value: number): string {
  return String(value).replace(".", ",");
}

function itemValue(
  field: AprInfissiPortalField,
  item: CompletedEneaInfissiSnapshot["items"][number],
): string {
  switch (field) {
    case "oldMaterial": return title(item.oldMaterial);
    case "oldGlass": return title(item.oldGlass);
    case "oldTransmittance": return decimal(item.oldTransmittance);
    case "surfaceM2": return decimal(item.surfaceM2);
    case "newMaterial": return title(item.newMaterial);
    case "newGlass": return title(item.newGlass);
    case "newTransmittance": return decimal(item.newTransmittance);
    case "installation": return item.installation === "verso_esterno" ? "Verso esterno" : "";
    case "hasDarkeningClosure": return item.hasDarkeningClosure === null
      ? ""
      : item.hasDarkeningClosure ? "Sì" : "No";
  }
}

/**
 * Genera esclusivamente il comando di compilazione della pagina tecnica infissi.
 * Il comando non contiene click, submit, navigazione, salvataggio o invio.
 * I selettori devono provenire dal contratto DOM osservato sul portale 2026.
 */
export function prepareAprInfissiPortalScript(
  contract: AprInfissiPortalObservedContract,
  snapshot: CompletedEneaInfissiSnapshot,
): AprInfissiPortalScriptPreparation {
  const contractValidation = validateAprInfissiPortalContract(contract);
  if (!contractValidation.valid) {
    return {
      mode: "blocked",
      script: "",
      rowCount: 0,
      reason: `invalid-portal-contract:${contractValidation.blockers.join(",")}`,
    };
  }
  if (snapshot.items.length === 0) {
    return { mode: "blocked", script: "", rowCount: 0, reason: "completed-enea-items-missing" };
  }
  if (snapshot.items.some((item) => (
    item.installation === "unknown"
    || item.hasDarkeningClosure === null
    || !Number.isFinite(item.oldTransmittance)
    || !Number.isFinite(item.surfaceM2)
    || !Number.isFinite(item.newTransmittance)
  ))) {
    return { mode: "blocked", script: "", rowCount: 0, reason: "completed-enea-item-incomplete" };
  }

  const rows = snapshot.items.map((item, index) => ({
    row: index + 1,
    values: Object.fromEntries(contract.rowControls.map((control) => [
      control.field,
      itemValue(control.field, item),
    ])),
  }));

  const runtime = `(() => {
  const contract = ${JSON.stringify(contract.rowControls)};
  const rows = ${JSON.stringify(rows)};
  const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("it");
  const report = { page: ${JSON.stringify(contract.pageIdentity)}, rows: [], notFound: [], notAvailable: [] };
  for (const row of rows) {
    const rowReport = { row: row.row, fields: {} };
    for (const control of contract) {
      const selector = control.selector.replaceAll("{{row}}", String(row.row));
      const element = document.querySelector(selector);
      if (!element) {
        report.notFound.push({ row: row.row, field: control.field, selector });
        continue;
      }
      const expected = row.values[control.field];
      if (control.control === "select") {
        const options = Array.from(element.options ?? []);
        const option = options.find((candidate) => normalize(candidate.textContent) === normalize(expected));
        if (!option) {
          report.notAvailable.push({ row: row.row, field: control.field, expected });
          continue;
        }
        element.value = option.value;
      } else {
        element.value = expected;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      rowReport.fields[control.field] = expected;
    }
    report.rows.push(rowReport);
  }
  return report;
})()`;

  // Difesa aggiuntiva sul testo serializzato: anche un contratto osservato non
  // deve poter trasformare il comando di compilazione in un'azione di workflow.
  if (/\.click\s*\(|\.submit\s*\(|requestSubmit\s*\(|location\s*=|window\.open\s*\(/.test(runtime)) {
    return { mode: "blocked", script: "", rowCount: 0, reason: "unsafe-runtime-generated" };
  }

  return { mode: "ready", script: runtime, rowCount: snapshot.items.length };
}
