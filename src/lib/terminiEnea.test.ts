/**
 * I due numeri dettati dal Titolare il 27/10/2026: si avvisa dall'ottantesimo
 * giorno, si dichiara scaduto oltre il novantesimo.
 */
import { describe, expect, it } from "vitest";

import { avvisoTermine, giorniDaFineLavori, giorniRimasti } from "./terminiEnea";

const OGGI = new Date("2026-10-27T12:00:00Z");
const giorniFa = (n: number) => new Date(OGGI.getTime() - n * 86_400_000);

describe("giorniDaFineLavori", () => {
  it("conta i giorni di calendario", () => {
    expect(giorniDaFineLavori(giorniFa(0), OGGI)).toBe(0);
    expect(giorniDaFineLavori(giorniFa(45), OGGI)).toBe(45);
  });

  it("senza data non dice niente", () => {
    expect(giorniDaFineLavori(null, OGGI)).toBeNull();
    expect(giorniDaFineLavori(undefined, OGGI)).toBeNull();
  });

  // Una data futura e' un errore di battitura, non un termine scaduto.
  it("una data nel futuro vale come assente", () => {
    expect(giorniDaFineLavori(new Date("2026-12-01T12:00:00Z"), OGGI)).toBeNull();
  });
});

describe("avvisoTermine", () => {
  it.each([
    [0, "niente"],
    [50, "niente"],
    [79, "niente"],
    [80, "manca_poco"],
    [85, "manca_poco"],
    [90, "manca_poco"],
    [91, "scaduto"],
    [200, "scaduto"],
  ])("al giorno %i -> %s", (giorni, atteso) => {
    expect(avvisoTermine(giorni as number)).toBe(atteso);
  });

  it("senza data non si avvisa di niente", () => {
    expect(avvisoTermine(null)).toBe("niente");
  });

  // I due confini, scritti a parte perche' sono quelli che si sbagliano.
  it("il settantanovesimo giorno tace e l'ottantesimo parla", () => {
    expect(avvisoTermine(79)).toBe("niente");
    expect(avvisoTermine(80)).toBe("manca_poco");
  });

  it("il novantesimo e' ancora in tempo, il novantunesimo no", () => {
    expect(avvisoTermine(90)).toBe("manca_poco");
    expect(avvisoTermine(91)).toBe("scaduto");
  });
});

describe("giorniRimasti", () => {
  it.each([
    [80, 10],
    [89, 1],
    [90, 0],
  ])("al giorno %i ne restano %i", (passati, attesi) => {
    expect(giorniRimasti(passati as number)).toBe(attesi);
  });
});
