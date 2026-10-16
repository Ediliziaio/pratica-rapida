// Cloudflare Pages Function — serve /sitemap.xml sullo STESSO dominio
// (www.praticarapida.it) con Content-Type corretto.
//
// PERCHÉ ESISTE: i rewrite 200 di `_redirects` verso URL ESTERNI
// (supabase.co) NON sono supportati da Cloudflare Pages → /sitemap.xml
// cadeva nel catch-all `/* → /index.html` e Google riceveva l'HTML della
// SPA invece del sitemap. Questa Function proxya la Edge Function Supabase
// e restituisce XML valido con l'header giusto.
const UPSTREAM = "https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/seo-sitemap";


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

export async function onRequest({ request, next }) {
  // Su EneaSubito esiste gia' il suo sitemap statico: si lascia servire quello.
  if (eAltroMarchio(request)) return next();

  try {
    const res = await fetch(UPSTREAM, { cf: { cacheTtl: 3600, cacheEverything: true } });
    const body = await res.text();
    // Difensivo: se l'upstream non desse XML, non propagare HTML/errori.
    const looksXml = body.trimStart().startsWith("<?xml") || body.includes("<urlset");
    if (!res.ok || !looksXml) throw new Error(`upstream ${res.status}`);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    // Fallback minimo valido: almeno la home resta nel sitemap.
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url><loc>https://www.praticarapida.it/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n" +
      "</urlset>";
    return new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }
}
