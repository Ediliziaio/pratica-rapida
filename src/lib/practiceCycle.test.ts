import { describe, expect, it } from "vitest";
import { practiceCycleDays } from "./practiceCycle";

describe("practiceCycleDays", () => {
  it("parte dalla creazione mentre la pratica e aperta", () => {
    expect(practiceCycleDays(
      { created_at: "2026-07-01T10:00:00.000Z", ciclo_chiuso_at: null },
      new Date("2026-10-21T10:00:00.000Z"),
    )).toBe(112);
  });

  it("si congela al primo ingresso in Invio pratica chiusa", () => {
    const practice = {
      created_at: "2026-07-01T10:00:00.000Z",
      ciclo_chiuso_at: "2026-07-11T10:00:00.000Z",
    };
    expect(practiceCycleDays(practice, new Date("2026-07-20T10:00:00.000Z"))).toBe(10);
    expect(practiceCycleDays(practice, new Date("2026-12-31T23:59:59.000Z"))).toBe(10);
  });

  it("non restituisce valori negativi o non numerici", () => {
    expect(practiceCycleDays({ created_at: null })).toBe(0);
    expect(practiceCycleDays({
      created_at: "2026-10-21T10:00:00.000Z",
      ciclo_chiuso_at: "2026-10-20T10:00:00.000Z",
    })).toBe(0);
  });
});
