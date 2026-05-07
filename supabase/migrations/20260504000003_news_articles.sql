-- ============================================================
-- News Articles — CMS unificato SEO-oriented
--
-- Sostituisce:
-- - platform_settings.homepage_news (mini-CMS senza SEO)
-- - src/data/blog-posts.ts (file statico TS, non editabile da admin)
--
-- Schema completo per articoli news con tutti i parametri SEO
-- (meta title/description, og image, canonical, JSON-LD), editor
-- markdown/HTML, gestione status, tags, categoria.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificazione
  slug TEXT NOT NULL UNIQUE,                  -- es. "guida-detrazione-50-2026"
  title TEXT NOT NULL,                         -- titolo umano
  excerpt TEXT,                                 -- riassunto breve (150-200 char)

  -- Contenuto
  body_md TEXT,                                 -- markdown editor (source of truth)
  body_html TEXT,                               -- rendered cached (per perf)
  cover_image_url TEXT,                         -- immagine principale articolo

  -- Categorizzazione
  category TEXT DEFAULT 'guide',                -- guide, news, tutorial, normativa
  tags TEXT[] DEFAULT ARRAY[]::text[],

  -- Autore
  author_name TEXT DEFAULT 'Pratica Rapida',
  author_avatar_url TEXT,

  -- SEO
  meta_title TEXT,                              -- override <title> se diverso da title
  meta_description TEXT,                        -- meta description (160 char)
  meta_keywords TEXT[],                         -- keywords array
  canonical_url TEXT,                           -- URL canonico (override)
  og_title TEXT,                                -- Open Graph title (override)
  og_description TEXT,                          -- OG description (override)
  og_image_url TEXT,                            -- OG image dedicata (1200×630)
  twitter_card TEXT DEFAULT 'summary_large_image',
  json_ld_type TEXT DEFAULT 'NewsArticle',      -- NewsArticle | BlogPosting | Article
  no_index BOOLEAN DEFAULT false,               -- excludere dai motori
  no_follow BOOLEAN DEFAULT false,

  -- Stato
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  pinned BOOLEAN DEFAULT false,                 -- in evidenza in homepage

  -- Stats
  read_time_minutes INTEGER DEFAULT 5,
  view_count INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_slug ON public.news_articles(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_status ON public.news_articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON public.news_articles(category, status);
CREATE INDEX IF NOT EXISTS idx_news_articles_pinned ON public.news_articles(pinned, published_at DESC) WHERE status = 'published';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_news_articles_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS news_articles_updated_at ON public.news_articles;
CREATE TRIGGER news_articles_updated_at
  BEFORE UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_news_articles_updated_at();

-- RLS
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- Tutti leggono articoli "published" (anche anonimi per il sito pubblico)
CREATE POLICY "Public read published news"
  ON public.news_articles FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Super_admin CRUD completo
CREATE POLICY "Super admin manage news"
  ON public.news_articles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- View counter (anche anon può fare INSERT su una funzione SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.increment_news_view(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.news_articles
  SET view_count = view_count + 1
  WHERE slug = p_slug AND status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.increment_news_view(text) TO anon, authenticated;

COMMENT ON TABLE public.news_articles IS
  'CMS news/blog SEO-completo. Sostituisce platform_settings.homepage_news + src/data/blog-posts.ts.';

-- ============================================================
-- Storage bucket per immagini news (cover, og, inline)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-images',
  'news-images',
  true,                                         -- pubblico (sito legge senza auth)
  5242880,                                      -- 5 MB per immagine
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: anon legge, super_admin scrive
CREATE POLICY "Public read news-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'news-images');

CREATE POLICY "Super admin upload news-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admin update news-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admin delete news-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'news-images'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );
