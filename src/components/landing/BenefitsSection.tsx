import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Clock, PhoneCall, ShieldCheck } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    stat: "48h",
    title: "Pratiche evase in 48 ore",
    desc: "Dal momento in cui abbiamo i documenti completi, la pratica viene trasmessa entro 48 ore. Nessun ritardo, nessuna sorpresa.",
  },
  {
    icon: PhoneCall,
    stat: "White label",
    title: "Chiamiamo noi il cliente, a tuo nome",
    desc: "Il tuo cliente sente il nostro team come se fosse il tuo ufficio interno. Tu mantieni la relazione, noi facciamo il lavoro sporco.",
  },
  {
    icon: ShieldCheck,
    stat: "100%",
    title: "Documentazione sempre conforme",
    desc: "Fatture, verbali di posa, documenti per i posatori, cessione del credito: tutto compilato secondo le normative vigenti.",
  },
];

export default function BenefitsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28 bg-card">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            I vantaggi concreti{" "}
            <span style={{ color: "hsl(var(--pr-green))" }}>per la tua azienda</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
              className="bg-background border border-border rounded-2xl p-6 sm:p-8 hover:shadow-lg transition-shadow text-center"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}
              >
                <b.icon size={28} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
              <span className="font-bold text-3xl text-foreground block mb-2">{b.stat}</span>
              <h3 className="font-bold text-lg mb-3 text-foreground">{b.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
