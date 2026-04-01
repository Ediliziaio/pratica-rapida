import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Check, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const comparisons = [
  { feature: "Raccolta documenti dal cliente", us: true, diy: false, accountant: false },
  { feature: "Contatto cliente a nome tuo", us: true, diy: false, accountant: false },
  { feature: "Invio telematico ENEA", us: true, diy: true, accountant: true },
  { feature: "Consegna in 24h", us: true, diy: false, accountant: false },
  { feature: "La responsabilità è nostra", us: true, diy: false, accountant: false },
  { feature: "Nessun costo fisso", us: true, diy: true, accountant: false },
  { feature: "Supporto dedicato WhatsApp", us: true, diy: false, accountant: false },
  { feature: "Correzioni gratuite illimitate", us: true, diy: false, accountant: false },
];

function CheckIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsla(var(--pr-green), 0.15)" }}>
      <Check size={14} style={{ color: "hsl(var(--pr-green))" }} />
    </div>
  );
}

function XIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center">
      <X size={14} className="text-destructive" />
    </div>
  );
}

export default function WhyUsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28" style={{ background: "linear-gradient(135deg, hsla(var(--pr-green), 0.04) 0%, hsla(var(--pr-green), 0.01) 100%)" }}>
      <div className="max-w-4xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-12"
        >
          <h2 className="font-extrabold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Noi vs Fai da te vs{" "}
            <span className="text-gradient-green">Commercialista</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Un confronto onesto. Poi decidi tu.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="overflow-x-auto -mx-4 sm:mx-0"
        >
          <div className="min-w-[480px] mx-4 sm:mx-0 bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
            {/* Header */}
            <div className="grid grid-cols-4 gap-0 border-b border-border text-center text-xs sm:text-sm font-bold">
              <div className="p-3 sm:p-4 text-left text-muted-foreground" />
              <div className="p-3 sm:p-4 text-white rounded-t-none" style={{ backgroundColor: "hsl(var(--pr-green))" }}>
                Pratica Rapida
              </div>
              <div className="p-3 sm:p-4 text-foreground bg-muted/50">Fai da te</div>
              <div className="p-3 sm:p-4 text-foreground bg-muted/50">Commercialista</div>
            </div>

            {/* Rows */}
            {comparisons.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-4 gap-0 items-center text-center text-sm ${
                  i < comparisons.length - 1 ? "border-b border-border/50" : ""
                }`}
              >
                <div className="p-3 sm:p-4 text-left text-foreground text-xs sm:text-sm">{row.feature}</div>
                <div className="p-3 sm:p-4 flex justify-center bg-[hsla(var(--pr-green),0.03)]">
                  {row.us ? <CheckIcon /> : <XIcon />}
                </div>
                <div className="p-3 sm:p-4 flex justify-center">
                  {row.diy ? <CheckIcon /> : <XIcon />}
                </div>
                <div className="p-3 sm:p-4 flex justify-center">
                  {row.accountant ? <CheckIcon /> : <XIcon />}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ backgroundColor: "hsl(var(--pr-green))" }}
          >
            Scegli la via semplice <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
