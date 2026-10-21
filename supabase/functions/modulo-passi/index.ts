/**
 * modulo-passi — registra dove si ferma il cliente privato.
 *
 * Riceve una visita anonima e il nome di un passo, e scrive una riga. Non
 * accetta nient'altro: nessun nome, nessun indirizzo, nessun testo libero.
 * Con GET restituisce i conteggi, che legge la pagina /imbuto del sito.
 *
 * Pubblica: la chiama il browser di chi visita il sito.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** I soli passi che esistono, nell'ordine dell'imbuto. Il resto si scarta. */
const ORDINE = [
  "aperto",
  "privato",
  "prodotto",
  "nome",
  "telefono",
  "email",
  "invia",
  "registrata",
  "modulo",
  "compila",
  "ultima",
  "invio",
  "pagamento",
  "pagato",
];
const PASSI = new Set(ORDINE);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Leggere l'imbuto ────────────────────────────────────────────────────
  // Solo conteggi: quante visite hanno raggiunto ogni passo. Sono numeri
  // senza persone, quindi non c'e' niente da proteggere.
  if (req.method === "GET") {
    const giorni = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("giorni") ?? "7")));
    const da = new Date(Date.now() - giorni * 86_400_000).toISOString();
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await db
      .from("praticarapida_passi")
      .select("passo")
      .gte("quando", da)
      .limit(100_000);
    if (error) return json({ error: "lettura fallita" }, 500);

    const conta = new Map<string, number>();
    for (const r of data ?? []) {
      conta.set(String(r.passo), (conta.get(String(r.passo)) ?? 0) + 1);
    }
    // La quota si calcola su chi ha scelto «privato»: la pagina la aprono
    // anche i rivenditori, e l'annuncio parla ai privati.
    const privati = conta.get("privato") ?? 0;
    return json({
      giorni,
      imbuto: ORDINE.map((passo) => {
        const quante = conta.get(passo) ?? 0;
        return {
          passo,
          visite: quante,
          suCentoPrivati: passo === "aperto" || !privati ? null : Math.round((quante / privati) * 100),
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

  // Si risponde sempre «va bene»: una misura non deve mai far comparire un
  // errore sulla pagina di chi sta comprando. Se il dato non e' buono, non
  // si scrive e basta.
  if (!PASSI.has(passo)) return json({ ok: true });
  if (visita.length < 8 || visita.length > 64) return json({ ok: true });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  // Stesso passo, stessa visita: il vincolo di unicita' scarta il doppione.
  await db.from("praticarapida_passi").insert({ visita, passo });

  return json({ ok: true });
});
