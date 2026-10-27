/**
 * I promemoria di pagamento al privato della pagina pubblica: quando partono
 * e quando tacciono. Le ore sono di Roma; ottobre 2026 e' ancora ora legale
 * fino al 25, poi ora solare (UTC+1).
 */
import { describe, expect, it } from "vitest";

import {
  ePrivatoDelSitoDaPagare,
  inFasciaClienti,
  qualePromemoria,
  type StatoPromemoria,
} from "../../supabase/functions/_shared/promemoria-privati-sito";

const roma = (iso: string) => new Date(iso); // gli ISO qui sotto portano gia' l'offset

const base: StatoPromemoria = {
  creataIl: "2026-10-26T10:00:00+01:00", // lunedi'
  inviati: 0,
  ultimoIl: null,
  pagata: false,
  archiviata: false,
  email: "cliente@example.com",
};

describe("fasce in cui si scrive ai clienti", () => {
  it("feriali dalle 8:30 alle 22", () => {
    expect(inFasciaClienti(roma("2026-10-27T08:29:00+01:00"))).toBe(false);
    expect(inFasciaClienti(roma("2026-10-27T08:30:00+01:00"))).toBe(true);
    expect(inFasciaClienti(roma("2026-10-27T21:59:00+01:00"))).toBe(true);
    expect(inFasciaClienti(roma("2026-10-27T22:00:00+01:00"))).toBe(false);
  });
  it("sabato solo fino alle 14", () => {
    expect(inFasciaClienti(roma("2026-10-31T13:59:00+01:00"))).toBe(true);
    expect(inFasciaClienti(roma("2026-10-31T14:00:00+01:00"))).toBe(false);
  });
  it("mai la domenica", () => {
    expect(inFasciaClienti(roma("2026-11-01T11:00:00+01:00"))).toBe(false);
  });
  it("guarda l'ora di Roma, non quella del server", () => {
    // 07:45 UTC = 08:45 a Roma (ora solare)
    expect(inFasciaClienti(new Date("2026-10-27T07:45:00Z"))).toBe(true);
  });
});

describe("quale promemoria tocca", () => {
  it("niente prima di un giorno: non si insegue chi ha appena scritto", () => {
    expect(qualePromemoria(base, roma("2026-10-26T10:40:00+01:00"))).toBeNull();
    expect(qualePromemoria(base, roma("2026-10-27T09:59:00+01:00"))).toBeNull();
  });
  it("il primo dopo un giorno", () => {
    expect(qualePromemoria(base, roma("2026-10-27T10:00:00+01:00"))).toBe(1);
  });
  it("il secondo dopo tre giorni, non prima", () => {
    const s = { ...base, inviati: 1, ultimoIl: "2026-10-27T10:00:00+01:00" };
    expect(qualePromemoria(s, roma("2026-10-28T10:00:00+01:00"))).toBeNull();
    expect(qualePromemoria(s, roma("2026-10-29T10:00:00+01:00"))).toBe(2);
  });
  it("dopo il quarto si smette", () => {
    const s = { ...base, inviati: 4, ultimoIl: "2026-11-05T10:00:00+01:00" };
    expect(qualePromemoria(s, roma("2026-11-20T10:00:00+01:00"))).toBeNull();
  });
  it("la domenica si aspetta lunedi'", () => {
    const s = { ...base, creataIl: "2026-10-31T11:00:00+01:00" }; // sabato
    expect(qualePromemoria(s, roma("2026-11-01T11:30:00+01:00"))).toBeNull();
    expect(qualePromemoria(s, roma("2026-11-02T08:30:00+01:00"))).toBe(1);
  });
  it("recuperando un ritardo, mai due a meno di 20 ore", () => {
    const s = { ...base, inviati: 1, ultimoIl: "2026-11-05T10:00:00+01:00" };
    expect(qualePromemoria(s, roma("2026-11-05T18:00:00+01:00"))).toBeNull();
    expect(qualePromemoria(s, roma("2026-11-06T06:30:00+01:00"))).toBeNull(); // fuori fascia
    expect(qualePromemoria(s, roma("2026-11-06T09:00:00+01:00"))).toBe(2);
  });
  it("chi ha pagato, e' archiviato o non ha e-mail non riceve niente", () => {
    const quando = roma("2026-10-28T10:00:00+01:00");
    expect(qualePromemoria({ ...base, pagata: true }, quando)).toBeNull();
    expect(qualePromemoria({ ...base, archiviata: true }, quando)).toBeNull();
    expect(qualePromemoria({ ...base, email: null }, quando)).toBeNull();
  });
});

describe("chi rientra", () => {
  it("solo il privato della pagina pubblica non ancora pagato", () => {
    expect(ePrivatoDelSitoDaPagare({ public_private_checkout_required: true, pagamento_stato: "non_pagata" })).toBe(true);
    expect(ePrivatoDelSitoDaPagare({ public_private_checkout_required: true, pagamento_stato: "pagata" })).toBe(false);
    expect(ePrivatoDelSitoDaPagare({ public_private_checkout_required: false, pagamento_stato: "non_pagata" })).toBe(false);
    expect(ePrivatoDelSitoDaPagare({ public_private_checkout_required: null, pagamento_stato: "non_pagata" })).toBe(false);
  });
});
