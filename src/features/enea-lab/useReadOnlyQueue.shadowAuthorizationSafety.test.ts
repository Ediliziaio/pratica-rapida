import { describe, expect, it } from "vitest";
import { resolveEneaLabQueueMode } from "./useReadOnlyQueue";

const AUTHORIZATION = {
  source: "user",
  phrase: "APR operativo ombra",
} as const;

describe("ENEA Lab read-only queue shadow authorization", () => {
  it("resta pre-shadow senza il gate esplicito dell'utente", () => {
    expect(resolveEneaLabQueueMode(false)).toBe("pre-shadow");
  });

  it("abilita la lettura live soltanto con la frase canonica dell'utente", () => {
    expect(resolveEneaLabQueueMode(false, AUTHORIZATION)).toBe("live-shadow");
    expect(resolveEneaLabQueueMode(false, {
      source: "user",
      phrase: "APR operativo ombra ",
    } as unknown)).toBe("pre-shadow");
  });

  it("mantiene la preview sempre su dati demo anche dopo il gate", () => {
    expect(resolveEneaLabQueueMode(true, AUTHORIZATION)).toBe("preview");
  });
});
