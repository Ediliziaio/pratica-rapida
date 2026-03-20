import { motion } from "framer-motion";
import { useScrollAnimation, useCounterAnimation } from "./hooks";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const bullets = [
  "Ogni vendita persa per mancanza del servizio ENEA: €3.000-€10.000 di margine",
  "Ogni pratica gestita internamente: 6-8 ore di lavoro burocratico sprecato",
  "Ogni cliente insoddisfatto: passaparola negativo e recensioni perse",
];

export default function InactionCostSection() {
  const { ref, isVisible } = useScrollAnimation();
  const lostSales = useCounterAnimation(5, isVisible);

  return (
    <section
      ref={ref}
      className="py-16 sm:py-20 lg:py-28"
      style={{ background: "linear-gradient(135deg, hsl(0 86% 97%) 0%, hsl(33 100% 96%) 100%)" }}
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-8 sm:mb-10 text-destructive"
        >
          Ogni Mese Senza Pratica Rapida
          <br />
          Ti Costa Vendite.
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={isVisible ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="max-w-md mx-auto bg-card border-2 border-destructive/20 rounded-2xl p-6 sm:p-8 mb-8 sm:mb-10 shadow-lg"
        >
          <p className="text-sm text-muted-foreground mb-2">Vendite perse stimate al mese:</p>
          <div className="font-bold text-4xl sm:text-5xl lg:text-6xl text-destructive">
            {lostSales}+
            <span className="text-lg sm:text-xl font-semibold text-muted-foreground"> clienti</span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            che scelgono il concorrente che offre il servizio ENEA completo
          </p>
        </motion.div>

        <div className="max-w-xl mx-auto space-y-4 mb-10">
          {bullets.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={isVisible ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.5 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <X size={18} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-foreground">{b}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9 }}
        >
          <Link
            to="/auth"
            className="inline-flex items-center text-white font-bold px-8 py-3.5 rounded-full text-base transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(38 92% 50%))" }}
          >
            → Smetti di Perdere Clienti — Attiva Adesso
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
