import { describe, expect, it } from "vitest";
import { getGeneratorTestConvention } from "./conventions";

describe("getGeneratorTestConvention", () => {
  it("genera valori stabili, nei limiti confermati e con una cifra decimale", () => {
    const first = getGeneratorTestConvention("practice-001");
    const second = getGeneratorTestConvention("practice-001");

    expect(second).toEqual(first);
    expect(first.nominalPowerKw).toBeGreaterThanOrEqual(26.4);
    expect(first.nominalPowerKw).toBeLessThanOrEqual(32.8);
    expect(first.usefulEfficiencyPercent).toBeGreaterThanOrEqual(96.8);
    expect(first.usefulEfficiencyPercent).toBeLessThanOrEqual(98.9);
    expect(Number.isInteger(first.nominalPowerKw * 10)).toBe(true);
    expect(Number.isInteger(first.usefulEfficiencyPercent * 10)).toBe(true);
  });
});
