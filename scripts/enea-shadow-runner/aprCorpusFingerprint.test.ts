import { describe, expect, it } from "vitest";
import { assertAprInputCorpusMatchesBaseline, compareAprInputCorpusFingerprint, computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";

const sha = (character: string) => character.repeat(64);
const cases = (count = 40) => Array.from({ length: count }, (_, index) => ({
  customerKey: `fixture-${String(index + 1).padStart(2, "0")}`,
  dossierSha256: sha(index % 2 ? "a" : "b"),
  originalDocumentSetSha256: sha(index % 2 ? "c" : "d"),
}));

describe("APR fixed input corpus fingerprint", () => {
  it("accetta esattamente 40 casi unici e produce lo stesso fingerprint indipendentemente dall'ordine", () => {
    const baseline = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: cases() });
    const reordered = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: [...cases()].reverse() });
    expect(baseline).toEqual(reordered);
    expect(baseline.caseCount).toBe(40);
    expect(assertAprInputCorpusMatchesBaseline(baseline, reordered).matches).toBe(true);
  });

  it.each([39, 41])("rifiuta un corpus di %i casi", (count) => {
    expect(() => computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: cases(count) })).toThrow(/corpus_size_invalid/);
  });

  it("rifiuta customerKey duplicati", () => {
    const duplicated = cases(); duplicated[39] = { ...duplicated[39], customerKey: duplicated[0].customerKey };
    expect(() => computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: duplicated })).toThrow(/customer_key_duplicate/);
  });

  it("distingue il corpus baseline quando una fonte originaria cambia", () => {
    const baseline = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: cases() });
    const changedCases = cases(); changedCases[7] = { ...changedCases[7], dossierSha256: sha("e") };
    const candidate = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: changedCases });
    expect(compareAprInputCorpusFingerprint(baseline, candidate)).toMatchObject({ matches: false, changedSourceCases: ["fixture-08"] });
    expect(() => assertAprInputCorpusMatchesBaseline(baseline, candidate)).toThrow(/baseline_mismatch/);
  });
});
