/**
 * eneasubito-passi — registra dove si ferma chi apre il modulo.
 *
 * Riceve una visita anonima e il nome di un passo, e scrive una riga. Non
 * accetta nient'altro: nessun nome, nessun indirizzo, nessun testo libero.
 * Quello che non si puo' mandare non si puo' nemmeno sbagliare a mandare.
 *
 * Pubblica: la chiama il browser di chi visita il sito.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** I soli passi che esistono. Qualunque altra cosa si scarta. */
const PASSI = new Set([
  "aperto",
  "lavoro",
  "nome",
  "email",
  "continua",
  "passo2",
  "fattura",
  "pagamento",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let visita = "";
  let passo = "";
  try {
    const corpo = await req.json();
    visita = String(corpo?.visita ?? "").trim();
    passo = String(corpo?.passo ?? "").trim();
  } catch {
    return json({ ok: true });
  }

  // Si risponde sempre «va bene»: e' una misura, e una misura che fa comparire
  // un errore sulla pagina di chi sta comprando ha fatto piu' danno di quanto
  // valga. Se il dato non e' buono, semplicemente non si scrive.
  if (!PASSI.has(passo)) return json({ ok: true });
  if (visita.length < 8 || visita.length > 64) return json({ ok: true });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  // Stesso passo, stessa visita: si scrive una volta sola. Il vincolo di
  // unicita' fa il lavoro, qui si ignora il doppione in silenzio.
  await db.from("eneasubito_passi").insert({ visita, passo });

  return json({ ok: true });
});
