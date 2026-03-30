import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { UserPlus, Phone, Rocket, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    num: "01",
    icon: UserPlus,
    title: "REGISTRATI GRATIS",
    desc: "Accedi alla tua area riservata e inserisci il numero del tuo cliente. Questo è TUTTO quello che devi fare. Non un documento, non una email. Solo un numero di telefono.",
    badge: "2 minuti",
    badgeIcon: "⚡",
  },
  {
    num: "02",
    icon: Phone,
    title: "NOI CONTATTIAMO IL CLIENTE A NOME TUO",
    desc: "Il nostro team chiama il tuo cliente presentandosi come parte della tua azienda. Raccogliamo tutti i documenti: dati catastali, fatture, certificazioni.",
    badge: "A nome tuo",
    badgeIcon: "🤝",
  },
  {
    num: "03",
    icon: Rocket,
    title: "IN 24H LA PRATICA È PRONTA",
    desc: "Entro 24 ore, sia tu che il tuo cliente ricevete la Pratica ENEA completa e pronta. Nessun ritardo. Nessun sollecito. Fatto.",
    badge: "Consegna garantita",
    badgeIcon: "🚀",
  },
];

export default function ProcessSteps() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="come-funziona" className="py-16 sm:py-20 lg:py-28" style={{ background: "linear-gradient(135deg, hsla(var(--pr-green), 0.06) 0%, hsla(var(--pr-green), 0.02) 100%)" }}>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Attivo in 3 Passi.
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>Imbarazzantemente Semplice.</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg mb-12 sm:mb-16">
            Tre passi e la burocrazia non è più un tuo problema.
          </p>
        </motion.div>

        <div className="relative max-w-3xl mx-auto">
          {/* Vertical line */}
          <div className="absolute left-6 lg:left-1/2 lg:-translate-x-0.5 top-0 bottom-0 w-1 rounded-full overflow-hidden bg-border">
            {isVisible && (
              <div className="w-full rounded-full animate-grow-line" style={{ backgroundColor: "hsl(var(--pr-green))" }} />
            )}
          </div>

          {steps.map((step, i) => {
            const isLeft = i % 2 === 0;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.25 }}
                className={`relative flex items-start gap-4 sm:gap-6 mb-12 sm:mb-16 last:mb-0 pl-14 sm:pl-16 lg:pl-0 ${
                  isLeft ? "lg:pr-[calc(50%+2rem)] lg:text-right" : "lg:pl-[calc(50%+2rem)] lg:text-left"
                }`}
              >
                <div
                  className="absolute z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full text-white flex items-center justify-center shadow-lg font-bold text-xs sm:text-sm left-0 lg:left-1/2 lg:-translate-x-1/2"
                  style={{ backgroundColor: "hsl(var(--pr-green))" }}
                >
                  {step.num}
                </div>

                <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 shadow-sm flex-1">
                  <div className="flex items-center gap-2 mb-2" style={{ justifyContent: isLeft ? "flex-end" : "flex-start" }}>
                    <step.icon size={18} style={{ color: "hsl(var(--pr-green))" }} />
                    <span className="text-xs font-bold tracking-wider" style={{ color: "hsl(var(--pr-green))" }}>{step.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.desc}</p>
                  <span
                    className="inline-block text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
                  >
                    {step.badgeIcon} {step.badge}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA after steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.2 }}
          className="mt-12"
        >
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ backgroundColor: "hsl(var(--pr-green))" }}
          >
            Inizia ora — registrati in 2 minuti <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
