import { motion } from "framer-motion";
import { Newspaper } from "lucide-react";

export interface NewsItem {
  date: string;
  title: string;
  icon: string;
  badge?: string;
}

// ── Aggiorna qui le news quando vuoi ──────────────────────────
export const NEWS_ITEMS: NewsItem[] = [
  { date: "Mar 2026", title: "Nuovo portale online — benvenuti!", icon: "🚀", badge: "Novità" },
  { date: "Feb 2026", title: "2.000+ pratiche gestite con successo", icon: "🏆", badge: "Traguardo" },
  { date: "Feb 2026", title: "AEDIX Racing Team — gara a Monza 🏎️", icon: "🏎️", badge: "Team" },
  { date: "Gen 2026", title: "Integrazione GSE aggiornata v2.0", icon: "✅", badge: "Update" },
];
// ─────────────────────────────────────────────────────────────

interface Props {
  light?: boolean;
}

export default function NewsWidget({ light = false }: Props) {
  const cardBg    = light ? "rgba(255,255,255,0.75)"    : "rgba(255,255,255,0.04)";
  const cardBorder= light ? "1px solid rgba(0,0,0,0.09)": "1px solid rgba(255,255,255,0.1)";
  const cardShadow= light
    ? "0 8px 32px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.9) inset"
    : "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)";
  const itemBg    = light ? "rgba(0,0,0,0.03)"          : "rgba(255,255,255,0.05)";
  const itemBorder= light ? "1px solid rgba(0,0,0,0.07)": "1px solid rgba(255,255,255,0.07)";
  const titleColor= light ? "#111827"                   : "#ffffff";
  const dateColor = light ? "rgba(0,0,0,0.38)"          : "rgba(255,255,255,0.38)";
  const headerColor= light? "rgba(0,0,0,0.35)"          : "rgba(255,255,255,0.35)";
  const footerColor= light? "rgba(0,0,0,0.28)"          : "rgba(255,255,255,0.3)";
  const pulseColor= "hsl(152 100% 40%)";

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 space-y-3 animate-float"
      style={{
        background: cardBg,
        border: cardBorder,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: cardShadow,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {[
          { color: "rgba(255,80,80,0.8)" },
          { color: "hsla(152,100%,40%,0.8)" },
          { color: light ? "rgba(0,0,0,0.15)" : "rgba(200,200,200,0.2)" },
        ].map((dot, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.1 }}
            className="w-3 h-3 rounded-full"
            style={{ background: dot.color }}
          />
        ))}
        <div
          className="ml-auto flex items-center gap-1.5 text-xs font-medium"
          style={{ color: headerColor }}
        >
          <Newspaper className="w-3.5 h-3.5" />
          Aggiornamenti
        </div>
      </div>

      {/* News list */}
      {NEWS_ITEMS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 + i * 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: itemBg, border: itemBorder }}
        >
          <span className="text-xl leading-none mt-0.5">{item.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm leading-snug truncate font-medium" style={{ color: titleColor }}>
              {item.title}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: dateColor }}>{item.date}</p>
          </div>
          {item.badge && (
            <span
              className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "hsla(152,100%,45%,0.12)",
                color: light ? "hsl(152 60% 32%)" : "hsl(152 100% 65%)",
                border: light ? "1px solid hsla(152,70%,40%,0.25)" : "1px solid hsla(152,100%,45%,0.25)",
              }}
            >
              {item.badge}
            </span>
          )}
        </motion.div>
      ))}

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="flex items-center gap-2 text-xs pt-1"
        style={{ color: footerColor }}
      >
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: pulseColor }} />
        praticarapida.it — sempre aggiornato
      </motion.div>
    </div>
  );
}
