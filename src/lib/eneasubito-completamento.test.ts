/**
 * I messaggi a chi ha pagato e non ha finito di compilare.
 *
 * Il danno qui e' diverso da quello dei solleciti di ripresa: scrivere a chi
 * ha gia' finito e' prendere in giro una persona che ci ha pagato. Per
 * questo il primo controllo e' proprio quello.
 */
import { describe, expect, it } from "vitest";

import {
  COMPLETAMENTO,
  corpo,
  qualeTocca,
  type StatoPagata,
} from "../../supabase/functions/_shared/eneasubito-completamento";

const ADESSO = new Date("2026-10-20T12:00:00Z");

function oreFa(ore: number): string {
  return new Date(ADESSO.getTime() - ore * 3_600_000).toISOString();
}

function pagata(modifiche: Partial<StatoPagata> = {}): StatoPagata {
  return {
    pagataIl: oreFa(5),
    compilatoIl: null,
    archiviata: false,
    disiscritta: false,
    giaInviati: [],
    email: "mario@esempio.it",
    ...modifiche,
  };
}

describe("qualeTocca", () => {
  it("tace nelle prime tre ore", () => {
    expect(qualeTocca(pagata({ pagataIl: oreFa(1) }), ADESSO)).toBeNull();
  });

  it("il primo parte dopo tre ore", () => {
    expect(qualeTocca(pagata({ pagataIl: oreFa(4) }), ADESSO)?.numero).toBe(1);
  });

  // Il controllo che conta: chi ha finito non deve ricevere niente.
  it("tace appena il modulo e' compilato", () => {
    const finita = pagata({ pagataIl: oreFa(24 * 10), compilatoIl: oreFa(2) });
    expect(qualeTocca(finita, ADESSO)).toBeNull();
  });

  it.each([
    ["e' archiviata", { archiviata: true }],
    ["si e' disiscritto", { disiscritta: true }],
    ["non ha un indirizzo", { email: null }],
  ])("tace se %s", (_perche, modifiche) => {
    const p = pagata({ pagataIl: oreFa(24 * 10), ...modifiche });
    expect(qualeTocca(p, ADESSO)).toBeNull();
  });

  // Uno alla volta, dal primo che manca: chi ha gia' pagato non si merita
  // quattro mail insieme perche' l'orologio e' rimasto fermo.
  it.each([4, 25, 24 * 4, 24 * 30])(
    "dopo %i ore senza averne mandato nessuno, parte sempre il primo",
    (ore) => {
      expect(qualeTocca(pagata({ pagataIl: oreFa(ore) }), ADESSO)?.numero).toBe(1);
    },
  );

  it.each([
    [[1], 2],
    [[1, 2], 3],
    [[1, 2, 3], 4],
  ])("con %j gia' partiti, tocca il %i", (gia, atteso) => {
    const p = pagata({ pagataIl: oreFa(24 * 20), giaInviati: gia as number[] });
    expect(qualeTocca(p, ADESSO)?.numero).toBe(atteso);
  });

  it("si ferma dopo il quarto", () => {
    const p = pagata({ pagataIl: oreFa(24 * 30), giaInviati: [1, 2, 3, 4] });
    expect(qualeTocca(p, ADESSO)).toBeNull();
  });

  it("rispetta l'orario quando glielo si chiede", () => {
    const p = pagata({ pagataIl: oreFa(24) });
    expect(qualeTocca(p, ADESSO, () => false)).toBeNull();
    expect(qualeTocca(p, ADESSO, () => true)?.numero).toBe(1);
  });

  it("i quattro sono in ordine di tempo crescente", () => {
    const ore = COMPLETAMENTO.map((c) => c.dopoOre);
    expect([...ore].sort((a, b) => a - b)).toEqual(ore);
  });

  it("il primo arriva lo stesso giorno", () => {
    expect(COMPLETAMENTO[0].dopoOre).toBeLessThanOrEqual(6);
  });
});

describe("corpo", () => {
  const dati = {
    nome: "Mario Rossi",
    linkModulo: "https://www.eneasubito.it/completa/abc",
    linkDisiscrizione: "https://www.eneasubito.it/stop/abc",
  };

  it("chiama la persona per nome, senza cognome", () => {
    expect(corpo(1, dati)).toContain("Ciao Mario,");
    expect(corpo(1, dati)).not.toContain("Rossi");
  });

  it.each([1, 2, 3, 4])("il messaggio %i porta il link per riprendere", (n) => {
    expect(corpo(n, dati)).toContain(dati.linkModulo);
  });

  it.each([1, 2, 3, 4])("il messaggio %i porta la disiscrizione", (n) => {
    expect(corpo(n, dati)).toContain(dati.linkDisiscrizione);
  });

  // Questa persona ha gia' pagato: qui non si vende niente, e soprattutto
  // non si offre uno sconto a chi ha gia' dato i soldi.
  it.each([1, 2, 3, 4])("il messaggio %i non parla di prezzi", (n) => {
    const testo = corpo(n, dati);
    expect(testo).not.toMatch(/99|79|sconto|€/);
  });

  it("il primo dice quanto tempo ci vuole", () => {
    expect(corpo(1, dati)).toContain("due minuti");
  });
});
