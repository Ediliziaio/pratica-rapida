import type { AprInfissiMappedTechnicalItem } from "./infissiTechnicalMapping";
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

function itemValue(field: AprInfissiPortalField, item: AprInfissiMappedTechnicalItem): string {
  switch (field) {
    case "oldMaterial": return title(item.oldMaterial);
    case "oldGlass": return title(item.oldGlass);
    case "oldTransmittance": return decimal(item.oldTransmittance);
    case "surfaceM2": return decimal(item.surfaceM2);
    case "newMaterial": return title(item.newMaterial);
    case "newGlass": return title(item.newGlass);
    case "newTransmittance": return decimal(item.newTransmittance);
    case "installation": return "Verso esterno";
    case "hasDarkeningClosure": return item.hasDarkeningClosure ? "Sì" : "No";
  }
}

/**
 * Genera esclusivamente il comando di compilazione della pagina tecnica infissi.
 * I valori arrivano dal mapper APR source-driven, NON dal PDF ENEA concluso usato
 * come ground truth. In questo modo il collaudo live misura davvero APR invece di
 * ricopiare la risposta storica che deve verificare.
 *
 * Il comando non contiene click, submit, navigazione, salvataggio o invio.
 */
export function prepareAprInfissiPortalScript(
  contract: AprInfissiPortalObservedContract,
  items: AprInfissiMappedTechnicalItem[],
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
  if (items.length === 0) {
    return { mode: "blocked", script: "", rowCount: 0, reason: "apr-technical-items-missing" };
  }

  const rows = items.map((item) => ({
    row: item.ordinal,
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

  if (/\.click\s*\(|\.submit\s*\(|requestSubmit\s*\(|location\s*=|window\.open\s*\(/.test(runtime)) {
    return { mode: "blocked", script: "", rowCount: 0, reason: "unsafe-runtime-generated" };
  }

  return { mode: "ready", script: runtime, rowCount: items.length };
}
