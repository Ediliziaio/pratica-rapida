import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { ArrowDown } from "lucide-react";

export default function ProblemSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="vantaggi" className="py-20 lg:py-28 bg-card">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isVisible ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="relative rounded-2xl overflow-hidden aspect-[4/3]"
          >
            <img
              src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80"
              alt="Documenti e burocrazia"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-destructive/20 to-transparent" />
          </motion.div>

          {/* Content */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6 text-foreground">
                Quante ore hai perso l'anno scorso{" "}
                <span style={{ color: "hsl(var(--pr-green))" }}>dietro alle pratiche?</span>
              </h2>
              <div className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed">
                <p>
                  Ogni installazione chiusa è seguita da ore di burocrazia: raccogliere documenti al cliente, compilare i moduli ENEA, fare follow-up telefonici, caricare tutto sui portali.
                </p>
                <p>
                  <strong className="text-foreground">Ore che non vengono pagate. Ore tolte alla vendita.</strong>
                </p>
                <p>
                  Il problema non sei tu — è che questo lavoro non dovrebbe farlo chi installa finestre o monta pannelli.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.6 }}
              className="mt-8 space-y-3"
            >
              <h3 className="font-bold text-2xl text-foreground">
                <span style={{ color: "hsl(var(--pr-green))" }}>Ecco perché esistiamo.</span>
              </h3>
              <ArrowDown className="animate-bounce" size={28} style={{ color: "hsl(var(--pr-green))" }} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
