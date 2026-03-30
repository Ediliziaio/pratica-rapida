import { motion } from "framer-motion";
import { useScrollAnimation, useCounterAnimation } from "../landing/hooks";

const stats = [
  { target: 2000, prefix: "", suffix: "+", label: "Pratiche gestite totali" },
  { target: 350, prefix: "", suffix: "+", label: "Installatori attivi" },
  { target: 8, prefix: "", suffix: "+", label: "Anni di esperienza" },
  { target: 48, prefix: "", suffix: "h", label: "Tempo medio evasione ENEA" },
  { target: 72, prefix: "", suffix: "h", label: "Tempo medio evasione GSE" },
  { target: 0, prefix: "", suffix: "", label: "Pratiche respinte" },
];

function StatItem({ target, prefix, suffix, label, isVisible, index }: {
  target: number; prefix: string; suffix: string; label: string; isVisible: boolean; index: number;
}) {
  const count = useCounterAnimation(target, isVisible);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.1 * index, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="text-center relative"
    >
      <div
        className="font-bold text-4xl sm:text-5xl lg:text-6xl bg-clip-text text-transparent mb-2"
        style={{ backgroundImage: "linear-gradient(135deg, #ffffff 30%, hsla(152,100%,75%,0.9) 100%)" }}
      >
        {prefix}{count.toLocaleString("it-IT")}{suffix}
      </div>
      <p className="text-sm sm:text-base font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</p>
    </motion.div>
  );
}

export default function StatsSectionHome() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      className="relative py-20 sm:py-24 lg:py-32 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 60% 50%, hsl(152 80% 16%) 0%, hsl(152 85% 8%) 60%, hsl(218 52% 7%) 100%)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)" }} />

      <div className="max-w-6xl mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14 sm:mb-20"
        >
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl xl:text-6xl leading-[1.1] text-white mb-4">
            I numeri dietro a ogni pratica.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 75%) 0%, hsl(200 100% 65%) 100%)" }}
            >
              Costruiti giorno dopo giorno.
            </span>
          </h2>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
            Non vendiamo promesse. Questi sono i risultati reali degli installatori che lavorano con noi.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-4 sm:gap-x-8 max-w-4xl mx-auto">
          {stats.map((s, i) => (
            <div key={i} className="relative">
              {i % 2 === 0 && i < stats.length - 1 && (
                <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-12" style={{ background: "rgba(255,255,255,0.1)" }} />
              )}
              <StatItem {...s} index={i} isVisible={isVisible} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
