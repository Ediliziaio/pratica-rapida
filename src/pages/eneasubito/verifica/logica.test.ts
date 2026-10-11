/**
 * Il verdetto decide se incassare o no: i casi di confine vanno fissati qui,
 * non riscoperti in produzione. Il giorno 90 e il giorno 91 sono il punto in
 * cui un errore costa un rimborso.
 */
import { describe, expect, it } from "vitest";

import { giorniDaFineLavori, giorniRimasti, valuta, type Risposte } from "./logica";

const OGGI = new Date(2026, 9, 1); // 1 ottobre 2026

function risposte(sovrascrivi: Partial<Risposte> = {}): Risposte {
  return {
    famiglia: "infissi",
    nome: "Mario Rossi",
    fineLavori: "2026-09-01",
    email: "mario@esempio.it",
    fatturaCaricata: true,
    ...sovrascrivi,
  };
}

describe("conteggio dei giorni", () => {
  it("conta i giorni passati senza farsi ingannare dall'ora", () => {
    expect(giorniDaFineLavori("2026-10-01", OGGI)).toBe(0);
    expect(giorniDaFineLavori("2026-09-01", OGGI)).toBe(30);
  });

  it("rifiuta una data che non è una data", () => {
    expect(giorniDaFineLavori("", OGGI)).toBeNull();
    expect(giorniDaFineLavori("ieri", OGGI)).toBeNull();
  });

  it("dice quanti giorni restano", () => {
    expect(giorniRimasti("2026-09-01", OGGI)).toBe(60);
  });
});

describe("perimetro", () => {
  it("chiude subito quello che non trattiamo, senza chiedere altro", () => {
    const v = valuta(risposte({ famiglia: "altro" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(v.esito).toBe("non_si_puo_fare");
  });

  it("non decide finché non sa che lavoro è stato fatto", () => {
    const v = valuta(risposte({ famiglia: null }), { stato: "non_disponibile" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
  });
});

describe("i 90 giorni", () => {
  it("al novantesimo giorno non promettiamo: trasmettiamo noi, e non ci stiamo", () => {
    const v = valuta(risposte({ fineLavori: "2026-07-03" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(giorniDaFineLavori("2026-07-03", OGGI)).toBe(90);
    expect(v.esito).toBe("serve_un_controllo");
    expect(v.titolo).toContain("limite");
  });

  it("con il margine di lavorazione davanti, si promette", () => {
    // 86 giorni passati: ne restano 4, uno in più del margine.
    const v = valuta(risposte({ fineLavori: "2026-07-07" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(giorniDaFineLavori("2026-07-07", OGGI)).toBe(86);
    expect(v.esito).toBe("si_puo_fare");
  });

  it("oltre i 90 giorni non è un muro: si lavora lo stesso, col ravvedimento", () => {
    const v = valuta(risposte({ fineLavori: "2026-05-02" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
    expect(v.spiegazione).toContain("ravvedimento");
    expect(v.spiegazione).toContain("detraibile");
  });

  it("avvisa quando il tempo è poco, ma non blocca", () => {
    // 83 giorni passati, ne restano 7: sopra il margine, sotto l'allarme.
    const v = valuta(risposte({ fineLavori: "2026-07-10" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(v.esito).toBe("si_puo_fare");
    expect(v.motivi.some((m) => m.segno === "forse")).toBe(true);
  });

  it("non accetta lavori che devono ancora finire", () => {
    const v = valuta(risposte({ fineLavori: "2026-12-01" }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
  });
});

describe("la fattura", () => {
  it("senza documento non si dice di sì, nemmeno se tutto il resto torna", () => {
    const v = valuta(risposte({ fatturaCaricata: false }), { stato: "letta", totale: "9.840 €" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
  });

  it("se il lettore non è collegato si passa a un operatore, non si indovina", () => {
    const v = valuta(risposte(), { stato: "non_disponibile" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
  });

  it("se la fattura è illeggibile si passa a un operatore", () => {
    const v = valuta(risposte(), { stato: "illeggibile" }, OGGI);
    expect(v.esito).toBe("serve_un_controllo");
  });

  it("solo con la fattura letta si arriva al sì", () => {
    const v = valuta(risposte(), { stato: "letta", totale: "9.840 €", pezzi: "6 pezzi" }, OGGI);
    expect(v.esito).toBe("si_puo_fare");
    expect(v.motivi.some((m) => m.testo.includes("9.840 €"))).toBe(true);
  });
});
