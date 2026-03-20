import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Link } from "react-router-dom";
import { Clock, Phone, CheckCircle, Lock, Star } from "lucide-react";

export default function FinalCTA() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      className="py-16 sm:py-20 lg:py-28 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, hsl(var(--pr-dark)) 0%, hsl(218 48% 16%) 100%)" }}
    >
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-white/10 animate-float-slow"
          style={{ left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 25}%`, animationDelay: `${i * 0.8}s` }}
        />
      ))}

      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center relative z-10">
        <motion.span
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          className="inline-block bg-white/20 text-white px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
        >
          🚀 Inizia Oggi — Zero Rischi
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] text-white mb-6"
        >
          Ogni Mese Senza
          <br />
          Pratica Rapida
          <br />
          È Fatturato Perso.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="text-white/70 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed"
        >
          Il tuo concorrente offre già il servizio ENEA completo. Ogni giorno che aspetti, 
          è un cliente che sceglie lui invece di te. Attivati in 2 minuti — è gratis.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
        >
          <Link
            to="/auth"
            className="inline-flex items-center bg-white font-bold px-10 py-4 rounded-full text-base transition-all hover:bg-white/90"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            → Attiva Gratis in 2 Minuti
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.7 }}
          className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-6 text-sm text-white/60"
        >
          <span className="flex items-center justify-center gap-1.5"><Clock size={14} /> Operativo in 24h</span>
          <span className="flex items-center justify-center gap-1.5"><Phone size={14} /> Supporto italiano dedicato</span>
          <span className="flex items-center justify-center gap-1.5"><CheckCircle size={14} /> Nessun vincolo</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.9 }}
          className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-white/40"
        >
          <span className="flex items-center gap-1"><Lock size={12} /> GDPR Compliant</span>
          <span className="flex items-center gap-1">🇮🇹 100% Made in Italy</span>
          <span className="flex items-center gap-1"><Star size={12} /> 4.9/5 Trustpilot</span>
        </motion.div>
      </div>
    </section>
  );
}
