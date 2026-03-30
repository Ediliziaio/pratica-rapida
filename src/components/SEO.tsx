import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  jsonLd?: object | object[];
}

const DEFAULT_IMAGE = "https://www.praticarapida.it/og-image.jpg";

export function SEO({ title, description, canonical, ogImage = DEFAULT_IMAGE, jsonLd }: SEOProps) {
  const fullTitle = title.includes("Pratica Rapida") ? title : `${title} | Pratica Rapida`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`https://www.praticarapida.it${canonical}`} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={`https://www.praticarapida.it${canonical}`} />
      <meta property="og:image" content={ogImage} />

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
