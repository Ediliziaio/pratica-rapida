import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { ArrowDown, Clock, FileText, Phone, Upload } from "lucide-react";

const painPoints = [
  { icon: FileText, label: "Raccolta documenti", stat: "~3h", statLabel: "per cliente" },
  { icon: Upload, label: "Moduli ENEA", stat: "~45min", statLabel: "per pratica" },
  { icon: Phone, label: "Follow-up telefonici", stat: "3-5", statLabel: "chiamate medie" },
  { icon: Clock, label: "Caricamento portali", stat: "~1h", statLabel: "per invio" },
];

export default function ProblemSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="vantaggi" className="py-20 lg:py-28 bg-card">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Visual — pain point icons */}
          <div className="order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isVisible ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6 }}
              className="grid grid-cols-2 gap-4"
            >
              {painPoints.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center gap-2 p-5 sm:p-6 rounded-2xl bg-background border border-border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <item.icon className="w-6 h-6 text-destructive" />
                  </div>
                  <span className="font-bold text-2xl text-destructive">{item.stat}</span>
                  <span className="text-xs text-muted-foreground text-center">{item.statLabel}</span>
                  <span className="text-sm font-medium text-foreground text-center">{item.label}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Content */}
          <div className="order-1 lg:order-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-5 tracking-wide"
                style={{
                  backgroundColor: "hsla(var(--pr-green), 0.1)",
                  color: "hsl(var(--pr-green))",
                }}
              >
                IL PROBLEMA
              </span>

              <h2 className="font-bold text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1] mb-3 text-foreground">
                Quante ore hai perso l'anno scorso{" "}
                <span style={{ color: "hsl(var(--pr-green))" }}>dietro alle pratiche?</span>
              </h2>

              <p className="text-muted-foreground text-sm sm:text-base mb-6">
                Ogni vendita chiusa porta con sé ore di lavoro amministrativo non fatturabile.
              </p>

              <div className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed">
                <p>
                  Ogni installazione chiusa è seguita da ore di burocrazia: raccogliere documenti al cliente, compilare i moduli ENEA, fare follow-up telefonici, caricare tutto sui portali.
                </p>
              </div>

              {/* Blockquote highlight */}
              <motion.blockquote
                initial={{ opacity: 0, x: -10 }}
                animate={isVisible ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="my-6 pl-4 py-3 rounded-r-lg border-l-4"
                style={{
                  borderColor: "hsl(var(--pr-green))",
                  backgroundColor: "hsla(var(--pr-green), 0.05)",
                }}
              >
                <p className="text-foreground font-semibold text-base sm:text-lg">
                  Ore che non vengono pagate. Ore tolte alla vendita.
                </p>
              </motion.blockquote>

              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                Il problema non sei tu — è che questo lavoro non dovrebbe farlo chi installa finestre o monta pannelli.
              </p>
            </motion.div>

            {/* Transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.7 }}
              className="mt-10 flex flex-col items-start gap-3"
            >
              <h3 className="font-bold text-2xl sm:text-3xl text-foreground">
                <span style={{ color: "hsl(var(--pr-green))" }}>Ecco perché esistiamo.</span>
              </h3>
              <div className="flex items-center gap-3">
                <div
                  className="w-0.5 h-8 rounded-full animate-grow-line"
                  style={{ backgroundColor: "hsl(var(--pr-green))" }}
                />
                <ArrowDown className="animate-bounce" size={24} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
