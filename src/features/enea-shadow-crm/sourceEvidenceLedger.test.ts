import { describe, expect, it } from "vitest";
import { appendSourceEvidence, deriveScreeningOperationalEvidence, emptySourceEvidenceLedger, migrateVerifiedLegacyAudit, requiresSourceReacquisition, verifiedEvidenceFor, VERIFIED_QUEUE_EVIDENCE } from "./sourceEvidenceLedger";

describe("source-evidence-ledger-v1", () => {
  it("is append-only and ignores duplicate event ids", () => {
    const base = emptySourceEvidenceLedger();
    const entry = { id: "e1", practiceId: "p1", sourceId: "s1", kind: "customer_form" as const, provenance: "original_customer_form" as const, acquiredAt: "2026-08-13T00:00:00Z", ruleVersion: "v1", verification: "verified" as const, fingerprint: "abc", facts: { acquired: true } };
    const once = appendSourceEvidence(base, entry);
    expect(appendSourceEvidence(once, { ...entry, facts: { acquired: false } })).toBe(once);
    expect(base.entries).toHaveLength(0);
  });

  it("treats confirmed screening fallbacks as audited evidence", () => {
    const [row] = deriveScreeningOperationalEvidence({ practiceId: "p", rowId: "r1", product: "other", areaM2: 7.384, description: "Tenda motorizzata" }, "2026-08-13T00:00:00Z");
    expect(row).toMatchObject({ verification: "verified", ruleVersion: "screening-operational-fallbacks-v2", facts: { exposure: "SUD", material: "tessuto", gTot: 0.15, mechanism: "automatica", energySavingsKwhYear: 124.05 } });
    expect(Number(row.facts.protectedWindowAreaM2)).toBeGreaterThanOrEqual(1.9);
    expect(Number(row.facts.protectedWindowAreaM2)).toBeLessThanOrEqual(3.1);
  });

  it("uses the user-confirmed manual fallback when mechanism is unspecified", () => {
    expect(deriveScreeningOperationalEvidence({ practiceId: "p", rowId: "r", product: "other", areaM2: 2 }, "2026-08-13T00:00:00Z")[0])
      .toMatchObject({ verification: "verified", facts: { mechanism: "manuale" } });
  });

  it("conserva per Matteo il gTot esplicito della fattura senza fallback pergola", () => {
    expect(verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-matteo-maranesi", "screening_row")).toEqual([
      expect.objectContaining({
        sourceId: "invoice-814-26:pergola-room",
        facts: expect.objectContaining({ gTot: 0.02, gTotSource: "invoice_explicit", fallbackApplied: false }),
      }),
    ]);
  });

  it("include per Zeno le sei zanzariere come righe 1:1 e riconcilia tutto il lordo", () => {
    expect(verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-zeno-righetti", "financial_reconciliation"))
      .toContainEqual(expect.objectContaining({ facts: expect.objectContaining({ uniqueInvoiceGrossTotal: 11730.40, eneaQualifiedGrossTotal: 11730.40, zanzariereGrossTotal: 3410.00, excludedGrossTotal: 0 }) }));
    expect(verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-zeno-righetti", "invoice_triple")).toHaveLength(2);
    const rows = verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-zeno-righetti", "screening_row");
    expect(rows[0]).toMatchObject({ facts: { includedRowNumbers: "1,2,3", qualifiedTechnicalProducts: 11 } });
    const zanzariere = rows.filter((row) => row.facts.classification === "enea_included_altra_schermatura");
    expect(zanzariere).toHaveLength(6);
    expect(zanzariere.map((row) => row.facts.dimensionsCm)).toEqual([
      "129.2x125.5", "69.5x235.4", "219.3x265.5", "269x125.6", "128.5x235.4", "79x74.8",
    ]);
    expect(zanzariere.every((row) => row.facts.material === "Misto" && row.facts.mechanism === "Manuale" && row.facts.gTot === 0.33)).toBe(true);
  });

  it("reuses an unchanged verified source and reacquires changed or unsafe sources", () => {
    const entry = { id: "e1", practiceId: "p1", sourceId: "s1", kind: "invoice_triple" as const, provenance: "original_attachment" as const, acquiredAt: "2026-08-13T00:00:00Z", ruleVersion: "v1", verification: "verified" as const, fingerprint: "abc", facts: { total: 10 } };
    const ledger = appendSourceEvidence(emptySourceEvidenceLedger(), entry);
    expect(requiresSourceReacquisition(ledger, "p1", "s1", "abc")).toBe(false);
    expect(requiresSourceReacquisition(ledger, "p1", "s1", "changed")).toBe(true);
    expect(requiresSourceReacquisition(ledger, "p1", "missing")).toBe(true);
  });

  it("never promotes partial facts but retains the newly verified Samuele invoice triple", () => {
    expect(verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-sara-agostinelli", "invoice_triple")).toHaveLength(2);
    expect(verifiedEvidenceFor(VERIFIED_QUEUE_EVIDENCE, "audit-samuele-colombo", "invoice_triple")).toEqual([
      expect.objectContaining({ sourceId: "invoice-48-001", verification: "verified", facts: expect.objectContaining({ grossTotal: 17529.60 }) }),
    ]);
  });

  it("migrates an explicitly reconciled legacy audit without promoting generic blockers", () => {
    const migrated = migrateVerifiedLegacyAudit(emptySourceEvidenceLedger(), [
      { id: "reconciled", reason: "Totale economico già riconciliato dalle fonti originarie acquisite.", documents: [{ reference: "Fattura 1", classification: "acconto", note: "Acconto classificato nell'audit." }] },
      { id: "blocked", reason: "Non è stato possibile ripetere la tripla riconciliazione.", documents: [{ reference: "Fattura 1", classification: "non_accessibile", note: "Etichetta presente." }] },
    ]);
    expect(verifiedEvidenceFor(migrated, "reconciled", "financial_reconciliation")).toHaveLength(1);
    expect(verifiedEvidenceFor(migrated, "reconciled", "invoice_triple")).toHaveLength(1);
    expect(verifiedEvidenceFor(migrated, "blocked", "financial_reconciliation")).toHaveLength(0);
  });
});
