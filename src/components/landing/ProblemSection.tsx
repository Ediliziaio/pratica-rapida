import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { ArrowDown } from "lucide-react";

const paragraphs = [
  {
    text: "Ogni installazione chiusa è seguita da ore di burocrazia: raccogliere documenti al cliente, compilare i moduli ENEA, fare follow-up telefonici, caricare tutto sui portali.",
    highlight: false,
  },
  {
    text: "Ore che non vengono pagate. Ore tolte alla vendita.",
    highlight: true,
  },
  {
    text: "Il problema non sei tu — è che questo lavoro non dovrebbe farlo chi installa finestre o monta pannelli.",
    highlight: false,
  },
];

export default function ProblemSection() {
  const { ref, isVisible } = useScrollAnimation(0.15);

  return (
    <section
      ref={ref}
      className="relative py-24 lg:py-36 overflow-hidden"
      style={{ background: "hsl(var(--pr-dark))" }}
    >
      {/* Background image with dark overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=60"
          alt=""
          className="w-full h-full object-cover opacity-[0.08]"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(var(--pr-dark)) 0%, hsla(var(--pr-dark), 0.85) 50%, hsl(var(--pr-dark)) 100%)" }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 lg:px-8 text-center">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
          animate={isVisible ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="font-display font-bold text-white leading-[1.05] tracking-tight mb-16"
          style={{ fontSize: "clamp(1.75rem, 4vw, 3.2rem)" }}
        >
          Quante ore hai perso l'anno scorso{" "}
          <span className="text-glow-green text-[hsl(var(--pr-green-light))]">
            dietro alle pratiche?
          </span>
        </motion.h2>

        {/* Timeline paragraphs */}
        <div className="relative max-w-2xl mx-auto text-left">
          {/* Vertical green line */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={isVisible ? { scaleY: 1 } : {}}
            transition={{ delay: 0.4, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-0 bottom-0 w-[2px] origin-top rounded-full"
            style={{ background: "linear-gradient(180deg, hsl(var(--pr-green)), hsla(var(--pr-green), 0.1))" }}
          />

          <div className="space-y-8 pl-8">
            {paragraphs.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={isVisible ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.5 + i * 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                {/* Dot on the timeline */}
                <div
                  className="absolute -left-8 top-2 w-2 h-2 rounded-full -translate-x-[3px]"
                  style={{ background: p.highlight ? "hsl(var(--pr-green))" : "hsla(var(--pr-green), 0.4)" }}
                />
                <p
                  className={`text-base sm:text-lg leading-relaxed ${
                    p.highlight
                      ? "font-bold text-white reveal-highlight"
                      : "text-white/70"
                  }`}
                >
                  {p.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Transition CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 space-y-4"
        >
          <h3
            className="font-display font-bold text-[hsl(var(--pr-green-light))] text-glow-green"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}
          >
            Ecco perché esistiamo.
          </h3>
          <ArrowDown className="mx-auto animate-bounce text-[hsl(var(--pr-green-light))]" size={28} />
        </motion.div>
      </div>

      {/* Bottom gradient transition to white */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
      />
    </section>
  );
}
