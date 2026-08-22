import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { parseCompletedEneaInfissiText } from "./completedEneaInfissi";
import { runAprInfissiPipeline } from "./infissiPipeline";
import type { AprInfissiPortalObservedContract } from "./infissiPortalContract";
import type { CompletedEneaSnapshot } from "./completedEneaAudit";

const COMPLETED = `
IN. Serramenti e infissi
1 Legno Doppio 3 1.5 PVC Triplo 0.88 Verso No
esterno
Spese congrue sostenute [€] 9996.66
`;

function source() {
  const practice = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
  practice.id = "lab-infissi-pipeline-001";
  practice.code = "LAB-INF-PIPE-001";
  practice.prodottoInstallato = "Infissi e serramenti";
  practice.fattureCount = 1;
  practice.form.prodotto = {
    tipo: "infissi",
    vecchi_materiale: "legno",
    vecchi_vetro: "doppio",
    nuovi_materiale: "pvc",
    nuovi_vetro: "triplo",
    zanzariere_tapparelle: false,
  };
  return practice;
}

function completedCommon(): CompletedEneaSnapshot {
  return {
    cpid: "TEST-INFISSI",
    screeningCount: -1,
    fields: {
      "intervento.tipo": "Comma 345A - Interventi sull'involucro",
      "intervento.unita_oggetto": "1",
      "immobile.anno": "1998",
      "immobile.superficie": "112",
    },
  };
}

function contract(): AprInfissiPortalObservedContract {
  return {
    portalYear: 2026,
    pageIdentity: "ENEA 2026 - Serramenti e infissi",
    observedAt: "2026-08-22T12:00:00.000Z",
    rowControls: [
      { field: "oldMaterial", selector: "#row-{{row}}-old-material", control: "select" },
      { field: "oldGlass", selector: "#row-{{row}}-old-glass", control: "select" },
      { field: "oldTransmittance", selector: "#row-{{row}}-old-u", control: "input" },
      { field: "surfaceM2", selector: "#row-{{row}}-surface", control: "input" },
      { field: "newMaterial", selector: "#row-{{row}}-new-material", control: "select" },
      { field: "newGlass", selector: "#row-{{row}}-new-glass", control: "select" },
      { field: "newTransmittance", selector: "#row-{{row}}-new-u", control: "input" },
      { field: "installation", selector: "#row-{{row}}-installation", control: "select" },
      { field: "hasDarkeningClosure", selector: "#row-{{row}}-darkening", control: "select" },
    ],
  };
}

const technicalEvidence = [{
  sourcePath: "technical-sheet.pdf",
  oldMaterial: "legno",
  oldGlass: "doppio",
  oldTransmittance: 3,
  surfaceM2: 1.5,
  newMaterial: "pvc",
  newGlass: "triplo",
  newTransmittance: 0.88,
  installation: "verso_esterno" as const,
  hasDarkeningClosure: false,
}];

describe("APR infissi pipeline", () => {
  it("arriva a candidato shadow solo con audit, trasmittanze, contratto e live validation coerenti", () => {
    const result = runAprInfissiPipeline({
      source: source(),
      technicalEvidence,
      completedEnea: parseCompletedEneaInfissiText(COMPLETED),
      completedEneaCommon: completedCommon(),
      observedClimateZone: "E",
      portalContract: contract(),
      livePortalValidated: true,
    });

    expect(result.commonAudit.status).toBe("match");
    expect(result.technicalMapping.status).toBe("ready");
    expect(result.technicalAudit.status).toBe("match");
    expect(result.transmittanceGate.status).toBe("pass");
    expect(result.portalContract.valid).toBe(true);
    expect(result.technicalPortalScript.mode).toBe("ready");
    expect(result.gate.shadowTechnicalCandidate).toBe(true);
    expect(result.gate.officialSubmissionAllowed).toBe(false);
  });

  it("senza contratto portale resta bloccata e non produce script tecnico", () => {
    const result = runAprInfissiPipeline({
      source: source(),
      technicalEvidence,
      completedEnea: parseCompletedEneaInfissiText(COMPLETED),
      completedEneaCommon: completedCommon(),
      observedClimateZone: "E",
      livePortalValidated: false,
    });

    expect(result.portalContract.valid).toBe(false);
    expect(result.technicalPortalScript).toEqual(expect.objectContaining({ mode: "blocked", script: "" }));
    expect(result.gate.shadowTechnicalCandidate).toBe(false);
    expect(result.gate.blockers).toEqual(expect.arrayContaining([
      "portal-contract-not-valid",
      "live-portal-validation-missing",
    ]));
  });

  it("senza zona climatica osservata resta fail-closed", () => {
    const result = runAprInfissiPipeline({
      source: source(),
      technicalEvidence,
      completedEnea: parseCompletedEneaInfissiText(COMPLETED),
      completedEneaCommon: completedCommon(),
      portalContract: contract(),
      livePortalValidated: true,
    });

    expect(result.transmittanceGate.status).toBe("blocked");
    expect(result.gate.blockers).toContain("transmittance-gate-not-pass");
  });

  it("una differenza tecnica rispetto al PDF concluso blocca la readiness", () => {
    const result = runAprInfissiPipeline({
      source: source(),
      technicalEvidence: [{ ...technicalEvidence[0], newTransmittance: 0.93 }],
      completedEnea: parseCompletedEneaInfissiText(COMPLETED),
      completedEneaCommon: completedCommon(),
      observedClimateZone: "E",
      portalContract: contract(),
      livePortalValidated: true,
    });

    expect(result.technicalAudit.status).toBe("difference");
    expect(result.gate.shadowTechnicalCandidate).toBe(false);
    expect(result.gate.blockers).toContain("technical-audit-not-match");
  });

  it("una differenza nelle sezioni comuni blocca anche se la tabella tecnica coincide", () => {
    const common = completedCommon();
    common.fields["immobile.anno"] = "2005";
    const result = runAprInfissiPipeline({
      source: source(),
      technicalEvidence,
      completedEnea: parseCompletedEneaInfissiText(COMPLETED),
      completedEneaCommon: common,
      observedClimateZone: "E",
      portalContract: contract(),
      livePortalValidated: true,
    });

    expect(result.commonAudit.status).toBe("difference");
    expect(result.gate.shadowTechnicalCandidate).toBe(false);
    expect(result.gate.blockers).toContain("common-audit-not-match");
  });
});
