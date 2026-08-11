import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

function auditWithDifferences(fieldIds: string[]): CompletedEneaAuditResult {
  const compared = Math.max(12, fieldIds.length);
  return {
    path: "demo/conclusa.pdf",
    cpid: "TEST",
    compared,
    matches: Math.max(0, compared - fieldIds.length),
    mismatches: fieldIds.length,
    differences: fieldIds.map((fieldId) => ({
      fieldId,
      completedValue: "valore finale",
      mappedValue: "valore mapper",
    })),
  };
}

describe("classificazione audit storico ENEA", () => {
  it("classifica come match quando non ci sono differenze né blocker", () => {
    expect(classifyHistoricalAudit(auditWithDifferences([]), new Set()).outcome).toBe("match");
  });

  it("non considera match un audit che non ha confrontato alcun campo", () => {
    const audit: CompletedEneaAuditResult = {
      path: "demo/conclusa.pdf",
      cpid: "TEST",
      compared: 0,
      matches: 0,
      mismatches: 0,
      differences: [],
    };

    const result = classifyHistoricalAudit(audit, new Set());

    expect(result.outcome).toBe("difference");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });

  it("non considera match un PDF conclusivo senza CPID leggibile", () => {
    const audit: CompletedEneaAuditResult = {
      ...auditWithDifferences([]),
      cpid: null,
    };

    const result = classifyHistoricalAudit(audit, new Set());

    expect(result.outcome).toBe("difference");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });

  it("non certifica come match un parsing con copertura troppo bassa", () => {
    const audit: CompletedEneaAuditResult = {
      path: "demo/conclusa.pdf",
      cpid: "TEST",
      compared: 9,
      matches: 9,
      mismatches: 0,
      differences: [],
    };

    const result = classifyHistoricalAudit(audit, new Set());

    expect(result.outcome).toBe("difference");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });

  it("non conta come match valori coincidenti se il workflow corrente ha ancora blocker", () => {
    const audit = auditWithDifferences([]);
    const result = classifyHistoricalAudit(
      audit,
      new Set(["schermature.0.gtot"]),
    );

    expect(result.outcome).toBe("blocked");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });

  it("classifica come correttamente bloccata se tutte le differenze erano già bloccanti", () => {
    const audit = auditWithDifferences([
      "schermature.0.superficie_finestrata",
      "impianto.potenza",
    ]);
    const result = classifyHistoricalAudit(audit, new Set([
      "schermature.0.superficie_finestrata",
      "impianto.potenza",
    ]));

    expect(result.outcome).toBe("blocked");
    expect(result.blockedDifferenceFieldIds).toHaveLength(2);
  });

  it("segnala differenza reale se il mapper avrebbe lasciato passare almeno un campo discordante", () => {
    const audit = auditWithDifferences([
      "schermature.0.gtot",
      "schermature.0.superficie_finestrata",
    ]);
    const result = classifyHistoricalAudit(
      audit,
      new Set(["schermature.0.superficie_finestrata"]),
    );

    expect(result.outcome).toBe("difference");
    expect(result.blockedDifferenceFieldIds).toEqual(["schermature.0.superficie_finestrata"]);
  });

  it("non considera sicuro un mismatch privo del dettaglio dei campi", () => {
    const audit: CompletedEneaAuditResult = {
      path: "demo/conclusa.pdf",
      cpid: "TEST",
      compared: 12,
      matches: 11,
      mismatches: 1,
      differences: [],
    };

    const result = classifyHistoricalAudit(audit, new Set());

    expect(result.outcome).toBe("difference");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });
});
