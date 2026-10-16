// /rss.xml → 301 verso il feed canonico /feed.xml (evita contenuto duplicato).

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
  // Mai rinviare un visitatore di EneaSubito sull'altro marchio.
  if (eAltroMarchio(request)) return new Response("Not found", { status: 404 });

  return Response.redirect("https://www.praticarapida.it/feed.xml", 301);
}
