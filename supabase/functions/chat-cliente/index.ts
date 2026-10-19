/**
 * chat-cliente — la chat del sito, dal lato di chi scrive.
 *
 * Il browser di chi visita non tocca mai le tabelle: passa sempre di qui.
 * Senza questo, per far leggere a una persona la sua conversazione bisognerebbe
 * aprire la tabella agli anonimi, e chi indovinasse un indirizzo leggerebbe
 * le conversazioni di tutti gli altri.
 *
 * Il cliente tiene da parte una chiave — un numero a caso, non un accesso —
 * e con quella puo' fare due cose: aggiungere un messaggio alla SUA
 * conversazione e rileggerla. Nient'altro.
 *
 * Pubblica: va distribuita con --no-verify-jwt (vedi supabase/config.toml).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_ENEASUBITO") ??
  Deno.env.get("RESEND_API_KEY") ?? "";

/** Dove avvisare, marchio per marchio. */
const CASELLA: Record<string, string> = {
  eneasubito: "assistenza@eneasubito.it",
  praticarapida: "modulistica@praticarapida.it",
};
const MITTENTE: Record<string, string> = {
  eneasubito: "EneaSubito <assistenza@eneasubito.it>",
  praticarapida: "Pratica Rapida <modulistica@praticarapida.it>",
};

const MARCHI = new Set(["eneasubito", "praticarapida"]);
const TESTO_MASSIMO = 4000;
/** Oltre questo una conversazione non e' piu' una conversazione. */
const MESSAGGI_MASSIMI = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const pulisci = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Avvisa l'operatore che qualcuno ha aperto una conversazione.
 *
 * Solo al primo messaggio: se avvisasse a ogni riga, chi scrive tre frasi di
 * fila riempirebbe la casella e l'avviso smetterebbe di voler dire qualcosa.
 */
async function avvisa(marchio: string, testo: string, pagina: string) {
  const casella = CASELLA[marchio];
  if (!RESEND_API_KEY || !casella) return;
  const inizio = testo.length > 60 ? `${testo.slice(0, 60)}…` : testo;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MITTENTE[marchio],
        to: [casella],
        subject: `Chat: ${inizio}`,
        text: [
          "Qualcuno ha scritto nella chat del sito.",
          "",
          testo,
          "",
          pagina ? `Pagina: ${pagina}` : "",
          "",
          "Rispondi dal CRM, anche dal telefono: /eneasubito/messaggi",
          "La risposta compare nella chat, dove la persona l'aspetta.",
        ].filter(Boolean).join("\n"),
      }),
    });
  } catch (e) {
    console.error("[chat-cliente] avviso non partito:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }

  // Trappola anti-spam: si risponde come se fosse andata bene, senza scrivere.
  if (pulisci(corpo.website, 10)) return json({ ok: true });

  const azione = pulisci(corpo.azione, 20);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Aprire una conversazione ────────────────────────────────────────────
  if (azione === "apri") {
    const marchio = pulisci(corpo.marchio, 20);
    if (!MARCHI.has(marchio)) return json({ error: "Marchio sconosciuto" }, 400);
    const pagina = pulisci(corpo.pagina, 120).split("?")[0];
    const { data, error } = await db
      .from("chat_conversazioni")
      .insert({ marchio, pagina: pagina || null })
      .select("chiave")
      .single();
    if (error) {
      console.error("[chat-cliente] apertura fallita", error);
      return json({ error: "Non riusciamo ad aprire la chat" }, 500);
    }
    return json({ ok: true, chiave: data.chiave });
  }

  // Da qui in poi serve la chiave, e vale solo per la sua conversazione.
  const chiave = pulisci(corpo.chiave, 64);
  if (!chiave) return json({ error: "Conversazione non indicata" }, 400);

  const { data: conversazione } = await db
    .from("chat_conversazioni")
    .select("id, marchio, chiusa_at")
    .eq("chiave", chiave)
    .maybeSingle();
  if (!conversazione) return json({ error: "Conversazione non trovata" }, 404);

  // ── Scrivere ────────────────────────────────────────────────────────────
  if (azione === "scrivi") {
    const testo = pulisci(corpo.testo, TESTO_MASSIMO);
    if (testo.length < 1) return json({ error: "Scrivi qualcosa" }, 400);

    const { count } = await db
      .from("chat_messaggi")
      .select("id", { count: "exact", head: true })
      .eq("conversazione_id", conversazione.id);
    if ((count ?? 0) >= MESSAGGI_MASSIMI) {
      return json({ error: "Questa conversazione e' troppo lunga: scrivici per mail." }, 429);
    }

    const { error } = await db
      .from("chat_messaggi")
      .insert({ conversazione_id: conversazione.id, da: "cliente", testo });
    if (error) {
      console.error("[chat-cliente] scrittura fallita", error);
      return json({ error: "Non siamo riusciti a registrare il messaggio" }, 500);
    }

    // Un indirizzo, se l'ha lasciato: serve a riprenderlo se se ne va prima
    // della risposta. Non si sovrascrive quello gia' dato.
    const email = pulisci(corpo.email, 160).toLowerCase();
    if (email.includes("@")) {
      await db
        .from("chat_conversazioni")
        .update({ email })
        .eq("id", conversazione.id)
        .is("email", null);
    }

    // Era il primo? Allora l'operatore non sa ancora che esiste.
    if ((count ?? 0) === 0) {
      const pagina = pulisci(corpo.pagina, 120).split("?")[0];
      await avvisa(conversazione.marchio, testo, pagina);
    }
    return json({ ok: true });
  }

  // ── Rileggere ───────────────────────────────────────────────────────────
  if (azione === "leggi") {
    const { data, error } = await db
      .from("chat_messaggi")
      .select("id, da, testo, created_at")
      .eq("conversazione_id", conversazione.id)
      .order("created_at")
      .limit(MESSAGGI_MASSIMI);
    if (error) return json({ error: "lettura fallita" }, 500);
    return json({ ok: true, messaggi: data ?? [], chiusa: !!conversazione.chiusa_at });
  }

  return json({ error: "Azione sconosciuta" }, 400);
});
