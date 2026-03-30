import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { ArrowRight, Sparkles, Phone, FileCheck, Send } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    icon: Phone,
    step: "01",
    title: "Contattiamo il cliente",
    desc: "Chiamiamo a nome della tua azienda e raccogliamo tutte le informazioni sull'impianto installato.",
    color: "hsl(152 100% 35%)",
    glow: "hsla(152,100%,35%,0.3)",
  },
  {
    icon: FileCheck,
    step: "02",
    title: "Prepariamo il fascicolo GSE",
    desc: "Schede tecniche, verbali di collaudo, certificazioni energetiche: tutto in regola per il portale GSE.",
    color: "hsl(220 80% 60%)",
    glow: "hsla(220,80%,60%,0.3)",
  },
  {
    icon: Send,
    step: "03",
    title: "Inviamo entro 72 ore",
    desc: "Pratica trasmessa al GSE entro 72 ore. Il tuo cliente riceve il contributo direttamente dallo Stato.",
    color: "hsl(38 92% 55%)",
    glow: "hsla(38,92%,55%,0.3)",
  },
];

export default function SolutionSectionCT() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="soluzione" className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <motion.span
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6"
              style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
            >
              Chi Siamo
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              className="font-extrabold text-2xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6 text-foreground"
            >
              Il tuo ufficio pratiche Conto Termico —{" "}
              <span className="text-gradient-green">senza rischi, senza pensieri.</span>
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.3 }}
              className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed"
            >
              <p>
                Pratica Rapida gestisce le pratiche Conto Termico per conto di installatori di caldaie a condensazione, pompe di calore, solare termico e sistemi di climatizzazione.
              </p>
              <p className="font-medium text-foreground">
                Zero pratiche respinte. Zero contributi persi. Zero stress per te.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="mt-8"
            >
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full transition-all hover:brightness-110 active:scale-[0.97] text-white"
                style={{ backgroundColor: "hsl(var(--pr-green))" }}
              >
                Provalo gratis — zero impegno <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>

          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              className="flex items-center gap-2 mb-6"
            >
              <Sparkles size={16} style={{ color: "hsl(var(--pr-green))" }} />
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--pr-green))" }}>
                Come funziona in 3 passi
              </span>
            </motion.div>

            {steps.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 24 }}
                animate={isVisible ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.2 + i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-4 p-5 rounded-2xl border border-border bg-card hover:shadow-md transition-all duration-300 group"
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-105"
                  style={{ background: s.glow, border: `1px solid ${s.color}30`, boxShadow: `0 0 16px ${s.glow}` }}
                >
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold tabular-nums" style={{ color: s.color }}>{s.step}</span>
                    <h3 className="font-bold text-sm sm:text-base text-foreground">{s.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
