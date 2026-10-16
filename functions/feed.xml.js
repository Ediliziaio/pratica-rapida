// Cloudflare Pages Function — serve /feed.xml (RSS) sullo stesso dominio.
// Stessa ragione di sitemap.xml.js: i rewrite 200 esterni non funzionano.
const UPSTREAM = "https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/seo-rss";


// Queste Function vivono nella cartella `functions/` della radice, e
// Cloudflare le pubblica su OGNI progetto Pages costruito da questo
// repository — quindi anche su eneasubito.it, che con il blog e il sitemap
// dell'altro marchio non c'entra niente. Fino al 16/10/2026
// eneasubito.it/sitemap.xml rispondeva con gli indirizzi di praticarapida.it,
// e eneasubito.it/rss.xml rimandava il visitatore sull'altro sito: il
// collegamento fra i due marchi che non deve esistere, servito dal sito
// stesso. Il controllo anti-fughe non lo vedeva perche' guarda il pacchetto
// compilato, e queste non ci stanno dentro.
function eAltroMarchio(request) {
  try {
    return new URL(request.url).hostname.replace(/^www\./, "") !== "praticarapida.it";
  } catch {
    return false;
  }
}

export async function onRequest({ request }) {
  // EneaSubito non ha un blog: qui questo indirizzo non esiste.
  if (eAltroMarchio(request)) return new Response("Not found", { status: 404 });

  try {
    const res = await fetch(UPSTREAM, { cf: { cacheTtl: 3600, cacheEverything: true } });
    const body = await res.text();
    const looksXml = body.trimStart().startsWith("<?xml") || body.includes("<rss");
    if (!res.ok || !looksXml) throw new Error(`upstream ${res.status}`);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new Response("Feed temporaneamente non disponibile", { status: 503 });
  }
}
