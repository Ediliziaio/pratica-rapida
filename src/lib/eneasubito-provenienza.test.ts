import { describe, expect, it } from "vitest";

import {
  costoPerPratica,
  leggi,
  quotaDiConversione,
  raggruppa,
} from "./eneasubito-provenienza";

describe("leggi — da cosa e' arrivato", () => {
  it("un clic con identificativo Google e' pagato, qualunque altra cosa dica l'indirizzo", () => {
    const l = leggi({ gclid: "Cj0KCQ", rinvio: "facebook.com", sorgente: "newsletter" });
    expect(l.gruppo).toBe("google_annunci");
    expect(l.aPagamento).toBe(true);
  });

  it("riconosce una campagna marcata da noi", () => {
    const l = leggi({ sorgente: "newsletter", mezzo: "email", campagna: "ottobre" });
    expect(l.gruppo).toBe("campagna");
    expect(l.etichetta).toContain("newsletter");
    expect(l.aPagamento).toBe(false);
  });

  it("distingue Google a pagamento da Google gratuito", () => {
    expect(leggi({ sorgente: "google", mezzo: "cpc" }).aPagamento).toBe(true);
    expect(leggi({ sorgente: "google", mezzo: "organico" }).aPagamento).toBe(false);
  });

  it("riconosce ChatGPT sia dalla campagna sia dal sito di partenza", () => {
    expect(leggi({ sorgente: "chatgpt", mezzo: "cpc" }).gruppo).toBe("chatgpt");
    expect(leggi({ rinvio: "chatgpt.com" }).gruppo).toBe("chatgpt");
  });

  it("una ricerca gratuita su Google non e' una spesa", () => {
    const l = leggi({ rinvio: "google.com" });
    expect(l.gruppo).toBe("google_ricerca");
    expect(l.aPagamento).toBe(false);
  });

  it("senza nessun indizio dice diretto, e non se lo inventa", () => {
    const l = leggi({ pagina: "/", quando: "2026-10-13T08:00:00Z" });
    expect(l.gruppo).toBe("diretto");
    expect(l.aPagamento).toBe(false);
  });

  it("senza provenienza registrata lo dice in chiaro", () => {
    expect(leggi(null).gruppo).toBe("sconosciuta");
    expect(leggi(null).etichetta).toBe("Nessuna pubblicità registrata");
  });
});

describe("raggruppa", () => {
  const pratica = (over: Record<string, unknown> = {}) => ({
    cliente_nome: "Mario",
    cliente_cognome: "Rossi",
    prezzo: 99,
    pagamento_stato: "pagata",
    provenienza: { gclid: "x" },
    ...over,
  });

  // Chi apre il modulo e non paga non e' un cliente: i due numeri restano
  // separati, perche' l'obiettivo del Titolare e' tre VENDITE al giorno.
  it("tiene separati chi arriva da chi paga", () => {
    const righe = raggruppa([
      pratica(),
      pratica({ cliente_nome: "Anna", pagamento_stato: "non_pagata" }),
      pratica({ cliente_nome: "Ugo", provenienza: { rinvio: "google.com" } }),
    ]);
    const annunci = righe.find((r) => r.gruppo === "google_annunci")!;
    expect(annunci.arrivate).toBe(2);
    expect(annunci.pagate).toBe(1);
    expect(annunci.incassato).toBe(99);
    expect(righe.find((r) => r.gruppo === "google_ricerca")!.pagate).toBe(1);
  });

  it("non somma i rimborsi e non li conta come vendite", () => {
    const righe = raggruppa([pratica({ pagamento_stato: "rimborsata" })]);
    expect(righe[0].incassato).toBe(0);
    expect(righe[0].arrivate).toBe(1);
    expect(righe[0].pagate).toBe(0);
  });

  it("mette in cima il gruppo che vende di piu', non quello piu' visitato", () => {
    const righe = raggruppa([
      // Tre arrivi dalla ricerca gratuita ma nessuno paga.
      pratica({ provenienza: { rinvio: "google.com" }, pagamento_stato: "non_pagata" }),
      pratica({ provenienza: { rinvio: "google.com" }, pagamento_stato: "non_pagata" }),
      pratica({ provenienza: { rinvio: "google.com" }, pagamento_stato: "non_pagata" }),
      // Uno solo dall'annuncio, ma paga.
      pratica(),
    ]);
    expect(righe[0].gruppo).toBe("google_annunci");
  });

  it("elenca solo i clienti che hanno pagato, in ordine", () => {
    const righe = raggruppa([
      pratica({ cliente_nome: "Zeno", cliente_cognome: "Verdi" }),
      pratica({ cliente_nome: "Anna", cliente_cognome: "Bianchi" }),
      pratica({ cliente_nome: "Ugo", cliente_cognome: "Neri", pagamento_stato: "non_pagata" }),
    ]);
    expect(righe[0].clienti).toEqual(["Anna Bianchi", "Zeno Verdi"]);
  });
});

describe("quotaDiConversione", () => {
  it("dice quanti fra gli arrivati hanno pagato", () => {
    expect(quotaDiConversione(10, 3)).toBe(0.3);
  });

  it("non risponde se non e' arrivato nessuno", () => {
    expect(quotaDiConversione(0, 0)).toBeNull();
  });
});

describe("costoPerPratica", () => {
  it("divide la spesa per le pratiche", () => {
    expect(costoPerPratica(5, 60)).toBe(12);
  });

  // Senza la spesa inserita non si inventa un costo: diventerebbe la base di
  // una decisione su dove mettere i soldi.
  it.each([
    ["spesa non inserita", 5, null],
    ["spesa a zero", 5, 0],
    ["nessuna pratica", 0, 100],
  ])("non risponde quando %s", (_caso, pratiche, spesa) => {
    expect(costoPerPratica(pratiche as number, spesa as number | null)).toBeNull();
  });
});
