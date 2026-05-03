import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Calendar, AlertTriangle, Lightbulb, Info } from "lucide-react";
import { Navbar, Footer, WhatsAppButton } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { blogPosts, BLOG_CATEGORIES, type ContentBlock } from "@/data/blog-posts";
import { BLOG_COVER_MAP } from "@/components/blog/BlogCovers";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function Callout({ variant, text }: { variant: "info" | "warning" | "tip"; text: string }) {
  const styles = {
    info: {
      bg: "hsla(200,100%,45%,0.08)",
      border: "hsla(200,100%,45%,0.25)",
      color: "hsl(200 100% 65%)",
      icon: <Info size={15} />,
      label: "Nota",
    },
    warning: {
      bg: "hsla(25,100%,45%,0.08)",
      border: "hsla(25,100%,45%,0.25)",
      color: "hsl(25 100% 65%)",
      icon: <AlertTriangle size={15} />,
      label: "Attenzione",
    },
    tip: {
      bg: "hsla(152,100%,35%,0.08)",
      border: "hsla(152,100%,35%,0.25)",
      color: "hsl(152 100% 65%)",
      icon: <Lightbulb size={15} />,
      label: "Consiglio",
    },
  };
  const s = styles[variant];
  return (
    <div
      className="flex gap-3 rounded-xl p-4 my-6 text-sm leading-relaxed"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: s.color }}>{s.icon}</span>
      <div>
        <span className="font-bold mr-1.5" style={{ color: s.color }}>{s.label}:</span>
        <span className="text-foreground/80">{text}</span>
      </div>
    </div>
  );
}

function renderBlock(block: ContentBlock, i: number) {
  switch (block.type) {
    case "h2":
      return <h2 key={i} className="font-bold text-xl sm:text-2xl text-foreground mt-10 mb-4 leading-snug">{block.text}</h2>;
    case "h3":
      return <h3 key={i} className="font-semibold text-lg text-foreground mt-8 mb-3 leading-snug">{block.text}</h3>;
    case "p":
      return <p key={i} className="text-[15px] leading-[1.8] text-foreground/75 mb-4">{block.text}</p>;
    case "ul":
      return (
        <ul key={i} className="mb-5 space-y-2">
          {block.items.map((item, j) => (
            <li key={j} className="flex gap-2.5 text-[15px] text-foreground/75 leading-relaxed">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full mt-2.5" style={{ background: "hsl(var(--pr-green))" }} />
              {item}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={i} className="mb-5 space-y-2">
          {block.items.map((item, j) => (
            <li key={j} className="flex gap-3 text-[15px] text-foreground/75 leading-relaxed">
              <span
                className="shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                style={{ background: "hsla(152,100%,45%,0.15)", color: "hsl(152 100% 55%)" }}
              >
                {j + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      );
    case "callout":
      return <Callout key={i} variant={block.variant} text={block.text} />;
    case "table":
      return (
        <div key={i} className="overflow-x-auto -mx-4 sm:mx-0 my-6">
          <div className="min-w-[480px] mx-4 sm:mx-0">
            <table className="w-full text-sm border-collapse rounded-xl overflow-hidden">
              <thead>
                <tr style={{ background: "hsl(var(--card))" }}>
                  {block.headers.map((h, j) => (
                    <th key={j} className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    {row.map((cell, k) => (
                      <td key={k} className="px-4 py-3 text-foreground/70">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = blogPosts.find(p => p.slug === slug);

  const related = useMemo(() => {
    if (!post) return [];
    return blogPosts
      .filter(p => p.slug !== post.slug && (p.category === post.category || Math.random() > 0.5))
      .slice(0, 2);
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const categoryLabel = BLOG_CATEGORIES.find(c => c.id === post.category)?.label ?? post.category;

  const articleJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      author: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
      publisher: {
        "@type": "Organization",
        name: "Pratica Rapida",
        url: "https://www.praticarapida.it",
        logo: { "@type": "ImageObject", url: "https://www.praticarapida.it/pratica-rapida-logo.png" },
      },
      datePublished: post.date,
      dateModified: post.date,
      mainEntityOfPage: { "@type": "WebPage", "@id": `https://www.praticarapida.it/blog/${post.slug}` },
      url: `https://www.praticarapida.it/blog/${post.slug}`,
      inLanguage: "it-IT",
      isPartOf: { "@type": "Blog", name: "Notizie Pratica Rapida", url: "https://www.praticarapida.it/blog" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.praticarapida.it/" },
        { "@type": "ListItem", position: 2, name: "Notizie", item: "https://www.praticarapida.it/blog" },
        { "@type": "ListItem", position: 3, name: post.title, item: `https://www.praticarapida.it/blog/${post.slug}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={post.title}
        description={post.excerpt}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        jsonLd={articleJsonLd}
      />
      <Navbar />

      {/* Hero */}
      <section
        className="relative pt-32 pb-16 overflow-hidden"
        style={{ background: "hsl(var(--pr-dark))" }}
      >
        {/* SVG illustration as full background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {(() => {
            const Cover = BLOG_COVER_MAP[post.slug];
            return Cover ? (
              <div className="absolute inset-0 opacity-40 scale-110">
                <Cover />
              </div>
            ) : (
              <div className="absolute inset-0 opacity-60" style={{ background: post.coverGradient }} />
            );
          })()}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, hsl(var(--pr-dark)) 85%)" }} />
        </div>

        <div className="max-w-3xl mx-auto px-4 relative z-10">
          {/* Breadcrumb */}
          <motion.nav
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm mb-8"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <Link to="/blog" className="hover:text-white transition-colors flex items-center gap-1">
              <ArrowLeft size={13} /> Notizie
            </Link>
            <span>/</span>
            <span style={{ color: post.categoryColor }}>{categoryLabel}</span>
          </motion.nav>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Category badge */}
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-5"
              style={{ background: `${post.categoryColor}18`, color: post.categoryColor, border: `1px solid ${post.categoryColor}35` }}
            >
              {categoryLabel}
            </span>

            <h1 className="font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-white mb-6">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />{formatDate(post.date)}
              </span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="flex items-center gap-1.5">
                <Clock size={13} />{post.readTime} min di lettura
              </span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>{post.author} · {post.authorRole}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Article body */}
      <section className="py-12 lg:py-16">
        <div className="max-w-3xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Excerpt */}
            <p className="text-lg leading-relaxed font-medium text-foreground/80 border-l-2 pl-5 mb-8" style={{ borderColor: "hsl(var(--pr-green))" }}>
              {post.excerpt}
            </p>

            {/* Content */}
            <div>
              {post.content.map((block, i) => renderBlock(block, i))}
            </div>
          </motion.div>

          {/* CTA Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-14 rounded-2xl p-8 sm:p-10 border border-border"
            style={{ background: "hsl(var(--card))" }}
          >
            <div
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-4"
              style={{ background: "hsla(152,100%,45%,0.12)", color: "hsl(152 100% 65%)" }}
            >
              Pratica Rapida
            </div>
            <h3 className="font-bold text-xl sm:text-2xl text-foreground mb-3">
              Vuoi smettere di gestire le pratiche in casa?
            </h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed max-w-lg">
              Delegaci le pratiche ENEA e Conto Termico dei tuoi clienti. Le trasmettiamo a tuo nome in 24–72 ore, con assicurazione RC inclusa. Paghi solo quando la pratica è completata.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/pratica-enea"
                className="inline-flex items-center justify-center gap-2 font-bold text-sm px-6 py-3 rounded-full text-white transition-all hover:brightness-110"
                style={{ background: "hsl(var(--pr-green))" }}
              >
                Pratiche ENEA — 65€ <ArrowRight size={14} />
              </Link>
              <Link
                to="/conto-termico"
                className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-6 py-3 rounded-full border border-border text-foreground hover:bg-muted transition-all"
              >
                Conto Termico <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>

          {/* Related articles */}
          {related.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-14"
            >
              <h3 className="font-bold text-lg text-foreground mb-6">Potrebbe interessarti anche</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    to={`/blog/${r.slug}`}
                    className="group flex gap-4 p-4 rounded-xl border border-border bg-card hover:border-[hsl(var(--pr-green))/50] transition-all"
                  >
                    <div className="w-14 h-14 rounded-lg shrink-0 overflow-hidden bg-black">
                      {(() => {
                        const Cover = BLOG_COVER_MAP[r.slug];
                        return Cover ? <Cover /> : <div className="w-full h-full" style={{ background: r.coverGradient }} />;
                      })()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold" style={{ color: r.categoryColor }}>
                        {BLOG_CATEGORIES.find(c => c.id === r.category)?.label}
                      </span>
                      <p className="text-sm font-semibold text-foreground leading-snug mt-0.5 group-hover:text-[hsl(var(--pr-green))] transition-colors line-clamp-2">
                        {r.title}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Link
                  to="/blog"
                  className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                  style={{ color: "hsl(var(--pr-green))" }}
                >
                  <ArrowLeft size={13} /> Tutti gli articoli
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}
