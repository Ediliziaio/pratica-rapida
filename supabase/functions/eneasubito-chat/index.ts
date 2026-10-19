/**
 * eneasubito-chat — riceve le domande che la chat non sa rispondere da sola.
 *
 * Le venticinque domande previste hanno la risposta scritta nel sito e non
 * passano di qui: arriva solo quello che il copione non copriva. Ogni riga
 * che finisce in tabella e' quindi una domanda nuova, cioe' la prossima voce
 * dell'elenco.
 *
 * E' una funzione a se' e non un ramo di quelle esistenti: quelle servono
 * l'altro marchio in produzione tutti i giorni e non si toccano per
 * aggiungere un canale.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Oltre questa lunghezza si taglia: nessuna domanda onesta e' piu' lunga. */
const TESTO_MASSIMO = 4000;

interface Corpo {
  /** Trappola per i programmi automatici: un umano non la compila mai. */
  website?: string;
  testo?: string;
  email?: string;
  pagina?: string;
}

/** Via i caratteri di controllo e gli spazi doppi, poi si taglia. */
function pulisci(valore: unknown, massimo: number): string {
  if (typeof valore !== "string") return "";
  return valore
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, massimo);
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_ENEASUBITO") ??
  Deno.env.get("RESEND_API_KEY") ?? "";
const CASELLA = "assistenza@eneasubito.it";

/**
 * Porta la domanda nella casella dell'assistenza.
 *
 * Il mittente e' il nostro indirizzo (e' l'unico da cui siamo autorizzati a
 * spedire), ma il «rispondi a» e' quello del cliente: cosi' si risponde
 * premendo Rispondi, senza copiare indirizzi a mano. Chi deve rispondere in
 * fretta non deve fare passaggi.
 */
async function avvisa(testo: string, email: string, pagina: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("[eneasubito-chat] nessuna chiave: la domanda resta solo nella tabella");
    return;
  }
  const inizio = testo.length > 60 ? `${testo.slice(0, 60)}…` : testo;
  try {
    const risposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `EneaSubito <${CASELLA}>`,
        to: [CASELLA],
        reply_to: email,
        subject: `Domanda dal sito: ${inizio}`,
        text: [
          testo,
          "",
          `Da: ${email}`,
          pagina ? `Pagina: ${pagina}` : "",
          "",
          "Rispondi a questo messaggio: la risposta va direttamente a chi ha scritto.",
        ].filter(Boolean).join("\n"),
      }),
    });
    if (!risposta.ok) {
      console.error("[eneasubito-chat] avviso non partito:", risposta.status, await risposta.text());
    }
  } catch (e) {
    console.error("[eneasubito-chat] avviso non partito:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }

  // Trappola anti-spam: si risponde come se fosse andata bene, senza scrivere.
  if (corpo.website) return json({ ok: true });

  const testo = pulisci(corpo.testo, TESTO_MASSIMO);
  const email = pulisci(corpo.email, 160).toLowerCase();
  // Solo il percorso: un indirizzo intero si porterebbe dietro i parametri
  // della pubblicita' e la ricerca che la persona ha digitato su Google.
  const pagina = pulisci(corpo.pagina, 120).split("?")[0];

  if (testo.length < 5) return json({ error: "Scrivi qualcosa in piu'" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Serve un indirizzo e-mail valido" }, 400);

  try {
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await db
      .from("eneasubito_chat_messaggi")
      .insert({ testo, email, pagina: pagina || null });
    if (error) throw error;

    // La riga nella tabella non e' una risposta. La chat promette «ti
    // rispondiamo per mail entro poche ore»: se il messaggio resta in un
    // elenco che nessuno apre, quella promessa la stiamo facendo a nome di
    // nessuno, ed e' peggio di non avere la chat — la persona ci ha provato
    // e se n'e' andata convinta che non rispondiamo.
    //
    // Si avvisa dopo aver scritto la riga: se la mail non parte il messaggio
    // resta comunque agli atti, mentre il contrario perderebbe la domanda.
    await avvisa(testo, email, pagina);

    return json({ ok: true });
  } catch (e) {
    console.error("[eneasubito-chat]", e);
    return json({ error: "Non siamo riusciti a registrare il messaggio" }, 500);
  }
});
