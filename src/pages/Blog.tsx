import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { blogPosts, BLOG_CATEGORIES } from "@/data/blog-posts";
import { BLOG_COVER_MAP } from "@/components/blog/BlogCovers";

const blogJsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "Blog Pratica Rapida",
  url: "https://www.praticarapida.it/blog",
  description: "Guide e risorse per installatori su pratiche ENEA, Conto Termico, normativa e burocrazia energetica.",
  publisher: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function ArticleCard({ post, index }: { post: typeof blogPosts[0]; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-[hsl(var(--pr-green))/50] transition-all duration-300 hover:shadow-lg hover:shadow-[hsl(152,100%,30%,0.08)]"
    >
      {/* Cover */}
      <div className="h-44 relative overflow-hidden bg-black">
        {(() => {
          const Cover = BLOG_COVER_MAP[post.slug];
          return Cover ? <Cover /> : (
            <div className="w-full h-full" style={{ background: post.coverGradient }} />
          );
        })()}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-6 gap-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(post.date)}</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="flex items-center gap-1"><Clock size={11} />{post.readTime} min</span>
        </div>

        <div className="flex-1">
          <h2 className="font-bold text-base sm:text-lg leading-snug text-foreground mb-2 group-hover:text-[hsl(var(--pr-green))] transition-colors line-clamp-3">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {post.excerpt}
          </p>
        </div>

        <Link
          to={`/blog/${post.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: "hsl(var(--pr-green))" }}
        >
          Leggi l'articolo <ArrowRight size={13} />
        </Link>
      </div>
    </motion.article>
  );
}

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("tutti");

  const filtered = activeCategory === "tutti"
    ? blogPosts
    : blogPosts.filter(p => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Blog per Installatori — Guide ENEA e Conto Termico | Pratica Rapida"
        description="Guide pratiche per installatori: ENEA, Conto Termico GSE, normativa energetica e aggiornamenti fiscali 2026. Risorse operative per serramentisti e termoidraulici."
        canonical="/blog"
        keywords="blog pratica ENEA, guida ecobonus 2026, conto termico guida, normativa energetica installatori, bonus casa serramenti 2026"
        jsonLd={blogJsonLd}
      />
      <Navbar />

      {/* Hero */}
      <section
        className="relative pt-32 pb-20 overflow-hidden"
        style={{ background: "hsl(var(--pr-dark))" }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(ellipse, hsla(152,100%,30%,0.18) 0%, transparent 70%)", filter: "blur(50px)" }}
          />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-6"
              style={{ background: "hsla(152,100%,45%,0.12)", color: "hsl(152 100% 65%)", border: "1px solid hsla(152,100%,45%,0.25)" }}
            >
              BLOG
            </span>
            <h1 className="font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-white mb-5">
              Risorse per{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 68%) 0%, hsl(200 100% 62%) 100%)" }}
              >
                installatori
              </span>
            </h1>
            <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              Guide pratiche su ENEA, Conto Termico, normativa energetica e tutto quello che devi sapere per gestire le pratiche dei tuoi clienti.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Articles */}
      <section className="py-16 lg:py-24">
        <div className="max-w-6xl mx-auto px-4">

          {/* Category filters */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap gap-2 mb-10"
          >
            {BLOG_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={
                  activeCategory === cat.id
                    ? { background: "hsl(var(--pr-green))", color: "#fff" }
                    : { background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" }
                }
              >
                {cat.label}
              </button>
            ))}
          </motion.div>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((post, i) => (
              <ArticleCard key={post.slug} post={post} index={i} />
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-16">Nessun articolo in questa categoria.</p>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
