import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Newspaper, Clock } from "lucide-react";
import { usePublishedNews, categoryLabel, categoryColor } from "@/lib/news";

interface Props {
  light?: boolean;
}

/**
 * Hero side widget that surfaces the latest news article inline with the
 * "Cosa ottieni" benefits card. Designed to live directly underneath
 * `<BenefitsWidget>` in HeroSectionHome.
 *
 * Renders nothing if there are no published articles yet.
 */
export default function HeroNewsWidget({ light = false }: Props) {
  const { data: posts = [] } = usePublishedNews();
  const latest = posts[0];
  if (!latest) return null;

  const cardBg     = light ? "rgba(255,255,255,0.80)"     : "rgba(255,255,255,0.04)";
  const cardBorder = light ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)";
  const cardShadow = light
    ? "0 8px 40px rgba(0,0,0,0.09), 0 1px 0 rgba(255,255,255,0.95) inset"
    : "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)";
  const titleColor = light ? "#111827"          : "#ffffff";
  const subColor   = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
  const headerSub  = light ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.32)";
  const divider    = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";

  const catColor = categoryColor(latest.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85, duration: 0.6 }}
      className="rounded-2xl p-5 mt-5"
      style={{
        background: cardBg,
        border: cardBorder,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: cardShadow,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "hsla(152,70%,40%,0.12)", border: "1px solid hsla(152,70%,40%,0.22)" }}
          >
            <Newspaper className="w-3.5 h-3.5" style={{ color: light ? "hsl(152 60% 32%)" : "hsl(152 100% 60%)" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: titleColor }}>
              Ultime notizie
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: headerSub }}>
              dal nostro blog
            </p>
          </div>
        </div>
        <Link
          to="/blog"
          className="text-[11px] font-semibold inline-flex items-center gap-0.5 hover:gap-1 transition-all"
          style={{ color: light ? "hsl(152 55% 32%)" : "hsl(152 100% 70%)" }}
        >
          Tutte <ArrowRight size={11} />
        </Link>
      </div>

      <div style={{ height: 1, background: divider, marginBottom: 12 }} />

      {/* Latest article card */}
      <Link
        to={`/blog/${latest.slug}`}
        className="group flex items-start gap-3 p-2.5 -m-2.5 rounded-xl transition-colors"
        style={{ transition: "background 0.2s" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = light
            ? "rgba(0,0,0,0.03)"
            : "rgba(255,255,255,0.05)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div className="flex-1 min-w-0">
          <span
            className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mb-1.5 uppercase tracking-wider"
            style={{ background: `${catColor}1c`, color: catColor }}
          >
            {categoryLabel(latest.category)}
          </span>
          <p
            className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline"
            style={{ color: titleColor }}
          >
            {latest.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: subColor }}>
            <Clock size={10} />
            <span>{latest.read_time_minutes} min</span>
            {latest.pinned && (
              <>
                <span className="w-0.5 h-0.5 rounded-full" style={{ background: subColor }} />
                <span className="font-semibold" style={{ color: "hsl(25 100% 50%)" }}>In evidenza</span>
              </>
            )}
          </div>
        </div>
      </Link>

      {/* CTA strip — secondary articles count */}
      {posts.length > 1 && (
        <Link
          to="/blog"
          className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:underline"
          style={{
            background: "hsla(152,70%,40%,0.06)",
            border: "1px solid hsla(152,70%,40%,0.14)",
            color: light ? "hsl(152 55% 30%)" : "hsl(152 100% 70%)",
          }}
        >
          <span>+ altri {posts.length - 1} articol{posts.length - 1 === 1 ? "o" : "i"} disponibili</span>
          <ArrowRight size={11} />
        </Link>
      )}
    </motion.div>
  );
}
