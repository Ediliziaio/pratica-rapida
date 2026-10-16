/**
 * La regola che decide quale sollecito parte.
 *
 * E' il punto dove si fa il danno vero: un messaggio mandato due volte, o
 * mandato a chi ha gia' pagato, e' peggio di un messaggio non mandato. Per
 * questo la regola sta in `_shared` e si prova qui, senza database e senza
 * spedire niente.
 */
import { describe, expect, it } from "vitest";

import {
  corpo,
  inFasciaUtile,
  PREZZO_SCONTATO,
  qualeTocca,
  SOLLECITI,
  type StatoPratica,
} from "../../supabase/functions/_shared/eneasubito-solleciti";

const ADESSO = new Date("2026-10-16T12:00:00Z");

function oreFa(ore: number): string {
  return new Date(ADESSO.getTime() - ore * 3_600_000).toISOString();
}

function pratica(modifiche: Partial<StatoPratica> = {}): StatoPratica {
  return {
    creataIl: oreFa(2),
    pagata: false,
    archiviata: false,
    disiscritta: false,
    giaInviati: [],
    email: "mario@esempio.it",
    ...modifiche,
  };
}

describe("qualeTocca", () => {
  it("non scrive a chi e' appena arrivato", () => {
    expect(qualeTocca(pratica({ creataIl: oreFa(0.2) }), ADESSO)).toBeNull();
  });

  // Deciso dal Titolare il 16/10: il primo messaggio il giorno dopo, non
  // dopo un'ora. A un'ora la persona puo' essere ancora al computer a cercare
  // la fattura, e il primo contatto in assoluto non deve sembrare che la
  // stiamo guardando.
  it("il primo non parte in giornata", () => {
    expect(qualeTocca(pratica({ creataIl: oreFa(1.5) }), ADESSO)).toBeNull();
    expect(qualeTocca(pratica({ creataIl: oreFa(20) }), ADESSO)).toBeNull();
  });

  it("manda il primo il giorno dopo", () => {
    expect(qualeTocca(pratica({ creataIl: oreFa(25) }), ADESSO)?.numero).toBe(1);
  });

  // Qualunque sia il tempo passato, se non e' partito niente si comincia dal
  // primo: a chi non ha mai sentito la nostra voce non si apre con «ultimo
  // messaggio, sconto per 24 ore».
  it.each([25, 24 * 4, 24 * 8, 24 * 13, 24 * 60])(
    "dopo %i ore senza averne mandato nessuno, parte sempre il primo",
    (ore) => {
      expect(qualeTocca(pratica({ creataIl: oreFa(ore) }), ADESSO)?.numero).toBe(1);
    },
  );

  // E poi si prosegue in ordine, uno per volta.
  it.each([
    [[1], 2],
    [[1, 2], 3],
    [[1, 2, 3], 4],
    [[1, 2, 3, 4], 5],
  ])("con %j gia' partiti, tocca il %i", (gia, atteso) => {
    const p = pratica({ creataIl: oreFa(24 * 30), giaInviati: gia as number[] });
    expect(qualeTocca(p, ADESSO)?.numero).toBe(atteso);
  });

  // Il caso vero: l'orologio e' rimasto fermo un giorno, oppure la spedizione
  // era spenta. Non si scaricano addosso tre messaggi insieme.
  it("ne manda uno solo alla volta anche se e' rimasta indietro", () => {
    const vecchia = pratica({ creataIl: oreFa(24 * 20), giaInviati: [1] });
    expect(qualeTocca(vecchia, ADESSO)?.numero).toBe(2);
  });

  it("non ripete quello che ha gia' mandato", () => {
    const p = pratica({ creataIl: oreFa(2), giaInviati: [1] });
    expect(qualeTocca(p, ADESSO)).toBeNull();
  });

  it("si ferma quando sono partiti tutti e cinque", () => {
    const p = pratica({ creataIl: oreFa(24 * 30), giaInviati: [1, 2, 3, 4, 5] });
    expect(qualeTocca(p, ADESSO)).toBeNull();
  });

  // Le tre ragioni per tacere. Ognuna qui sotto e' una mail che, se partisse,
  // sarebbe un danno: a chi ha gia' pagato, a chi e' stato archiviato, a chi
  // ha chiesto di non ricevere piu' niente.
  it.each([
    ["ha gia' pagato", { pagata: true }],
    ["e' archiviata", { archiviata: true }],
    ["si e' disiscritto", { disiscritta: true }],
    ["non ha un indirizzo", { email: null }],
    ["ha un indirizzo malfatto", { email: "mario" }],
  ])("tace se %s", (_perche, modifiche) => {
    const p = pratica({ creataIl: oreFa(24 * 20), ...modifiche });
    expect(qualeTocca(p, ADESSO)).toBeNull();
  });

  it("regge una data illeggibile senza esplodere", () => {
    expect(qualeTocca(pratica({ creataIl: "non una data" }), ADESSO)).toBeNull();
  });

  it("i cinque sono in ordine di tempo crescente", () => {
    const ore = SOLLECITI.map((s) => s.dopoOre);
    expect([...ore].sort((a, b) => a - b)).toEqual(ore);
  });

  it("il primo e' il giorno dopo e l'ultimo entro due settimane", () => {
    expect(SOLLECITI[0].dopoOre).toBe(24);
    expect(SOLLECITI[4].dopoOre).toBe(24 * 13);
  });

  // Chi compila alle due di notte non si becca la mail alle due di notte:
  // l'orologio gira ogni ora e non guarda la sveglia.
  it("di notte tace, al mattino riprende", () => {
    const vecchia = pratica({ creataIl: new Date("2026-10-01T10:00:00Z").toISOString() });
    // 02:00 in Italia (ora legale: UTC+2)
    expect(qualeTocca(vecchia, new Date("2026-10-16T00:00:00Z"))).toBeNull();
    // 09:00 in Italia
    expect(qualeTocca(vecchia, new Date("2026-10-16T07:00:00Z"))?.numero).toBe(1);
  });
});

describe("inFasciaUtile", () => {
  // Le ore sono in UTC; d'estate l'Italia e' UTC+2, d'inverno UTC+1.
  it.each([
    ["2026-10-16T05:00:00Z", "07:00 italiane", false],
    ["2026-10-16T05:29:00Z", "07:29 italiane", false],
    ["2026-10-16T05:30:00Z", "07:30 italiane", true],
    ["2026-10-16T12:00:00Z", "14:00 italiane", true],
    ["2026-10-16T20:59:00Z", "22:59 italiane", true],
    ["2026-10-16T21:00:00Z", "23:00 italiane", false],
    ["2026-10-16T01:00:00Z", "03:00 italiane", false],
  ])("%s (%s) -> %s", (quando, _etichetta, atteso) => {
    expect(inFasciaUtile(new Date(quando as string))).toBe(atteso);
  });

  // Il cambio dell'ora legale non si calcola a mano: a gennaio l'Italia e'
  // UTC+1, quindi la stessa ora UTC cade in una fascia diversa.
  it("segue l'ora legale", () => {
    expect(inFasciaUtile(new Date("2027-01-16T06:30:00Z"))).toBe(true); // 07:30
    expect(inFasciaUtile(new Date("2027-01-16T06:00:00Z"))).toBe(false); // 07:00
  });
});

describe("corpo", () => {
  const dati = {
    nome: "Mario Rossi",
    intervento: "infissi",
    giorniRimasti: null as number | null,
    linkRipresa: "https://www.eneasubito.it/verifica",
    linkDisiscrizione: "https://www.eneasubito.it/stop/abc",
  };

  it("chiama la persona per nome, senza cognome", () => {
    expect(corpo(1, dati)).toContain("Ciao Mario,");
    expect(corpo(1, dati)).not.toContain("Rossi");
  });

  // Obbligo di legge, e conviene: chi si toglie da solo e' chi altrimenti
  // avrebbe premuto «segnala spam», e quella segnalazione fa danno a tutti
  // gli altri messaggi che partono da questo dominio.
  it.each([1, 2, 3, 4, 5])("il messaggio %i porta sempre la disiscrizione", (n) => {
    expect(corpo(n, dati)).toContain(dati.linkDisiscrizione);
  });

  it.each([1, 2, 3, 5])("il messaggio %i porta il link per riprendere", (n) => {
    expect(corpo(n, dati)).toContain(dati.linkRipresa);
  });

  // Il numero si dice solo quando e' poco: chi ha finito i lavori da una
  // settimana e legge «ti restano 83 giorni» rimanda, e la scadenza da leva
  // diventa rassicurazione.
  it("sul quarto scrive i giorni solo quando sono pochi", () => {
    expect(corpo(4, { ...dati, giorniRimasti: 23 })).toContain("ti restano 23 giorni");
    expect(corpo(4, { ...dati, giorniRimasti: 83 })).not.toContain("83");
    expect(corpo(4, { ...dati, giorniRimasti: null })).toContain("entro 90 giorni");
  });

  it("l'ultimo porta lo sconto deciso dal Titolare", () => {
    expect(PREZZO_SCONTATO).toBe(79);
    expect(corpo(5, dati)).toContain("79 €");
    expect(corpo(5, dati)).toContain("l'ultimo");
  });

  it("nomina l'intervento che ha scelto davvero", () => {
    expect(corpo(1, { ...dati, intervento: "pompa di calore" })).toContain("pompa di calore");
  });
});
