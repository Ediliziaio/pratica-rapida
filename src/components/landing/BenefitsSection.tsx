import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Clock, PhoneCall, ShieldCheck } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Pratiche evase in 48 ore",
    desc: "Dal momento in cui abbiamo i documenti completi, la pratica viene trasmessa entro 48 ore. Nessun ritardo, nessuna sorpresa.",
  },
  {
    icon: PhoneCall,
    title: "Chiamiamo noi il cliente, a tuo nome",
    desc: "Il tuo cliente sente il nostro team come se fosse il tuo ufficio interno. Tu mantieni la relazione, noi facciamo il lavoro sporco.",
  },
  {
    icon: ShieldCheck,
    title: "Documentazione sempre conforme",
    desc: "Fatture, verbali di posa, documenti per i posatori, cessione del credito: tutto compilato secondo le normative vigenti, aggiornate in tempo reale. Errori formali? Pratiche respinte? Non con noi.",
  },
];

export default function BenefitsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
              className="bg-card border border-border rounded-2xl p-6 sm:p-8 hover:shadow-lg transition-shadow"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}
              >
                <b.icon size={28} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-foreground">{b.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
