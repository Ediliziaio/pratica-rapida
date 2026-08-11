import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  buildEneaOfficialPortalWorkflowScript,
  buildEneaPortalWorkflowScript,
} from "./portalWorkflow";

describe("workflow ENEA ufficiale", () => {
  it("non porta nel comando ufficiale i valori convenzionali del generatore", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, undefined, { includeTestConventions: true });

    const testWorkflow = buildEneaPortalWorkflowScript(mapped, "test");
    const officialWorkflow = buildEneaOfficialPortalWorkflowScript(mapped);

    expect(testWorkflow.mode).toBe("test");
    expect(officialWorkflow.mode).toBe("official");
    expect(testWorkflow.script).toContain('"portalId":"id-n"');
    expect(testWorkflow.script).toContain('"portalId":"id-pn"');
    expect(officialWorkflow.script).not.toContain('"portalId":"id-n"');
    expect(officialWorkflow.script).not.toContain('"portalId":"id-pn"');
  });
});
