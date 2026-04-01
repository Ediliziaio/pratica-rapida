import { motion } from "framer-motion";
import { Shield, Zap, FileCheck, HeadphonesIcon, BadgeCheck } from "lucide-react";

const BENEFITS = [
  {
    icon: FileCheck,
    color: "hsl(152 70% 38%)",
    colorBg: "hsla(152,70%,40%,0.10)",
    title: "Pratiche inviate a tuo nome",
    desc: "ENEA e Conto Termico registrati con i tuoi dati",
  },
  {
    icon: Zap,
    color: "hsl(38 95% 50%)",
    colorBg: "hsla(38,95%,50%,0.10)",
    title: "Consegna entro 48 ore",
    desc: "Dalla raccolta documenti all'invio all'ente",
  },
  {
    icon: Shield,
    color: "hsl(210 80% 52%)",
    colorBg: "hsla(210,80%,52%,0.10)",
    title: "La responsabilità è nostra",
    desc: "Siamo noi a rispondere a ENEA e Conto Termico",
  },
  {
    icon: HeadphonesIcon,
    color: "hsl(270 65% 58%)",
    colorBg: "hsla(270,65%,58%,0.10)",
    title: "Supporto dedicato",
    desc: "Un consulente sempre disponibile per te",
  },
];

interface Props {
  light?: boolean;
}

export default function BenefitsWidget({ light = false }: Props) {
  const cardBg     = light ? "rgba(255,255,255,0.80)"     : "rgba(255,255,255,0.04)";
  const cardBorder = light ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)";
  const cardShadow = light
    ? "0 8px 40px rgba(0,0,0,0.09), 0 1px 0 rgba(255,255,255,0.95) inset"
    : "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)";
  const titleColor = light ? "#111827"            : "#ffffff";
  const descColor  = light ? "rgba(0,0,0,0.44)"   : "rgba(255,255,255,0.44)";
  const headerSub  = light ? "rgba(0,0,0,0.32)"   : "rgba(255,255,255,0.32)";
  const divider    = light ? "rgba(0,0,0,0.06)"   : "rgba(255,255,255,0.06)";
  const footerBg   = light ? "hsla(152,70%,40%,0.06)" : "hsla(152,100%,40%,0.08)";
  const footerBorder=light ? "hsla(152,70%,40%,0.18)" : "hsla(152,100%,40%,0.18)";

  return (
    <motion.div
      className="rounded-2xl p-5 sm:p-6 animate-float"
      style={{
        background: cardBg,
        border: cardBorder,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: cardShadow,
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <p className="text-sm font-bold" style={{ color: titleColor }}>
            Cosa ottieni con Pratica Rapida
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: headerSub }}>
            tutto incluso nel prezzo
          </p>
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 20 }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{
            background: "hsla(152,70%,40%,0.12)",
            border: "1px solid hsla(152,70%,40%,0.22)",
            color: light ? "hsl(152 60% 28%)" : "hsl(152 100% 65%)",
          }}
        >
          <BadgeCheck className="w-3 h-3" />
          Incluso
        </motion.div>
      </motion.div>

      {/* Divider */}
      <div style={{ height: 1, background: divider, marginBottom: 12 }} />

      {/* Benefits list */}
      <div className="space-y-1">
        {BENEFITS.map((b, i) => {
          const Icon = b.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: 0.65 + i * 0.13,
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center gap-3 p-2.5 rounded-xl group"
              style={{ transition: "background 0.2s" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = light
                  ? "rgba(0,0,0,0.03)"
                  : "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Icon bubble */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.7 + i * 0.13, type: "spring", stiffness: 300, damping: 18 }}
                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: b.colorBg, border: `1px solid ${b.colorBg.replace("0.10", "0.22")}` }}
              >
                <Icon className="w-4 h-4" style={{ color: b.color }} />
              </motion.div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: titleColor }}>
                  {b.title}
                </p>
                <p className="text-[11px] mt-0.5 leading-tight" style={{ color: descColor }}>
                  {b.desc}
                </p>
              </div>

              {/* Check */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.85 + i * 0.13, type: "spring", stiffness: 400, damping: 18 }}
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "hsla(152,70%,40%,0.12)", border: "1px solid hsla(152,70%,40%,0.25)" }}
              >
                <motion.svg
                  width="10" height="8" viewBox="0 0 10 8" fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.95 + i * 0.13, duration: 0.35, ease: "easeOut" }}
                >
                  <motion.path
                    d="M1 4L3.8 7L9 1"
                    stroke={light ? "hsl(152 60% 32%)" : "hsl(152 100% 60%)"}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.95 + i * 0.13, duration: 0.35, ease: "easeOut" }}
                  />
                </motion.svg>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer CTA strip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.5 }}
        className="mt-4 flex items-center justify-between px-3.5 py-2.5 rounded-xl"
        style={{
          background: footerBg,
          border: `1px solid ${footerBorder}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "hsl(152 80% 42%)" }} />
          <span className="text-xs font-medium" style={{ color: light ? "hsl(152 55% 30%)" : "hsl(152 100% 70%)" }}>
            Nessun costo fisso · Zero vincoli
          </span>
        </div>
        <span className="text-[11px] font-bold" style={{ color: light ? "hsl(152 55% 30%)" : "hsl(152 100% 70%)" }}>
          350+ attivi
        </span>
      </motion.div>
    </motion.div>
  );
}
