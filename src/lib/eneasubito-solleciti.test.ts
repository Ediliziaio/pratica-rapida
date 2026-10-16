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

  it("manda il primo dopo un'ora", () => {
    expect(qualeTocca(pratica({ creataIl: oreFa(1.5) }), ADESSO)?.numero).toBe(1);
  });

  // Qualunque sia il tempo passato, se non e' partito niente si comincia dal
  // primo: a chi non ha mai sentito la nostra voce non si apre con «ultimo
  // messaggio, sconto per 24 ore».
  it.each([1.5, 25, 24 * 4, 24 * 8, 24 * 13, 24 * 60])(
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
    const p = pratica({ creataIl: oreFa(24 * 20), giaInviati: gia as number[] });
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
