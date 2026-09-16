import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ERRORE_FETCH_BLOCCATA,
  FUNZIONI_BLOCCATE,
  TABELLA_COMUNICAZIONI_BLOCCATE,
  destinatarioDa,
  installaGuardiaFetch,
  isOmbra,
  rigaBloccata,
} from "../../../../supabase/functions/_shared/ombraCore.ts";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../../../supabase/functions");
const NOW = new Date("2026-09-14T08:00:00.000Z");

describe("nucleo del blocco (ombraCore)", () => {
  it("è ombra solo con CRM_OMBRA=true esatto", () => {
    expect(isOmbra(() => "true")).toBe(true);
    expect(isOmbra(() => "1")).toBe(false);
    expect(isOmbra(() => undefined)).toBe(false);
  });

  it("estrae il destinatario dalle forme note e alleggerisce gli allegati", () => {
    expect(destinatarioDa({ to: "a@b.it" })).toBe("a@b.it");
    expect(destinatarioDa({ to: ["a@b.it", "c@d.it"] })).toBe("a@b.it, c@d.it");
    expect(destinatarioDa({ practice_id: "p1" })).toBe("practice_id:p1");
    expect(destinatarioDa({ scheduled_at: "x" })).toBeNull();
    const riga = rigaBloccata("send-email", "email", { to: "a@b.it", template: "t", attachments: [{ filename: "f.pdf", content: "AAAA" }] }, NOW);
    expect(riga).toEqual({ funzione: "send-email", canale: "email", destinatario: "a@b.it", payload: { to: "a@b.it", template: "t", attachments: [{ filename: "f.pdf" }] }, created_at: NOW.toISOString() });
  });

  it("la guardia fetch lascia passare solo l'host Supabase", async () => {
    const chiamate: string[] = [];
    const target = { fetch: async (input: string | URL | Request) => { chiamate.push(String(input)); return new Response("ok"); } };
    const ripristina = installaGuardiaFetch(target, ["ombra.supabase.co"]);
    await expect(target.fetch("https://api.resend.com/emails")).rejects.toThrow(`${ERRORE_FETCH_BLOCCATA}:api.resend.com`);
    await expect(target.fetch("https://graph.facebook.com/v20.0/x/messages")).rejects.toThrow(ERRORE_FETCH_BLOCCATA);
    await expect(target.fetch("https://api.elevenlabs.io/v1/convai")).rejects.toThrow(ERRORE_FETCH_BLOCCATA);
    await expect(target.fetch("non-una-url")).rejects.toThrow(`${ERRORE_FETCH_BLOCCATA}:url-non-valida`);
    await target.fetch("https://ombra.supabase.co/functions/v1/send-whatsapp");
    expect(chiamate).toEqual(["https://ombra.supabase.co/functions/v1/send-whatsapp"]);
    ripristina();
  });
});

describe("modulo Deno (ombra.ts) eseguito con CRM_OMBRA=true e senza chiavi", () => {
  const fetchOriginale = globalThis.fetch;
  const denoPrecedente = (globalThis as Record<string, unknown>).Deno;

  beforeEach(() => {
    vi.resetModules();
    // Ambiente del progetto ombra: solo il secret e l'URL Supabase. Nessuna
    // RESEND_API_KEY, WA_ACCESS_TOKEN, ELEVENLABS_API_KEY.
    const env: Record<string, string> = { CRM_OMBRA: "true", SUPABASE_URL: "https://ombra.supabase.co" };
    (globalThis as Record<string, unknown>).Deno = { env: { get: (key: string) => env[key] } };
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginale;
    (globalThis as Record<string, unknown>).Deno = denoPrecedente;
  });

  it("registra nella tabella, risponde 200 bloccata, e nel frattempo il fetch esterno è murato", async () => {
    const inserite: Array<{ table: string; row: Record<string, unknown> }> = [];
    const supabase = { from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { inserite.push({ table, row }); return { error: null }; } }) };
    const ombra = await import("../../../../supabase/functions/_shared/ombra.ts");
    expect(ombra.OMBRA).toBe(true);

    for (const funzione of FUNZIONI_BLOCCATE) {
      const risposta = await ombra.bloccaSeOmbra(supabase, funzione, "email", { to: "cliente@esempio.it", template: "pratica_inviata" }, { "Access-Control-Allow-Origin": "*" });
      expect(risposta).not.toBeNull();
      expect(risposta!.status).toBe(200);
      expect(await risposta!.json()).toMatchObject({ success: true, ombra: true, blocked: true, funzione });
    }
    expect(inserite).toHaveLength(FUNZIONI_BLOCCATE.length);
    expect(inserite.every((item) => item.table === TABELLA_COMUNICAZIONI_BLOCCATE && item.row.destinatario === "cliente@esempio.it")).toBe(true);

    // Serratura 3: anche chi saltasse il gate non può uscire.
    await expect(globalThis.fetch("https://api.resend.com/emails", { method: "POST" })).rejects.toThrow(ERRORE_FETCH_BLOCCATA);
  });

  it("se la registrazione fallisce risponde errore, mai invio", async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: "tabella assente" } }) }) };
    const ombra = await import("../../../../supabase/functions/_shared/ombra.ts");
    const risposta = await ombra.bloccaSeOmbra(supabase, "send-email", "email", { to: "x@y.it" });
    expect(risposta!.status).toBe(500);
    expect(await risposta!.json()).toMatchObject({ success: false, blocked: true });
  });

  it("fuori dall'ombra il gate è inerte", async () => {
    (globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };
    const ombra = await import("../../../../supabase/functions/_shared/ombra.ts");
    expect(ombra.OMBRA).toBe(false);
    expect(await ombra.bloccaSeOmbra({ from: () => ({ insert: async () => ({ error: null }) }) }, "send-email", "email", {})).toBeNull();
    expect(globalThis.fetch).toBe(fetchOriginale);
  });
});

describe("le cinque funzioni in uscita passano dal gate prima di qualsiasi fetch", () => {
  for (const funzione of FUNZIONI_BLOCCATE) {
    it(funzione, () => {
      const sorgente = readFileSync(path.join(FUNCTIONS_DIR, funzione, "index.ts"), "utf8");
      expect(sorgente).toContain('import { bloccaSeOmbra } from "../_shared/ombra.ts";');
      const handler = sorgente.slice(sorgente.indexOf("serve("));
      const gate = handler.indexOf(`bloccaSeOmbra(supabase, "${funzione}"`);
      const primoFetch = handler.indexOf("fetch(");
      expect(gate, "gate assente nell'handler").toBeGreaterThan(0);
      expect(primoFetch === -1 || gate < primoFetch, "il gate deve precedere il primo fetch").toBe(true);
      expect(handler.slice(gate)).toMatch(/if \(bloccata\) return bloccata;/);
    });
  }
});
