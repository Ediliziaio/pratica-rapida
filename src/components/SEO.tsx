import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  keywords?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noindex?: boolean;
  jsonLd?: object | object[];
}

const DEFAULT_IMAGE = "https://www.praticarapida.it/og-image.png";

export function SEO({
  title,
  description,
  canonical,
  keywords,
  ogImage = DEFAULT_IMAGE,
  ogType = "website",
  noindex = false,
  jsonLd,
}: SEOProps) {
  const fullTitle = title.includes("Pratica Rapida") ? title : `${title} | Pratica Rapida`;
  const fullCanonical = `https://www.praticarapida.it${canonical}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
      <link rel="canonical" href={fullCanonical} />

      {/* GEO */}
      <meta name="geo.region" content="IT" />
      <meta name="geo.placename" content="Lissone, Monza e Brianza, Italia" />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Pratica Rapida" />
      <meta property="og:locale" content="it_IT" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd])}
        </script>
      )}
    </Helmet>
  );
}
