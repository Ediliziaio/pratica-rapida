/**
 * News articles — types e query helpers per il CMS news/blog SEO.
 *
 * Tabella backing: public.news_articles
 * Fonte unica per: admin editor, /blog list, /blog/:slug, homepage preview, hero widget.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;

  body_md: string | null;
  body_html: string | null;
  cover_image_url: string | null;

  category: string;
  tags: string[];

  author_name: string;
  author_avatar_url: string | null;

  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  twitter_card: string;
  json_ld_type: string;
  no_index: boolean;
  no_follow: boolean;

  status: "draft" | "published" | "archived";
  published_at: string | null;
  pinned: boolean;

  read_time_minutes: number;
  view_count: number;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const NEWS_CATEGORIES = [
  { id: "tutti", label: "Tutti" },
  { id: "guide", label: "Guide Pratiche" },
  { id: "enea", label: "ENEA" },
  { id: "conto-termico", label: "Conto Termico" },
  { id: "normativa", label: "Normativa" },
  { id: "novita", label: "Novità" },
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  enea:            "hsl(152 100% 45%)",
  "conto-termico": "hsl(200 100% 55%)",
  normativa:       "hsl(45 100% 55%)",
  guide:           "hsl(280 80% 65%)",
  novita:          "hsl(25 100% 55%)",
};

export function categoryLabel(id: string): string {
  return NEWS_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function categoryColor(id: string): string {
  return CATEGORY_COLORS[id] ?? "hsl(152 100% 45%)";
}

/**
 * Hook public: solo articoli published, ordinati per pinned + published_at desc.
 */
export function usePublishedNews() {
  return useQuery<NewsArticle[]>({
    queryKey: ["news_articles", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .eq("status", "published")
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsArticle[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook public: singolo articolo by slug (solo se published).
 */
export function useNewsArticle(slug: string | undefined) {
  return useQuery<NewsArticle | null>({
    queryKey: ["news_articles", "slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return (data as NewsArticle | null) ?? null;
    },
  });
}

/**
 * Hook admin: tutti gli articoli (qualsiasi status). RLS lascia passare solo super_admin.
 */
export function useAdminNews() {
  return useQuery<NewsArticle[]>({
    queryKey: ["news_articles", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsArticle[];
    },
  });
}

/**
 * Best-effort view counter — fire-and-forget.
 */
export async function incrementNewsView(slug: string): Promise<void> {
  try {
    await supabase.rpc("increment_news_view", { p_slug: slug });
  } catch {
    // intentionally swallow — analytics is non-critical
  }
}

/**
 * Slugify Italian title — used in editor for auto-fill.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Estimate reading time in minutes from a markdown body.
 * Italian average reading speed ≈ 200 words/min.
 * Strips markdown syntax before counting words.
 */
export function estimateReadingTime(md: string): number {
  if (!md) return 1;
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = stripped ? stripped.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Make an image URL absolute using the production origin.
 * Required for OG / JSON-LD image fields — Google requires absolute URLs.
 */
export function absoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const base = "https://www.praticarapida.it";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Check whether a slug is already taken by a *different* article.
 * Returns the colliding article id or null.
 */
export async function findSlugCollision(
  slug: string,
  excludeId?: string,
): Promise<string | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from("news_articles")
    .select("id")
    .eq("slug", trimmed)
    .maybeSingle();
  if (error || !data) return null;
  if (excludeId && data.id === excludeId) return null;
  return data.id;
}
