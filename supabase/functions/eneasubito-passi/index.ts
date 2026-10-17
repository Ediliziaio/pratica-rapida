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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** L'ordine dell'imbuto: serve a leggerlo dall'alto verso il basso. */
const ORDINE = [
  "aperto",
  "lavoro",
  "nome",
  "email",
  "continua",
  "passo2",
  "fattura",
  "pagamento",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Leggere l'imbuto ────────────────────────────────────────────────────
  // Solo conteggi: quante visite hanno raggiunto ogni passo. Non si puo'
  // chiedere chi, perche' non lo sappiamo e non vogliamo saperlo. Aperto a
  // tutti perche' non c'e' niente da proteggere: sono numeri senza persone.
  if (req.method === "GET") {
    const giorni = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("giorni") ?? "7")));
    const da = new Date(Date.now() - giorni * 86_400_000).toISOString();
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await db
      .from("eneasubito_passi")
      .select("passo")
      .gte("quando", da)
      .limit(100_000);
    if (error) return json({ error: "lettura fallita" }, 500);

    const conta = new Map<string, number>();
    for (const r of data ?? []) {
      conta.set(String(r.passo), (conta.get(String(r.passo)) ?? 0) + 1);
    }
    const aperto = conta.get("aperto") ?? 0;
    return json({
      giorni,
      imbuto: ORDINE.map((passo) => {
        const quante = conta.get(passo) ?? 0;
        return {
          passo,
          visite: quante,
          // Su cento che aprono il modulo, quante arrivano fin qui.
          suCentoCheAprono: aperto ? Math.round((quante / aperto) * 100) : null,
        };
      }),
    });
  }

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
