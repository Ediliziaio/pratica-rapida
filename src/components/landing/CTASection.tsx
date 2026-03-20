import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Phone, Mail } from "lucide-react";

export default function FinalCTA() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      className="py-16 sm:py-20 lg:py-28 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, hsl(var(--pr-dark)) 0%, hsl(218 48% 16%) 100%)" }}
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center relative z-10">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] text-white mb-6"
        >
          Quante pratiche hai in sospeso
          <br />
          in questo momento?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="text-white/70 text-base sm:text-lg max-w-xl mx-auto mb-4 leading-relaxed"
        >
          Se ne hai anche solo una — hai già perso tempo che avresti potuto dedicare alle vendite.
          <br />
          Contattaci oggi: ti spieghiamo come funziona, senza impegno e senza costi nascosti.
        </motion.p>

        {/* Urgency badge */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.4 }}
          className="text-sm text-white/50 mb-8"
        >
          Oltre 120 aziende ci hanno già scelto questo mese
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="tel:+390398682691"
            className="inline-flex items-center gap-2 bg-white font-bold px-8 py-4 rounded-full text-base transition-all hover:bg-white/90 active:scale-[0.97]"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            <Phone size={18} /> Parla con noi adesso
          </a>
          <a
            href="mailto:modulistica@praticarapida.it"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:bg-white/20 active:scale-[0.97]"
          >
            <Mail size={18} /> Scrivici una email
          </a>
        </motion.div>
      </div>
    </section>
  );
}
