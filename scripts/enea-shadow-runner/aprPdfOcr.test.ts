import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const root = mkdtempSync(path.join(os.tmpdir(), "apr-pdf-ocr-order-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(process.platform !== "darwin")("ordine semantico OCR orientato", () => {
  const compileAndCheck = () => {
    const output = path.join(root, "apr-pdf-ocr");
    const compile = spawnSync("xcrun", ["clang", "-fobjc-arc", "-fblocks", "scripts/enea-shadow-runner/aprPdfOcr.m", "-framework", "Foundation", "-framework", "AppKit", "-framework", "PDFKit", "-framework", "Vision", "-framework", "ImageIO", "-o", output], { cwd: process.cwd(), encoding: "utf8" });
    expect(compile.status, compile.stderr).toBe(0);
    const check = spawnSync(output, ["--self-test-reading-order"], { encoding: "utf8" });
    expect(check.status, check.stderr).toBe(0);
    return JSON.parse(check.stdout) as Record<string, number[]>;
  };
  it("trasforma le coordinate per 90, 180 e 270 gradi", () => {
    const result = compileAndCheck();
    expect(result.right[0]).toBeCloseTo(0.3); expect(result.right[1]).toBeCloseTo(0.2);
    expect(result.down[0]).toBeCloseTo(0.8); expect(result.down[1]).toBeCloseTo(0.3);
    expect(result.left[0]).toBeCloseTo(0.7); expect(result.left[1]).toBeCloseTo(0.8);
  });
  it("lascia invariate le coordinate quando la pagina non e ruotata", () => {
    expect(compileAndCheck().up).toEqual([0.2, 0.7]);
  });
});
