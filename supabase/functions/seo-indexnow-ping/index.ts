// ============================================================
// seo-indexnow-ping — Notifica IndexNow API quando un articolo viene
// pubblicato/aggiornato. Indicizzazione istantanea su Bing, Yandex,
// Seznam, Naver, Yep, DuckDuckGo (via Bing). Google NON supporta
// IndexNow ufficialmente — per Google usare Search Console.
//
// Specs: https://www.indexnow.org/documentation
// Endpoint: POST https://api.indexnow.org/IndexNow
//
// Auth: file con la nostra key servito su /{INDEXNOW_KEY}.txt — il
// motore verifica ownership prima di accettare submit. Configurato
// via _redirects + edge function indexnow-key.
//
// Trigger: chiamato dall'admin quando publish un articolo (mutation
// onSuccess in NewsEditor). Può anche essere chiamato in batch per
// pingare TUTTE le URL del sito.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SITE_HOST = "www.praticarapida.it";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

// Key segreta IndexNow — DEVE corrispondere al file servito su
// /{INDEXNOW_KEY}.txt. Genera una volta con uuidgen + setta come secret
// Supabase: WA_INDEXNOW_KEY (riusa naming convention secrets).
// Fallback per dev: stringa fissa (NON usare in prod).
const INDEXNOW_KEY = Deno.env.get("INDEXNOW_KEY") ?? "praticarapida-indexnow-default-key-change-in-prod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let payload: { urls?: string[]; slug?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Costruzione URL list. Accetta:
  // - urls: ["https://www.praticarapida.it/blog/foo", ...]
  // - slug: "foo" → costruisce https://www.praticarapida.it/blog/foo
  let urls: string[] = [];
  if (Array.isArray(payload.urls) && payload.urls.length > 0) {
    urls = payload.urls.filter((u) =>
      typeof u === "string" && u.startsWith(`https://${SITE_HOST}/`),
    );
  } else if (typeof payload.slug === "string" && payload.slug.length > 0) {
    urls = [`https://${SITE_HOST}/blog/${payload.slug}`];
  }

  if (urls.length === 0) {
    return new Response(JSON.stringify({ error: "No valid URLs to submit" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // IndexNow protocol: POST JSON con host, key, keyLocation, urlList.
  // keyLocation è opzionale ma raccomandato — punta al file di ownership
  // (es. https://www.praticarapida.it/{KEY}.txt).
  const body = {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });

    // IndexNow API risponde:
    //  200 OK: URL submitted successfully
    //  202 Accepted: URL received. IndexNow key validation pending
    //  400 Bad request: Invalid format
    //  403 Forbidden: In case of key not valid (e.g. key not found,
    //                 file found but key not in the file)
    //  422 Unprocessable Entity: URLs which don't belong to the host
    //                            or in case of other errors
    //  429 Too Many Requests: Too many requests (potential Spam)
    return new Response(
      JSON.stringify({
        success: res.ok,
        status: res.status,
        urls_submitted: urls.length,
        meta_response: res.ok ? "OK" : await res.text().catch(() => null),
      }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[seo-indexnow-ping] fetch failed:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        urls_attempted: urls.length,
      }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }
});
