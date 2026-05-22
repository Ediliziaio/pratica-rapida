// ============================================================
// seo-rss — RSS 2.0 feed per Google Discover, Feedly, RSS reader
//
// Servito via Cloudflare _redirects rewrite di /feed.xml e /rss.xml.
// Query news_articles published, limit 50 più recenti. RSS 2.0 con
// estensioni Atom (link self) + Dublin Core (creator).
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = "https://www.praticarapida.it";
const FEED_URL = `${SITE}/feed.xml`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc2822(date: string | Date): string {
  // RSS 2.0 richiede date format RFC 2822 (es. "Wed, 22 May 2026 13:30:00 +0000")
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

serve(async (_req: Request): Promise<Response> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: articles, error } = await supabase
      .from("news_articles")
      .select("slug, title, excerpt, body_html, published_at, author_name, cover_image_url, category, tags")
      .eq("status", "published")
      .eq("no_index", false)
      .order("published_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[seo-rss] DB error:", error);
    }

    const items = (articles ?? []).map((a) => {
      const link = `${SITE}/blog/${a.slug}`;
      const pubDate = rfc2822(a.published_at as string);
      const author = (a.author_name as string) ?? "Pratica Rapida";
      const category = (a.category as string) ?? "guide";
      const description = a.excerpt ?? "";
      // body_html è già rendered → wrappo in CDATA per evitare doppio escape
      const contentEncoded = a.body_html
        ? `<content:encoded><![CDATA[${a.body_html}]]></content:encoded>`
        : "";
      const enclosure = a.cover_image_url
        ? `<enclosure url="${xmlEscape(a.cover_image_url as string)}" type="image/jpeg" length="0" />`
        : "";

      return `    <item>
      <title>${xmlEscape(a.title as string)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator><![CDATA[${author}]]></dc:creator>
      <category>${xmlEscape(category)}</category>
      <description><![CDATA[${description}]]></description>
      ${contentEncoded}
      ${enclosure}
    </item>`;
    });

    const lastBuildDate = articles && articles.length > 0
      ? rfc2822(articles[0].published_at as string)
      : new Date().toUTCString();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Pratica Rapida — Notizie</title>
    <link>${SITE}/blog</link>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <description>Guide e notizie su pratiche ENEA, Conto Termico, ecobonus e normativa per installatori italiani.</description>
    <language>it-IT</language>
    <copyright>Copyright © Pratica Rapida S.r.l.s.</copyright>
    <managingEditor>modulistica@praticarapida.it (Pratica Rapida)</managingEditor>
    <webMaster>modulistica@praticarapida.it (Pratica Rapida)</webMaster>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>Pratica Rapida CMS</generator>
    <image>
      <url>${SITE}/pratica-rapida-logo.png</url>
      <title>Pratica Rapida</title>
      <link>${SITE}</link>
    </image>
${items.join("\n")}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[seo-rss] fatal:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Pratica Rapida</title><link>${SITE}</link><description>Feed temporarily unavailable</description></channel></rss>`,
      {
        status: 200,
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
      },
    );
  }
});
