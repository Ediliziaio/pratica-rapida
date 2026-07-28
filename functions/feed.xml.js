// Cloudflare Pages Function — serve /feed.xml (RSS) sullo stesso dominio.
// Stessa ragione di sitemap.xml.js: i rewrite 200 esterni non funzionano.
const UPSTREAM = "https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/seo-rss";

export async function onRequest() {
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
