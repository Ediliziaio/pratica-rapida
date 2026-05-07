import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { BLOG_COVER_MAP } from "@/components/blog/BlogCovers";
import { useScrollAnimation } from "../landing/hooks";
import { usePublishedNews, categoryLabel, categoryColor } from "@/lib/news";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export default function BlogPreviewHome() {
  const { ref, isVisible } = useScrollAnimation();
  const { data: posts = [] } = usePublishedNews();

  // Top 3 by pinned + published_at desc (already sorted by usePublishedNews)
  const latestPosts = posts.slice(0, 3);

  if (latestPosts.length === 0) return null;

  return (
    <section ref={ref} className="py-16 sm:py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="flex items-end justify-between mb-10 gap-4"
        >
          <div>
            <span
              className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-widest mb-3"
              style={{ background: "hsla(152,70%,40%,0.10)", color: "hsl(152 60% 28%)", border: "1px solid hsla(152,70%,40%,0.22)" }}
            >
              NOTIZIE
            </span>
            <h2 className="font-extrabold text-2xl sm:text-3xl text-foreground leading-tight">
              Notizie e Guide per Installatori
            </h2>
            <p className="text-muted-foreground text-sm mt-1.5">
              Normative, incentivi e risorse operative — sempre aggiornate
            </p>
          </div>
          <Link
            to="/blog"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold shrink-0 transition-colors hover:underline"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            Tutte le notizie <ArrowRight size={14} />
          </Link>
        </motion.div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {latestPosts.map((post, i) => {
            const Cover = BLOG_COVER_MAP[post.slug];
            const catColor = categoryColor(post.category);
            const catLabel = categoryLabel(post.category);

            return (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 24 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.1, duration: 0.45 }}
              >
                <Link
                  to={`/blog/${post.slug}`}
                  className="group flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden hover:border-[hsl(var(--pr-green))/40] hover:shadow-lg hover:shadow-[hsl(152,100%,30%,0.06)] transition-all duration-300"
                >
                  {/* Cover */}
                  <div className="h-40 relative overflow-hidden bg-black shrink-0">
                    {post.cover_image_url ? (
                      <img src={post.cover_image_url} alt="" className="w-full h-full object-cover" />
                    ) : Cover ? (
                      <Cover />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{ background: `linear-gradient(135deg, ${catColor}40 0%, ${catColor}10 100%)` }}
                      />
                    )}
                    {/* Category badge overlay */}
                    <div className="absolute top-3 left-3">
                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm"
                        style={{
                          background: `${catColor}22`,
                          color: catColor,
                          border: `1px solid ${catColor}40`,
                        }}
                      >
                        {catLabel}
                      </span>
                    </div>
                    {post.pinned && (
                      <div className="absolute top-3 right-3">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white">
                          IN EVIDENZA
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col flex-1 p-5 gap-3">
                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />{formatDate(post.published_at)}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span className="flex items-center gap-1">
                        <Clock size={11} />{post.read_time_minutes} min
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-base text-foreground leading-snug line-clamp-2 group-hover:text-[hsl(var(--pr-green))] transition-colors">
                      {post.title}
                    </h3>

                    {/* Excerpt */}
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                        {post.excerpt}
                      </p>
                    )}

                    {/* CTA */}
                    <div
                      className="flex items-center gap-1 text-xs font-semibold mt-auto pt-1 group-hover:gap-2 transition-all"
                      style={{ color: "hsl(var(--pr-green))" }}
                    >
                      Leggi l'articolo <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              </motion.article>
            );
          })}
        </div>

        {/* Mobile link */}
        <div className="sm:hidden mt-8 text-center">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            Tutte le notizie <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </section>
  );
}
