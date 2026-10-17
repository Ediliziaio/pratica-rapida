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

/** Come si chiama ogni passo in italiano, per chi guarda. */
const NOMI: Record<string, string> = {
  aperto: "Ha aperto il modulo",
  lavoro: "Ha scelto il lavoro",
  nome: "Ha scritto il nome",
  email: "Ha scritto l'e-mail",
  continua: "Ha premuto Continua",
  passo2: "È arrivato al secondo passo",
  fattura: "Ha caricato la fattura",
  pagamento: "È andato al pagamento",
};

/**
 * La pagina da lasciare aperta sul monitor.
 *
 * Una barra per passo, lunga quanto la quota di chi ci arriva: il punto dove
 * la barra crolla e' il punto dove si perde la gente, e si vede in un colpo
 * d'occhio senza leggere un numero. Si aggiorna da sola ogni due minuti.
 */
function paginaLeggibile(conta: Map<string, number>, aperto: number, giorni: number): string {
  const righe = ORDINE.map((passo) => {
    const quante = conta.get(passo) ?? 0;
    const quota = aperto ? Math.round((quante / aperto) * 100) : 0;
    return `<tr>
      <td class="nome">${NOMI[passo] ?? passo}</td>
      <td class="barra"><i style="width:${quota}%"></i></td>
      <td class="num">${quante}</td>
      <td class="quota">${aperto ? quota + "%" : "—"}</td>
    </tr>`;
  }).join("");

  const persi = aperto - (conta.get("pagamento") ?? 0);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EneaSubito — dove si fermano</title>
<meta http-equiv="refresh" content="120">
<style>
  :root { color-scheme: light dark; --inchiostro:#14201a; --carta:#F7F4EE; --bordo:#E3DED3; --verde:#2F6B45; }
  @media (prefers-color-scheme: dark) { :root { --inchiostro:#EDEAE3; --carta:#14201a; --bordo:#2C3A32; } }
  body { margin:0; padding:40px 20px; background:var(--carta); color:var(--inchiostro);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 23px; margin: 0 0 4px; }
  p.sotto { margin: 0 0 28px; opacity: .65; font-size: 14px; }
  table { width:100%; border-collapse: collapse; }
  td { padding: 11px 8px; border-bottom: 1px solid var(--bordo); vertical-align: middle; }
  td.nome { white-space: nowrap; font-size: 15px; }
  td.barra { width: 100%; }
  td.barra i { display:block; height: 12px; border-radius: 999px; background: var(--verde); min-width: 2px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.quota { text-align: right; width: 56px; opacity: .6; font-variant-numeric: tabular-nums; }
  footer { margin-top: 26px; font-size: 13px; opacity: .6; line-height: 1.6; }
</style></head><body><main>
<h1>Dove si fermano</h1>
<p class="sotto">Ultimi ${giorni} giorni · si aggiorna da sola ogni due minuti</p>
<table>${righe}</table>
<footer>Il punto dove la barra crolla è il punto dove perdiamo la gente.<br>
${aperto ? `Su ${aperto} che hanno aperto il modulo, ${persi} se ne sono andati senza pagare.` : "Nessuno ha ancora aperto il modulo in questo periodo."}</footer>
</main></body></html>`;
}

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

    // Chi la apre con il browser vuole guardarla, non leggerla: questa pagina
    // sta su un monitor tutto il giorno. Chi la chiama da un programma vuole i
    // numeri. Si guarda cosa ha chiesto e si risponde di conseguenza.
    if ((req.headers.get("Accept") ?? "").includes("text/html")) {
      return new Response(paginaLeggibile(conta, aperto, giorni), {
        headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

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
