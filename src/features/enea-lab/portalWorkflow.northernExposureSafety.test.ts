import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";
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

describe("sicurezza esposizioni nord nel workflow ufficiale ENEA", () => {
  it("blocca Nord per una normale schermatura solare", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.tipo", ENEA_SCREENING_TYPE.otherSolarScreening);
    setReady(mapped, "schermature.0.esposizione", "Nord");

    const workflow = buildEneaOfficialPortalWorkflowScript(mapped);

    expect(workflow.mode).toBe("blocked");
    expect(workflow.script).toBe("");
    expect(workflow.supportedPages).toEqual([]);
  });

  it("ammette le esposizioni nord per una chiusura oscurante compatibile", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.tipo", ENEA_SCREENING_TYPE.rollerShutter);
    setReady(mapped, "schermature.0.esposizione", "Nord-Ovest");

    const workflow = buildEneaOfficialPortalWorkflowScript(mapped);

    expect(workflow.mode).toBe("official");
    expect(workflow.script.length).toBeGreaterThan(0);
  });

  it("resta fail-closed se una esposizione nord non ha una tipologia verificata", () => {
    const mapped = mappedPractice();
    setReady(mapped, "schermature.0.esposizione", "Nord-Est");
    const type = field(mapped, "schermature.0.tipo");
    type.status = "missing";
    type.testOnly = false;

    expect(buildEneaOfficialPortalWorkflowScript(mapped).mode).toBe("blocked");
  });
});
