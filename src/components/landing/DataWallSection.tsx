import { motion } from "framer-motion";
import { useScrollAnimation, useCounterAnimation } from "./hooks";

const stats = [
  { target: 5000, prefix: "", suffix: "+", label: "Pratiche gestite" },
  { target: 500, prefix: "", suffix: "+", label: "Aziende soddisfatte" },
  { target: 14, prefix: "", suffix: "+", label: "Anni di esperienza" },
  { target: 48, prefix: "", suffix: "h", label: "Tempo medio evasione" },
  { target: 122, prefix: "", suffix: "+", label: "Recensioni Trustpilot" },
  { target: 98, prefix: "", suffix: "%", label: "Tasso di soddisfazione" },
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
      <p className="text-sm text-white/80 mt-2">{label}</p>
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
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] text-white mb-4">
            Oltre 14 anni. Migliaia di pratiche.
            <br />
            Zero pensieri per chi ci affida il lavoro.
          </h2>
          <p className="text-white/70 text-base sm:text-lg max-w-2xl mx-auto">
            Numeri che parlano da soli — costruiti con il lavoro quotidiano, non con le promesse.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 lg:gap-12 max-w-4xl mx-auto"
        >
          {stats.map((s, i) => (
            <StatItem key={i} {...s} isVisible={isVisible} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
