import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "src/pages/rivenditore/NuovaPraticaEnea.tsx"),
  "utf8",
);

describe("reseller invoice label", () => {
  it("chiede la fattura di vendita senza alterare il campo obbligatorio", () => {
    expect(source).toContain('label="Fattura di vendita/installazione"');
    expect(source).not.toContain('label="Fattura di acquisto/installazione"');
    expect(source).toMatch(/label="Fattura di vendita\/installazione"\s+required/);
  });
});
