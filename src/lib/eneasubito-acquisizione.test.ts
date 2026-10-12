import { describe, expect, it } from "vitest";

import {
  andamento,
  costoMedio,
  cruscotto,
  giorniDelMese,
  giorniTrascorsi,
  meseCorrente,
  meseLeggibile,
  PRATICHE_AL_GIORNO,
  spesaTotale,
  TETTO_COSTO_PRATICA,
} from "./eneasubito-acquisizione";
import type { RigaConteggio } from "./eneasubito-provenienza";

const IL_13_OTTOBRE = new Date("2026-10-13T09:00:00Z");

const riga = (over: Partial<RigaConteggio> = {}): RigaConteggio => ({
  gruppo: "google_annunci",
  etichetta: "Google — annuncio a pagamento",
  pratiche: 10,
  incassato: 990,
  aPagamento: true,
  clienti: [],
  ...over,
});

describe("gli obiettivi decisi dal Titolare", () => {
  it("sono tre pratiche al giorno e venti euro a pratica", () => {
    expect(PRATICHE_AL_GIORNO).toBe(3);
    expect(TETTO_COSTO_PRATICA).toBe(20);
  });
});

describe("il mese", () => {
  it("si calcola nel fuso italiano", () => {
    // Il 31 ottobre alle 23 UTC in Italia e' gia' il 1 novembre.
    expect(meseCorrente(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });

  it("si scrive come lo legge una persona", () => {
    expect(meseLeggibile("2026-10")).toBe("ottobre 2026");
  });

  it("sa quanti giorni ha", () => {
    expect(giorniDelMese("2026-10")).toBe(31);
    expect(giorniDelMese("2026-02")).toBe(28);
    expect(giorniDelMese("2028-02")).toBe(29);
  });

  it("nel mese in corso conta i giorni fino a oggi, nei mesi chiusi tutti", () => {
    expect(giorniTrascorsi("2026-10", IL_13_OTTOBRE)).toBe(13);
    expect(giorniTrascorsi("2026-09", IL_13_OTTOBRE)).toBe(30);
  });
});

describe("andamento", () => {
  it("misura sul passo, non sul totale del mese", () => {
    // Il 13 ottobre con 39 pratiche si e' esattamente in pari: 13 x 3.
    const a = andamento(39, "2026-10", IL_13_OTTOBRE);
    expect(a.atteseAOggi).toBe(39);
    expect(a.inPari).toBe(true);
    expect(a.mediaAlGiorno).toBe(3);
    expect(a.attesePerIlMese).toBe(93);
  });

  it("dice quando si e' indietro", () => {
    const a = andamento(10, "2026-10", IL_13_OTTOBRE);
    expect(a.inPari).toBe(false);
  });
});

describe("cruscotto", () => {
  it("calcola il costo per pratica dove c'e' la spesa", () => {
    const righe = cruscotto([riga()], { google_annunci: 120 });
    expect(righe[0].costo).toBe(12);
    expect(righe[0].sopraIlTetto).toBe(false);
  });

  it("segnala quando si sfonda il tetto dei venti euro", () => {
    const righe = cruscotto([riga({ pratiche: 4 })], { google_annunci: 120 });
    expect(righe[0].costo).toBe(30);
    expect(righe[0].sopraIlTetto).toBe(true);
  });

  // Senza la spesa inserita non si stima: il numero servirebbe a decidere
  // dove mettere i soldi, e un numero inventato porta a decidere male.
  it("lascia vuoto il costo quando la spesa non e' stata inserita", () => {
    const righe = cruscotto([riga()], {});
    expect(righe[0].spesa).toBeNull();
    expect(righe[0].costo).toBeNull();
    expect(righe[0].sopraIlTetto).toBe(false);
  });

  it("mostra comunque un gruppo su cui si e' speso senza ricavare niente", () => {
    const righe = cruscotto([riga()], { google_annunci: 120, chatgpt: 80 });
    const buttati = righe.find((r) => r.gruppo === "chatgpt")!;
    expect(buttati.pratiche).toBe(0);
    expect(buttati.spesa).toBe(80);
    expect(buttati.sopraIlTetto).toBe(true);
  });
});

describe("i totali del mese", () => {
  it("sommano la spesa dichiarata", () => {
    expect(spesaTotale({ google_annunci: 120, chatgpt: 80 })).toBe(200);
    expect(spesaTotale(undefined)).toBe(0);
  });

  it("danno il costo medio su tutte le pratiche, non la media dei costi", () => {
    // 200 € su 14 pratiche = 14,28 a pratica. La media fra 12 e 20 darebbe 16.
    const righe = cruscotto(
      [riga({ pratiche: 10 }), riga({ gruppo: "chatgpt", etichetta: "ChatGPT", pratiche: 4 })],
      { google_annunci: 120, chatgpt: 80 },
    );
    expect(costoMedio(righe)).toBeCloseTo(200 / 14, 5);
  });

  it("non inventa un costo medio senza spesa", () => {
    expect(costoMedio(cruscotto([riga()], {}))).toBeNull();
  });
});
