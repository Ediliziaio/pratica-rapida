// ============================================================
// seo-sitemap — Sitemap XML dinamica per www.praticarapida.it
//
// Servita via Cloudflare _redirects rewrite di /sitemap.xml.
// Query news_articles published + combina con sitemap pagine statiche.
// Output Sitemap Protocol 0.9 conforme + estensione Google image sitemap.
//
// Cache: 1h via Cache-Control public + s-maxage Cloudflare edge.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = "https://www.praticarapida.it";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Pagine statiche del sito marketing — manuali (non cambiano spesso)
// Le priorità riflettono il funnel: home > pratica-enea/conto-termico
// (landing prodotto, conversion-critical) > faq/blog (informativo) >
// legal (transparency).
const STATIC_PAGES: Array<{
  path: string;
  priority: number;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  lastmod?: string;
}> = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  { path: "/pratica-enea", priority: 0.9, changefreq: "monthly" },
  { path: "/conto-termico", priority: 0.9, changefreq: "monthly" },
  { path: "/faq", priority: 0.8, changefreq: "monthly" },
  { path: "/blog", priority: 0.8, changefreq: "weekly" },
  { path: "/privacy-policy", priority: 0.3, changefreq: "yearly" },
  { path: "/cookie-policy", priority: 0.3, changefreq: "yearly" },
  { path: "/termini-di-servizio", priority: 0.3, changefreq: "yearly" },
];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtLastmod(date: string | Date): string {
  // ISO 8601 → W3C Datetime format (YYYY-MM-DD)
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

serve(async (_req: Request): Promise<Response> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch articoli published dal DB. Order desc per priorità: gli articoli
    // più recenti hanno changefreq weekly (potrebbero essere aggiornati con
    // commenti / errata corrige), i vecchi monthly.
    const { data: articles, error } = await supabase
      .from("news_articles")
      .select("slug, published_at, updated_at, cover_image_url, title, no_index")
      .eq("status", "published")
      .eq("no_index", false)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[seo-sitemap] DB error:", error);
      // Degrado gentile: ritorna solo le pagine statiche
    }

    const now = new Date();
    const today = fmtLastmod(now);

    const urls: string[] = [];

    // Pagine statiche
    for (const p of STATIC_PAGES) {
      urls.push(`  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${p.lastmod ?? today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`);
    }

    // Articoli blog dal DB
    for (const a of articles ?? []) {
      const slug = a.slug as string;
      const lastmod = fmtLastmod((a.updated_at ?? a.published_at) as string);
      const age = (Date.now() - new Date(a.published_at as string).getTime()) / 86_400_000;
      const changefreq = age < 30 ? "weekly" : "monthly";
      // Priority decrescente con l'età: articoli freschi 0.8, vecchi 0.6
      const priority = age < 30 ? 0.8 : age < 180 ? 0.7 : 0.6;

      const imageBlock = a.cover_image_url
        ? `
    <image:image>
      <image:loc>${xmlEscape(a.cover_image_url as string)}</image:loc>
      <image:title>${xmlEscape(a.title as string)}</image:title>
    </image:image>`
        : "";

      urls.push(`  <url>
    <loc>${SITE}/blog/${xmlEscape(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>${imageBlock}
  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Cache aggressiva edge: 1h freshness + 24h SWR. La sitemap non
        // deve essere real-time: i bot la rivisitano comunque ogni X ore.
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Robots-Tag": "noindex", // la sitemap stessa non va indicizzata
      },
    });
  } catch (err) {
    console.error("[seo-sitemap] fatal:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      },
    );
  }
});
