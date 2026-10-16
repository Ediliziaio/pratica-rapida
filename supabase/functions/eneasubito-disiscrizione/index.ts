/**
 * eneasubito-disiscrizione — toglie un indirizzo dai messaggi di ripresa.
 *
 * Obbligo di legge, e conviene: chi si toglie da solo e' chi altrimenti
 * avrebbe premuto «segnala spam», e quella segnalazione penalizza il dominio
 * eneasubito.it — cioe' fa arrivare meno anche le conferme di pagamento e le
 * pratiche finite.
 *
 * Si identifica con il codice della pratica, che e' gia' nel link del
 * messaggio: nessuna password, nessun accesso, un clic solo. Un meccanismo
 * che chiede di autenticarsi per smettere di ricevere mail non lo usa
 * nessuno, e il risultato e' la segnalazione di spam.
 *
 * Pubblica: va distribuita con --no-verify-jwt (vedi supabase/config.toml).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  let token = "";
  try {
    token = String((await req.json())?.token ?? "").trim();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }
  if (!token) return json({ error: "Codice mancante" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Solo pratiche di questo canale: un codice dell'altro marchio non deve
  // poter finire in questo elenco.
  const { data: pratica } = await db
    .from("enea_practices")
    .select("id, canale, cliente_email")
    .eq("form_token", token)
    .maybeSingle();

  if (!pratica || pratica.canale !== "eneasubito" || !pratica.cliente_email) {
    // Si risponde comunque «fatto»: chi ha in mano un codice vecchio o
    // sbagliato deve leggere che non ricevera' piu' niente, non un errore
    // che lo spinge a segnalarci come spam.
    return json({ ok: true });
  }

  const email = String(pratica.cliente_email).trim().toLowerCase();
  const { error } = await db
    .from("eneasubito_disiscritti")
    .upsert({ email, pratica_id: pratica.id }, { onConflict: "email" });

  if (error) {
    console.error("[eneasubito-disiscrizione]", error);
    return json({ error: "Non siamo riusciti a registrarlo" }, 500);
  }
  return json({ ok: true });
});
