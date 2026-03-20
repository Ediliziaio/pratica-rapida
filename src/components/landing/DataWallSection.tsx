import { motion } from "framer-motion";
import { useScrollAnimation, useCounterAnimation } from "./hooks";

const stats = [
  { target: 5000, prefix: "", suffix: "+", label: "Pratiche ENEA gestite" },
  { target: 500, prefix: "", suffix: "+", label: "Aziende soddisfatte" },
  { target: 14, prefix: "", suffix: "+", label: "Anni di esperienza" },
  { target: 65, prefix: "€", suffix: "", label: "Prezzo fisso a pratica" },
  { target: 122, prefix: "", suffix: "+", label: "Recensioni Trustpilot" },
  { target: 24, prefix: "", suffix: "h", label: "Consegna garantita" },
  { target: 98, prefix: "", suffix: "%", label: "Tasso di soddisfazione" },
  { target: 0, prefix: "", suffix: "€", label: "Canone mensile" },
];

function StatItem({ target, prefix, suffix, label, isVisible }: {
  target: number; prefix: string; suffix: string; label: string; isVisible: boolean;
}) {
  const count = useCounterAnimation(target, isVisible);
  return (
    <div className="text-center">
      <div className="font-bold text-3xl sm:text-4xl lg:text-5xl text-white">
        {prefix}{count.toLocaleString("it-IT")}{suffix}
      </div>
      <p className="text-xs sm:text-sm text-white/60 mt-2">{label}</p>
    </div>
  );
}

export default function DataWallSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28" style={{ background: "radial-gradient(ellipse at center, hsl(var(--pr-green)), hsl(152 80% 18%))" }}>
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] text-white">
            I Numeri Parlano Chiaro.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12 max-w-5xl mx-auto"
        >
          {stats.map((s, i) => (
            <StatItem key={i} {...s} isVisible={isVisible} />
          ))}
        </motion.div>

        <p className="text-center text-xs text-white/40 mt-8">
          Dati aggiornati al 2025 — elaborati su base clienti attivi
        </p>
      </div>
    </section>
  );
}
