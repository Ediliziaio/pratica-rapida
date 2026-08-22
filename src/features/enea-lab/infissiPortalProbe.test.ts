import { describe, expect, it } from "vitest";
import { buildAprInfissiPortalProbeScript } from "./infissiPortalProbe";

describe("APR infissi portal probe", () => {
  it("è dichiaratamente read-only e non contiene primitive di mutazione", () => {
    const probe = buildAprInfissiPortalProbeScript();

    expect(probe.writesPortal).toBe(false);
    expect(probe.clicksControls).toBe(false);
    expect(probe.script).toContain("querySelectorAll('input, select, textarea, button')");
    expect(probe.script).not.toMatch(/\.click\s*\(/);
    expect(probe.script).not.toMatch(/\.submit\s*\(/);
    expect(probe.script).not.toMatch(/requestSubmit\s*\(/);
    expect(probe.script).not.toMatch(/\.value\s*=/);
    expect(probe.script).not.toMatch(/dispatchEvent\s*\(/);
    expect(probe.script).not.toMatch(/location\s*=/);
  });
});
