import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapInfissiCommonPractice } from "./infissiCommonMapping";
import {
  auditInfissiCommonMappingAgainstCompleted,
  parseCompletedEneaInfissiCommon,
} from "./infissiCommonCompletedAudit";
import type { CompletedEneaSnapshot } from "./completedEneaAudit";

function mappedInfissi() {
  const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
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

describe("APR infissi common completed audit", () => {
  it("riconosce il 345A dal PDF concluso senza riusare il 345B schermature", () => {
    const parsed = parseCompletedEneaInfissiCommon(
      "Pratica ENEA 2026 - Comma 345A - Interventi sull'involucro",
    );

    expect(parsed.fields["intervento.tipo"]).toBe("Comma 345A - Interventi sull'involucro");
    expect(parsed.fields["intervento.tipo"]).not.toMatch(/345B/);
  });

  it("confronta soltanto campi comuni osservati e ignora dati climatici derivati dal portale", () => {
    const mapped = mappedInfissi();
    const completed: CompletedEneaSnapshot = {
      cpid: "TEST-INFISSI",
      screeningCount: -1,
      fields: {
        "intervento.tipo": "Comma 345A - Interventi sull'involucro",
        "intervento.unita_oggetto": "1",
        "immobile.anno": "1998",
        "immobile.superficie": "112",
        "immobile.zona_climatica": "E",
      },
    };

    const result = auditInfissiCommonMappingAgainstCompleted(mapped, completed);

    expect(result.status).toBe("match");
    expect(result.compared).toBe(4);
    expect(result.comparisons.some((item) => item.fieldId === "immobile.zona_climatica")).toBe(false);
  });

  it("segnala una differenza comune invece di nasconderla", () => {
    const mapped = mappedInfissi();
    const completed: CompletedEneaSnapshot = {
      cpid: "TEST-INFISSI",
      screeningCount: -1,
      fields: { "immobile.anno": "2005" },
    };

    const result = auditInfissiCommonMappingAgainstCompleted(mapped, completed);
    expect(result.status).toBe("difference");
    expect(result.differences[0]).toEqual(expect.objectContaining({
      fieldId: "immobile.anno",
      mappedValue: "1998",
      completedValue: "2005",
    }));
  });
});
