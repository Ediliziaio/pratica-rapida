import { motion } from "framer-motion";
import { useScrollAnimation, useCounterAnimation } from "./hooks";

const stats = [
  { target: 20000, prefix: "", suffix: "+", label: "Pratiche gestite" },
  { target: 500, prefix: "", suffix: "+", label: "Aziende soddisfatte" },
  { target: 14, prefix: "", suffix: "+", label: "Anni di esperienza" },
  { target: 48, prefix: "", suffix: "h", label: "Tempo medio evasione" },
  { target: 122, prefix: "", suffix: "+", label: "Recensioni Trustpilot" },
  { target: 98, prefix: "", suffix: "%", label: "Tasso di soddisfazione" },
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
      <p className="text-sm sm:text-base font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </p>
    </motion.div>
  );
}

export default function DataWallSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      className="relative py-20 sm:py-24 lg:py-32 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 60% 50%, hsl(152 80% 18%) 0%, hsl(152 85% 10%) 60%, hsl(218 52% 8%) 100%)" }}
    >
      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Top edge glow */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)" }}
      />
      {/* Bottom edge glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)" }}
      />

      <div className="max-w-6xl mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14 sm:mb-20"
        >
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl xl:text-6xl leading-[1.1] text-white mb-4">
            Oltre 14 anni. 20.000+ pratiche.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 75%) 0%, hsl(152 100% 55%) 100%)" }}
            >
              Zero pensieri per chi ci affida il lavoro.
            </span>
          </h2>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
            Numeri costruiti con il lavoro quotidiano — non con le promesse.
          </p>
        </motion.div>

        {/* Stats grid with dividers */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-4 sm:gap-x-8 max-w-4xl mx-auto">
          {stats.map((s, i) => (
            <div key={i} className="relative">
              {/* Vertical divider right (not on last col) */}
              {i % 2 === 0 && i < stats.length - 1 && (
                <div
                  className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-12"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                />
              )}
              <StatItem {...s} index={i} isVisible={isVisible} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
