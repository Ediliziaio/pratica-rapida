import { describe, expect, it } from "vitest";

import { isEneaSubitoChannel, summarizeEneaSubitoMonth } from "./eneasubito-month";

const ADESSO = new Date("2026-10-15T10:00:00Z");

const pratica = (over: Record<string, unknown> = {}) => ({
  cliente_nome: "Mario",
  cliente_cognome: "Rossi",
  revenue_at: "2026-10-12T09:00:00Z",
  prezzo: 99,
  pagamento_stato: "pagata",
  ...over,
});

describe("summarizeEneaSubitoMonth", () => {
  it("conta le pratiche del mese e somma solo quelle pagate", () => {
    const r = summarizeEneaSubitoMonth([
      pratica(),
      pratica({ cliente_nome: "Anna", pagamento_stato: "non_pagata" }),
    ], ADESSO);
    expect(r.pratiche).toBe(2);
    expect(r.incassato).toBe(99);
  });

  it("lascia fuori i mesi precedenti", () => {
    const r = summarizeEneaSubitoMonth([
      pratica({ revenue_at: "2026-09-28T09:00:00Z" }),
    ], ADESSO);
    expect(r.pratiche).toBe(0);
    expect(r.incassato).toBe(0);
  });

  it("conta nel fuso di Roma, non in UTC", () => {
    // 30 settembre 23:00 UTC in Italia e' gia' il 1 ottobre: la pratica
    // appartiene a ottobre, come la vede il Titolare sul calendario.
    const r = summarizeEneaSubitoMonth([
      pratica({ revenue_at: "2026-09-30T23:00:00Z" }),
    ], ADESSO);
    expect(r.pratiche).toBe(1);
  });

  it("non somma i rimborsi ma li conta", () => {
    const r = summarizeEneaSubitoMonth([
      pratica({ pagamento_stato: "rimborsata" }),
    ], ADESSO);
    expect(r.pratiche).toBe(1);
    expect(r.incassato).toBe(0);
  });

  it("segnala le pratiche senza importo invece di stimarle", () => {
    const r = summarizeEneaSubitoMonth([
      pratica({ prezzo: null }),
      pratica({ cliente_nome: "Anna", prezzo: 0 }),
    ], ADESSO);
    expect(r.senzaImporto).toBe(2);
    expect(r.incassato).toBe(0);
  });

  it("elenca i clienti in ordine alfabetico", () => {
    const r = summarizeEneaSubitoMonth([
      pratica({ cliente_nome: "Zeno", cliente_cognome: "Verdi" }),
      pratica({ cliente_nome: "Anna", cliente_cognome: "Bianchi" }),
    ], ADESSO);
    expect(r.clienti).toEqual(["Anna Bianchi", "Zeno Verdi"]);
  });

  it("legge l'importo come arriva, senza ricalcolarlo", () => {
    const r = summarizeEneaSubitoMonth([pratica({ prezzo: "149" })], ADESSO);
    expect(r.incassato).toBe(149);
  });
});

describe("isEneaSubitoChannel", () => {
  it("riconosce solo il canale di EneaSubito", () => {
    expect(isEneaSubitoChannel({ canale: "eneasubito" })).toBe(true);
  });

  // Il cuore della non regressione: nessuna pratica di Pratica Rapida deve
  // uscire dai conti di prima per colpa di questa condizione.
  it.each([
    ["canale assente (tutto lo storico)", undefined],
    ["canale nullo", null],
    ["canale vuoto", ""],
    ["rivenditore", "rivenditore"],
    ["cliente finale dal sito", "privato_sito"],
  ])("lascia dentro Pratica Rapida: %s", (_nome, canale) => {
    expect(isEneaSubitoChannel({ canale: canale as string | null | undefined })).toBe(false);
  });
});
