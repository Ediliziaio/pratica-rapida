import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapInfissiCommonPractice } from "./infissiCommonMapping";
import { buildAprInfissiCommonPortalWorkflow } from "./infissiCommonPortalWorkflow";

function mappedInfissi() {
  const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
  source.id = "lab-infissi-workflow-001";
  source.code = "LAB-INF-001";
  source.form.prodotto = {
    tipo: "infissi",
    vecchi_materiale: "legno",
    vecchi_vetro: "doppio",
    nuovi_materiale: "pvc",
    nuovi_vetro: "triplo",
    zanzariere_tapparelle: false,
  };
  return mapInfissiCommonPractice(source, undefined, { includeTestConventions: false });
}

describe("APR infissi common portal workflow", () => {
  it("prepara solo le cinque famiglie di pagina comuni senza schermature", () => {
    const result = buildAprInfissiCommonPortalWorkflow(mappedInfissi());

    expect(result.supportedPages).toHaveLength(5);
    expect(result.supportedPages).toContain("Generatore dell'impianto termico");
    expect(result.supportedPages).toContain("Anagrafica Beneficiario");
    expect(result.script).not.toMatch(/schermatur/i);
    expect(result.script).not.toMatch(/\.submit\s*\(/);
    expect(result.script).not.toMatch(/requestSubmit\s*\(/);
  });
});
