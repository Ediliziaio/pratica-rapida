import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { Upload, PhoneCall, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Inserisci i dati del tuo cliente",
    description: "Dal pannello operativo inserisci nome, tipo di impianto e recapito del cliente. Ci vuole meno di due minuti.",
    accent: "hsl(152 100% 55%)",
    glow: "hsla(152,100%,35%,0.25)",
  },
  {
    icon: PhoneCall,
    number: "02",
    title: "Noi raccogliamo tutto a tuo nome",
    description: "Chiamiamo il tuo cliente presentandoci come il tuo ufficio pratiche. Raccogliamo ogni documento necessario senza disturbarti.",
    accent: "hsl(200 100% 60%)",
    glow: "hsla(200,100%,35%,0.20)",
  },
  {
    icon: CheckCircle2,
    number: "03",
    title: "Pratica inviata, tu incassi",
    description: "Trasmettiamo la pratica all'ENEA o al GSE in 48–72 ore. Ricevi notifica quando è completata e il tuo cliente ottiene l'incentivo.",
    accent: "hsl(152 100% 55%)",
    glow: "hsla(152,100%,35%,0.25)",
  },
];

export default function HowItWorksSectionHome() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-background">
      <div className="max-w-5xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14"
        >
          <h2 className="font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Come funziona.{" "}
            <span className="text-gradient-green">In tre passi.</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            Niente formazione, niente burocrazia. Sei operativo il giorno stesso.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-[52px] left-[16.7%] right-[16.7%] h-px" style={{ background: "linear-gradient(90deg, hsl(152 100% 55%) 0%, hsl(200 100% 60%) 50%, hsl(152 100% 55%) 100%)", opacity: 0.25 }} />

          <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 24 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center text-center gap-4"
                >
                  {/* Icon circle */}
                  <div
                    className="relative w-[104px] h-[104px] rounded-full flex items-center justify-center"
                    style={{ background: `radial-gradient(circle, ${step.glow} 0%, transparent 70%)`, border: `1px solid ${step.accent}30` }}
                  >
                    <Icon size={36} style={{ color: step.accent }} strokeWidth={1.5} />
                    <span
                      className="absolute -top-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black"
                      style={{ background: step.accent, color: "hsl(var(--pr-dark))" }}
                    >
                      {step.number}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg sm:text-xl text-foreground mb-2">{step.title}</h3>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
