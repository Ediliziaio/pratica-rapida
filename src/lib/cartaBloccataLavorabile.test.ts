/**
 * Una pratica con la carta bloccata è lavorabile come una pagata.
 *
 * Il Titolare guarda il CRM per sapere cosa c'è da fare: una scheda compilata
 * che resta in «Chiamati in attesa» è lavoro che sparisce. Succedeva a tutte
 * le pratiche di EneaSubito, perché dal 21/10/2026 lì la carta si blocca e si
 * incassa alla consegna, quindi `pagamento_stato` resta «non_pagata» apposta.
 *
 * L'altra metà di questi test è altrettanto importante: `pagamento_stato` NON
 * deve diventare «pagata» per questo. I conti, le fatture mensili e il
 * cruscotto leggono quel campo, e una carta bloccata non è un incasso.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("carta bloccata = pratica lavorabile", () => {
  const migration = source(
    "supabase/migrations/20261029180000_lavorabile_anche_con_carta_bloccata.sql",
  );

  it("ridefinisce il punto di decisione, non la singola pratica", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.submit_form_by_token");
    expect(migration).not.toMatch(/WHERE\s+id\s*=\s*'[0-9a-f-]{36}'/i);
  });

  it("legge la carta bloccata dalla pratica", () => {
    expect(migration).toContain("carta_bloccata_at");
    expect(migration).toContain("INTO v_practice_id, v_brand, v_tipo_fatturazione, v_pagamento_stato, v_carta_bloccata_at");
  });

  it("i soldi sono garantiti sia se incassati sia se bloccati", () => {
    expect(migration).toContain("v_pagamento_garantito := v_pagamento_stato = 'pagata'");
    expect(migration).toContain("OR v_carta_bloccata_at IS NOT NULL");
  });

  // I due punti dove si decide la colonna: la ricerca dello stage d'arrivo e
  // la scelta nella UPDATE. Se ne resta anche uno solo legato al vecchio
  // «pagata», la scheda non si muove.
  it("la colonna d'arrivo si cerca anche con la carta bloccata", () => {
    expect(migration).toContain("IF NOT v_payment_required OR v_pagamento_garantito THEN");
    expect(migration).toContain("AND stage_type = 'pronte_da_fare'");
  });

  it("la scheda resta ferma solo se i soldi non ci sono in nessuna forma", () => {
    expect(migration).toContain(
      "WHEN v_payment_required AND NOT v_pagamento_garantito THEN current_stage_id",
    );
  });

  it("nessuna condizione sullo stage guarda più il solo «pagata»", () => {
    expect(migration).not.toContain("NOT v_payment_required OR v_pagamento_stato = 'pagata'");
    expect(migration).not.toContain(
      "WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN current_stage_id",
    );
  });

  // Il campo del denaro non si tocca: una carta bloccata non è un incasso.
  it("non segna la pratica come pagata", () => {
    expect(migration).not.toContain("pagamento_stato = 'pagata'::public.pagamento_stato,");
    expect(migration).toContain(
      "WHEN v_payment_required AND v_pagamento_stato IS DISTINCT FROM 'pagata'::public.pagamento_stato THEN 'non_pagata'::public.pagamento_stato",
    );
  });

  // Gli altri cancelli del modulo restano dove sono.
  it("lascia in piedi gli altri controlli", () => {
    expect(migration).toContain("Fattura obbligatoria: carica la fattura prima di inviare il modulo");
    expect(migration).toContain("Dati catastali obbligatori");
    expect(migration).toContain("Pratica non trovata, archiviata o già compilata");
  });

  // Il blocco carta lo scrive solo il webhook di EneaSubito: il percorso dei
  // rivenditori non lo incontra mai, quindi per loro non cambia niente.
  it("la carta bloccata nasce solo in EneaSubito", () => {
    const webhook = source("supabase/functions/eneasubito-pagato/index.ts");
    expect(webhook).toContain("carta_bloccata_at");
    const intake = source("supabase/functions/richiesta-pubblica/index.ts");
    expect(intake).not.toContain("carta_bloccata_at");
  });
});
