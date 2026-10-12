import { beforeEach, describe, expect, it } from "vitest";

import {
  azzeraProvenienza,
  catturaProvenienza,
  leggiProvenienza,
  nomeSito,
  provenienzaVuota,
} from "./provenienza";

const ADESSO = new Date("2026-10-13T08:00:00Z");
const SITO = "https://www.eneasubito.it";

describe("leggiProvenienza", () => {
  it("prende i parametri della campagna", () => {
    const p = leggiProvenienza(
      `${SITO}/verifica?utm_source=google&utm_medium=cpc&utm_campaign=infissi-90giorni&utm_term=pratica%20enea%20infissi&utm_content=annuncio-b`,
      null,
      ADESSO,
    );
    expect(p.sorgente).toBe("google");
    expect(p.mezzo).toBe("cpc");
    expect(p.campagna).toBe("infissi-90giorni");
    expect(p.parola).toBe("pratica enea infissi");
    expect(p.variante).toBe("annuncio-b");
  });

  it("prende l'identificativo del clic di Google Ads", () => {
    const p = leggiProvenienza(`${SITO}/?gclid=Cj0KCQabc123`, null, ADESSO);
    expect(p.gclid).toBe("Cj0KCQabc123");
  });

  it("registra solo il nome del sito di partenza, mai l'indirizzo intero", () => {
    // L'indirizzo di una ricerca contiene quello che la persona ha digitato:
    // non lo si conserva.
    const p = leggiProvenienza(SITO, "https://www.google.com/search?q=cose+private+sue", ADESSO);
    expect(p.rinvio).toBe("google.com");
    expect(JSON.stringify(p)).not.toContain("cose+private");
  });

  it("non considera provenienza il passaggio da una nostra pagina all'altra", () => {
    const p = leggiProvenienza(`${SITO}/verifica`, `${SITO}/infissi`, ADESSO);
    expect(p.rinvio).toBeUndefined();
  });

  it("registra la pagina di atterraggio senza i parametri", () => {
    const p = leggiProvenienza(`${SITO}/infissi?utm_source=google&gclid=x`, null, ADESSO);
    expect(p.pagina).toBe("/infissi");
  });

  it("non lascia caselle vuote in giro", () => {
    const p = leggiProvenienza(SITO, null, ADESSO);
    expect(Object.keys(p).sort()).toEqual(["pagina", "quando"]);
    expect(provenienzaVuota(p)).toBe(true);
  });

  it("taglia i valori chilometrici e i caratteri strani", () => {
    const lungo = "a".repeat(400);
    const p = leggiProvenienza(`${SITO}/?utm_source=${lungo}`, null, ADESSO);
    expect((p.sorgente ?? "").length).toBe(120);
  });

  it("non si rompe su un indirizzo senza senso", () => {
    const p = leggiProvenienza("questo non e' un indirizzo", null, ADESSO);
    expect(p.quando).toBe(ADESSO.toISOString());
  });
});

describe("nomeSito", () => {
  it("toglie il www", () => {
    expect(nomeSito("https://www.google.com/qualcosa")).toBe("google.com");
  });

  it("risponde niente se non c'e' nessun rinvio", () => {
    expect(nomeSito("")).toBeUndefined();
    expect(nomeSito(null)).toBeUndefined();
  });
});

describe("catturaProvenienza — vince il primo tocco", () => {
  beforeEach(() => {
    azzeraProvenienza();
  });

  it("tiene la prima provenienza utile anche se poi si naviga", () => {
    catturaProvenienza(`${SITO}/?gclid=primo`, null, ADESSO);
    const dopo = catturaProvenienza(`${SITO}/verifica`, null, ADESSO);
    expect(dopo.gclid).toBe("primo");
  });

  it("se la prima non diceva niente, accetta la seconda", () => {
    sessionStorage.setItem(
      "eneasubito-provenienza",
      JSON.stringify({ pagina: "/", quando: ADESSO.toISOString() }),
    );
    const dopo = catturaProvenienza(`${SITO}/?utm_source=chatgpt`, null, ADESSO);
    expect(dopo.sorgente).toBe("chatgpt");
  });
});
