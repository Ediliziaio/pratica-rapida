import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const target = path.join(root, name);
    return statSync(target).isDirectory() ? files(target) : target.endsWith(".ts") && !target.endsWith(".test.ts") ? [target] : [];
  });
}

describe("anti-segnaposto ENEA", () => {
  it("anti-segnaposto ENEA: nessun percorso runtime inserisce dimensioni sintetiche per soddisfare uno schema", () => {
    const roots = [path.resolve("scripts/enea-shadow-runner"), path.resolve("src/features/enea-shadow-crm"), path.resolve("src/features/enea-lab")];
    const coordinate = (name: string) => `${name}\\s*:\\s*1(?:\\.0+)?\\b`;
    const forbiddenPairs = [
      new RegExp(`${coordinate("rawWidth")}[\\s\\S]{0,240}${coordinate("rawHeight")}`),
      new RegExp(`${coordinate("rawHeight")}[\\s\\S]{0,240}${coordinate("rawWidth")}`),
      new RegExp(`${coordinate("widthMm")}[\\s\\S]{0,240}${coordinate("heightMm")}`),
      new RegExp(`${coordinate("heightMm")}[\\s\\S]{0,240}${coordinate("widthMm")}`),
    ];
    const offenders = roots.flatMap(files).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return forbiddenPairs.some((pattern) => pattern.test(source)) ? [path.relative(process.cwd(), file)] : [];
    });
    expect(offenders, "Dimensioni 1x1 sintetiche trovate in percorsi runtime").toEqual([]);
  });
});

