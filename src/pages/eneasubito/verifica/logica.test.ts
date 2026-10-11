import { describe, expect, it } from "vitest";

import { completa, giorniDaFineLavori, giorniRimasti, TERMINE_GIORNI } from "./logica";

const OGGI = new Date("2026-10-11T12:00:00Z");

describe("giorniDaFineLavori", () => {
  it("conta i giorni di calendario", () => {
    expect(giorniDaFineLavori("2026-10-01", OGGI)).toBe(10);
  });

  it("vale zero il giorno stesso", () => {
    expect(giorniDaFineLavori("2026-10-11", OGGI)).toBe(0);
  });

  it("e' negativo se la data e' nel futuro", () => {
    expect(giorniDaFineLavori("2026-10-20", OGGI)).toBe(-9);
  });

  it("rifiuta una data scritta male", () => {
    expect(giorniDaFineLavori("11/10/2026", OGGI)).toBeNull();
    expect(giorniDaFineLavori("", OGGI)).toBeNull();
  });
});

describe("giorniRimasti", () => {
  it("al novantesimo giorno ne resta zero", () => {
    expect(giorniRimasti("2026-07-13", OGGI)).toBe(0);
  });

  it("al novantunesimo e' fuori termine", () => {
    expect(giorniRimasti("2026-07-12", OGGI)).toBe(-1);
  });

  it("il termine e' novanta giorni", () => {
    expect(TERMINE_GIORNI).toBe(90);
  });
});

describe("completa", () => {
  const buona = { famiglia: "infissi" as const, nome: "Mario Rossi", email: "mario@esempio.it" };

  it("passa quando c'e' tutto", () => {
    expect(completa(buona, true)).toBe(true);
  });

  // Nessuno di questi quattro e' facoltativo: senza fattura non si incassa,
  // senza nome non sappiamo di chi e' la detrazione.
  it.each([
    ["senza intervento", { ...buona, famiglia: null }, true],
    ["senza nome", { ...buona, nome: "" }, true],
    ["con un nome di una lettera", { ...buona, nome: "M" }, true],
    ["con un'e-mail sbagliata", { ...buona, email: "mario@" }, true],
    ["senza fattura", buona, false],
  ])("si ferma %s", (_nome, richiesta, fattura) => {
    expect(completa(richiesta, fattura)).toBe(false);
  });

  it("non si fa ingannare da spazi", () => {
    expect(completa({ ...buona, nome: "   " }, true)).toBe(false);
    expect(completa({ ...buona, email: "  mario@esempio.it  " }, true)).toBe(true);
  });
});
