import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Shield, CreditCard, Zap, RefreshCw } from "lucide-react";

const guarantees = [
  { icon: Shield, title: "Assicurazione RC Inclusa", desc: "Ogni pratica è coperta da polizza RC professionale. Se sbagliamo, paghiamo noi." },
  { icon: CreditCard, title: "Zero Canoni Fissi", desc: "Nessun abbonamento. Paghi solo 65€ a pratica completata. Nessun costo nascosto." },
  { icon: Zap, title: "Consegna in 24 Ore", desc: "Dalla raccolta documenti alla consegna: 24 ore lavorative. Garantito." },
  { icon: RefreshCw, title: "Correzione Gratuita", desc: "Se c'è un errore, lo correggiamo subito e senza costi aggiuntivi. Sempre." },
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
              className="bg-white/10 rounded-2xl p-6 text-center"
            >
              <div className="relative w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <g.icon size={24} />
              </div>
              <h3 className="font-bold mb-2">{g.title}</h3>
              <p className="text-sm text-white/80 leading-relaxed">{g.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
