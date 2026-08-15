import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { ENEA_SCREENING_TYPE } from "./screeningRules";
import type { EneaLabMappedPractice } from "./types";

function mappedPractice(): EneaLabMappedPractice {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  return mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
    includeTestConventions: true,
  });
}

function field(mapped: EneaLabMappedPractice, id: string) {
  const found = mapped.sections.flatMap((section) => section.fields).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Campo di test non trovato: ${id}`);
  return found;
}

function setReady(mapped: EneaLabMappedPractice, id: string, value: string) {
  const target = field(mapped, id);
  target.value = value;
  target.status = "ready";
  target.testOnly = false;
  target.source = "Inserimento operatore";
}

describe("sicurezza esposizioni nord nel builder schermatura ENEA", () => {
  it("non prepara Nord per una normale schermatura solare", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.tipo", ENEA_SCREENING_TYPE.otherSolarScreening);
    setReady(mapped, "schermature.0.esposizione", "Nord");

    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).not.toContain("schermature.0.esposizione");
    expect(preparation.skippedFieldIds).toContain("schermature.0.esposizione");
    expect(preparation.script).not.toContain('"portalId":"id-esp"');
  });

  it("continua a preparare Nord-Ovest per una chiusura oscurante compatibile", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.tipo", ENEA_SCREENING_TYPE.rollerShutter);
    setReady(mapped, "schermature.0.esposizione", "Nord-Ovest");

    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).toContain("schermature.0.esposizione");
    expect(preparation.script).toContain('"portalId":"id-esp","control":"select","value":"Nord-Ovest","selectValue":"135"');
  });

  it("non prepara una esposizione nord se la tipologia non è verificata", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.esposizione", "Nord-Est");
    const type = field(mapped, "schermature.0.tipo");
    type.status = "missing";
    type.testOnly = false;

    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).not.toContain("schermature.0.esposizione");
    expect(preparation.script).not.toContain('"portalId":"id-esp"');
  });
});
