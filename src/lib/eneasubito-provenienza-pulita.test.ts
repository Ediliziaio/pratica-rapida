/**
 * Il confine di sicurezza: cosa si accetta di scrivere in banca dati.
 *
 * La provenienza arriva dall'indirizzo del browser, cioe' da chiunque passi
 * sul sito. Questi test dicono cosa entra e cosa no.
 */
import { describe, expect, it } from "vitest";

import {
  CAMPI_PROVENIENZA,
  LUNGHEZZA_MASSIMA,
  provenienzaPulita,
} from "../../supabase/functions/_shared/provenienza";

describe("provenienzaPulita", () => {
  it("tiene i campi previsti", () => {
    const pulita = provenienzaPulita({
      sorgente: "google",
      mezzo: "cpc",
      campagna: "infissi-90giorni",
      gclid: "Cj0KCQ",
      rinvio: "google.com",
      pagina: "/verifica",
    });
    expect(pulita).toEqual({
      sorgente: "google",
      mezzo: "cpc",
      campagna: "infissi-90giorni",
      gclid: "Cj0KCQ",
      rinvio: "google.com",
      pagina: "/verifica",
    });
  });

  // L'elenco e' chiuso: un campo che non abbiamo previsto non deve poter
  // finire sulla pratica, qualunque cosa ci scriva dentro chi passa.
  it("butta via tutto quello che non e' previsto", () => {
    const pulita = provenienzaPulita({
      sorgente: "google",
      cliente_email: "furbo@esempio.it",
      prezzo: "0",
      pagamento_stato: "pagata",
      "<script>": "alert(1)",
    });
    expect(pulita).toEqual({ sorgente: "google" });
  });

  it("taglia i valori chilometrici", () => {
    const pulita = provenienzaPulita({ campagna: "x".repeat(5000) });
    expect(pulita?.campagna?.length).toBe(LUNGHEZZA_MASSIMA);
  });

  it("toglie i caratteri di controllo e gli a capo", () => {
    const pulita = provenienzaPulita({ campagna: "prima\u0000riga\nseconda\triga" });
    expect(pulita?.campagna).toBe("prima riga seconda riga");
  });

  it("ignora i valori che non sono testo", () => {
    const pulita = provenienzaPulita({ sorgente: 42, mezzo: { a: 1 }, campagna: ["x"], parola: "ok" });
    expect(pulita).toEqual({ parola: "ok" });
  });

  it("risponde niente quando non resta niente di utile", () => {
    expect(provenienzaPulita({ sorgente: "   " })).toBeNull();
    expect(provenienzaPulita({})).toBeNull();
    expect(provenienzaPulita(null)).toBeNull();
    expect(provenienzaPulita("una stringa")).toBeNull();
    expect(provenienzaPulita([1, 2, 3])).toBeNull();
  });

  it("i campi previsti sono quelli, e sono nove", () => {
    expect([...CAMPI_PROVENIENZA]).toEqual([
      "sorgente", "mezzo", "campagna", "parola", "variante",
      "gclid", "rinvio", "pagina", "quando",
    ]);
  });
});
