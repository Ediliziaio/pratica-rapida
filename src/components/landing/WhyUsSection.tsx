import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Building2, Globe, Headphones } from "lucide-react";

const reasons = [
  {
    icon: Building2,
    title: "Diventiamo il tuo ufficio pratiche",
    desc: "Il nostro team contatta i clienti a tuo nome, raccoglie i documenti, gestisce le eccezioni. Per il cliente finale siamo trasparenti: è come avere un ufficio interno dedicato, senza i costi di uno.",
  },
  {
    icon: Globe,
    title: "Tutto online, nessuna presenza fisica",
    desc: "Non servono spostamenti, appuntamenti o spedizioni cartacee. L'intero processo è digitale, tracciabile, accessibile.",
  },
  {
    icon: Headphones,
    title: "Un numero dedicato per ogni esigenza",
    desc: "Il tuo cliente ha un numero diretto a cui risponde un essere umano. Nessun bot, nessuna attesa infinita, nessuna situazione lasciata senza risposta.",
  },
];

export default function WhyUsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-12"
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Perché scegliere Pratica Rapida e non farlo da soli
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>(o affidarsi a un commercialista)?</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {reasons.map((r, i) => (
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
                <r.icon size={28} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-foreground">{r.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{r.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
