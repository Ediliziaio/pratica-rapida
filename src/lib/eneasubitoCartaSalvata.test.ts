/**
 * I sette giorni del blocco partono da quando arriva la pratica.
 *
 * Decisione del Titolare del 05/11/2026: una cliente ha lasciato la carta il
 * 29/10 e mandato la pratica il 05/11, tre ore e mezza dopo la scadenza del
 * blocco. Niente incasso e niente fattura, su una pratica lavorata in giornata.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("carta salvata alla cassa, blocco all'arrivo della pratica", () => {
  const cassa = source("supabase/functions/eneasubito-pagamento/index.ts");
  const webhook = source("supabase/functions/eneasubito-pagato/index.ts");
  const blocca = source("supabase/functions/eneasubito-blocca/index.ts");
  const incassa = source("supabase/functions/eneasubito-incassa/index.ts");
  const migrazione = source("supabase/migrations/20261105210000_eneasubito_blocco_all_arrivo_pratica.sql");

  it("la cassa salva la carta e non blocca niente", () => {
    expect(cassa).toContain('mode: "setup"');
    expect(cassa).not.toContain('capture_method: "manual"');
  });

  it("il webhook segna la carta lasciata, non un incasso", () => {
    const ramo = webhook.slice(webhook.indexOf("if (cartaSalvata) {"), webhook.indexOf("if (cartaBloccata) {\n    const { error: erroreBlocco }"));
    expect(ramo).toContain("stripe_metodo_pagamento");
    expect(ramo).toContain("carta_bloccata_at");
    expect(ramo).not.toContain("pagamento_stato");
  });

  it("il blocco parte senza il cliente davanti e non si ripete", () => {
    expect(blocca).toContain('capture_method: "manual"');
    expect(blocca).toContain("off_session: true");
    expect(blocca).toContain("eneasubito-blocco-${pratica.id}");
    expect(blocca).toContain('.select("id, canale, cliente_email, pagamento_stato, stripe_payment_intent');
  });

  it("un rifiuto della banca non ferma la pratica e resta scritto", () => {
    expect(blocca).toContain("la banca non ha accettato il blocco");
    expect(blocca).not.toContain("current_stage_id");
  });

  it("alla consegna addebita la carta salvata solo se il blocco non c'e' di certo", () => {
    expect(incassa).toContain('!pratica.stripe_payment_intent || pagamento?.status === "canceled"');
    expect(incassa).toContain("eneasubito-addebito-${pratica.id}");
  });

  it("il database chiama il blocco quando la pratica e' compilata", () => {
    expect(migrazione).toContain("AFTER UPDATE OF form_compilato_at, stripe_metodo_pagamento");
    expect(migrazione).toContain("functions/v1/eneasubito-blocca");
    expect(migrazione).toContain("NEW.canale is distinct from 'eneasubito'");
  });
});
