import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  resolveCurrentCohortManifestCase,
  runEconomicVerticalForCurrentCohort,
} from "./aprEconomicCorpusReplay";

const roots: string[] = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function writeJson(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function currentCohortFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-economic-current-"));
  roots.push(root);
  const customerKey = "cliente-corrente";
  const practiceId = "practice-current-1";
  const dossierPath = path.join(root, "crm-acquisition", "dossiers", `${customerKey}.json`);
  const textPath = path.join(root, "crm-document-analysis", "text", customerKey, "invoice-1.txt");
  const invoiceText = [
    "Fattura",
    "Data 01/06/2026 Numero 1 Pagina",
    "Importo prodotti o servizi 750,00 EUR",
    "Totale imponibile 750,00 EUR",
    "Totale IVA 165,00 EUR",
    "Totale documento 915,00 EUR",
  ].join("\n");
  mkdirSync(path.dirname(textPath), { recursive: true });
  writeFileSync(textPath, invoiceText, "utf8");
  writeJson(dossierPath, { row: { id: practiceId } });
  writeJson(path.join(root, "crm-acquisition", "checkpoint.json"), {
    status: "completed",
    items: [{
      customerKey,
      expectedPracticeId: practiceId,
      practiceId,
      dossierPath,
      responseSha256: sha256("crm-response"),
      state: "acquired",
    }],
  });
  writeJson(path.join(root, "crm-document-analysis", "checkpoint.json"), {
    status: "completed",
    items: [{
      documentKey: "invoice-1",
      customerKey,
      kind: "invoice",
      state: "analyzed",
      textPath,
      textSha256: sha256(invoiceText),
      sourceSha256: sha256("invoice-source"),
      extractionMode: "native_text",
      nonFiscalImageExcluded: false,
      invoiceResult: { documentType: "invoice" },
    }],
  });
  return { root, customerKey, practiceId, dossierPath, textPath };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("APR bridge economico dalla coorte corrente", () => {
  it("usa dossier e analisi correnti senza appartenenza a un corpus storico", () => {
    const fixture = currentCohortFixture();
    const resolved = resolveCurrentCohortManifestCase(fixture.root, fixture.customerKey);
    expect(resolved).toMatchObject({
      customerKey: fixture.customerKey,
      practiceId: fixture.practiceId,
      evidence: { dossierPath: realpathSync(fixture.dossierPath) },
    });
    expect(resolved.evidence.sourceSha256).toHaveLength(3);
    const vertical = runEconomicVerticalForCurrentCohort(fixture.root, fixture.customerKey);
    expect(vertical).toMatchObject({ outcome: "RESOLVED", eligibleExpense: 915 });
  });

  it("fallisce chiuso se checkpoint e dossier non concordano sull'identita pratica", () => {
    const fixture = currentCohortFixture();
    writeJson(fixture.dossierPath, { row: { id: "practice-different" } });
    expect(() => resolveCurrentCohortManifestCase(fixture.root, fixture.customerKey))
      .toThrow(`apr_economic_current_dossier_identity_mismatch:${fixture.customerKey}`);
  });

  it("rifiuta evidenze testuali esterne alla coorte corrente", () => {
    const fixture = currentCohortFixture();
    const outside = mkdtempSync(path.join(os.tmpdir(), "apr-economic-outside-"));
    roots.push(outside);
    const outsideText = path.join(outside, "invoice.txt");
    writeFileSync(outsideText, "Totale documento 110,00 EUR", "utf8");
    const analysisPath = path.join(fixture.root, "crm-document-analysis", "checkpoint.json");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    analysis.items[0].textPath = outsideText;
    writeJson(analysisPath, analysis);
    expect(() => resolveCurrentCohortManifestCase(fixture.root, fixture.customerKey))
      .toThrow("apr_economic_current_text_outside_state");
  });

  it("fallisce chiuso se la pratica non ha analisi corrente", () => {
    const fixture = currentCohortFixture();
    writeJson(path.join(fixture.root, "crm-document-analysis", "checkpoint.json"), { status: "completed", items: [] });
    expect(() => resolveCurrentCohortManifestCase(fixture.root, fixture.customerKey))
      .toThrow(`apr_economic_current_analysis_case_missing:${fixture.customerKey}`);
  });
});
