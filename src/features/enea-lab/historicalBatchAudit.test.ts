import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

function auditWithDifferences(fieldIds: string[]): CompletedEneaAuditResult {
  return {
    path: "demo/conclusa.pdf",
    cpid: "TEST",
    compared: Math.max(1, fieldIds.length),
    matches: fieldIds.length ? 0 : 1,
    mismatches: fieldIds.length,
    differences: fieldIds.map((fieldId) => ({
      fieldId,
      completedValue: "valore finale",
      mappedValue: "valore mapper",
    })),
  };
}

describe("classificazione audit storico ENEA", () => {
  it("classifica come match quando non ci sono differenze", () => {
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
      compared: 1,
      matches: 0,
      mismatches: 1,
      differences: [],
    };

    const result = classifyHistoricalAudit(audit, new Set());

    expect(result.outcome).toBe("difference");
    expect(result.differenceFieldIds).toEqual([]);
    expect(result.blockedDifferenceFieldIds).toEqual([]);
  });
});
