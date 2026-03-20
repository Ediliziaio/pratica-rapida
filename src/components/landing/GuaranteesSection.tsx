import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Shield, RefreshCw, Headphones, FileCheck } from "lucide-react";

const guarantees = [
  { icon: Shield, title: "Assicurazione RC Inclusa", desc: "Ogni pratica è coperta da polizza RC professionale. Se sbagliamo, paghiamo noi. Senza discussioni." },
  { icon: RefreshCw, title: "Correzione Gratuita Sempre", desc: "Se c'è un errore, lo correggiamo subito e senza costi aggiuntivi. Nessuna eccezione." },
  { icon: Headphones, title: "Supporto Umano Dedicato", desc: "Un numero diretto a cui risponde un essere umano. Nessun bot, nessuna attesa infinita." },
  { icon: FileCheck, title: "Conformità Normativa Garantita", desc: "Ogni documento è compilato secondo le normative vigenti, aggiornate in tempo reale dal nostro team." },
];

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-20 lg:py-28 text-white" style={{ backgroundColor: "hsl(var(--pr-green))" }}>
      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-14"
        >
          Il Tuo Rischio? Zero.
          <br />
          Le Tue Garanzie? Totali.
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {guarantees.map((g, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="bg-white/15 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10"
            >
              <div className="relative w-14 h-14 rounded-full bg-white/25 flex items-center justify-center mx-auto mb-4">
                <g.icon size={26} />
              </div>
              <h3 className="font-bold mb-2 text-lg">{g.title}</h3>
              <p className="text-sm text-white/90 leading-relaxed">{g.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
