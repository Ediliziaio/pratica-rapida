import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { FileText, Send, FolderOpen, Phone, Shield, Zap } from "lucide-react";

const services = [
  { icon: FileText, title: "Compilazione Pratica ENEA", desc: "Compiliamo la pratica ENEA in modo accurato e conforme alle ultime normative (65%, 50%, bonus casa). Zero errori." },
  { icon: Send, title: "Invio Telematico", desc: "Inviamo la pratica direttamente al portale ENEA. Tu e il cliente ricevete conferma di avvenuta trasmissione." },
  { icon: FolderOpen, title: "Raccolta Documenti", desc: "Raccogliamo noi tutti i documenti necessari: dati catastali, fatture, certificazioni. Il cliente non deve fare nulla." },
  { icon: Phone, title: "Contatto Cliente a Nome Tuo", desc: "Chiamiamo il tuo cliente presentandoci come il tuo ufficio tecnico. Nessuna confusione, massima professionalità." },
  { icon: Shield, title: "La Responsabilità è Nostra", desc: "La responsabilità è nostra. Se sbagliamo, paghiamo noi. Sempre." },
  { icon: Zap, title: "Consegna in 24h", desc: "Entro 24 ore dalla raccolta documenti, la pratica è completata e consegnata a te e al tuo cliente." },
];

export default function ServicesGrid() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="servizi" className="py-20 lg:py-28 bg-card">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14"
        >
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Tutto incluso nei{" "}
            <span style={{ color: "hsl(var(--pr-green))" }}>65€ a pratica</span>.
          </h2>
          <p className="text-muted-foreground text-lg">
            Nessun canone, nessun costo nascosto. Paghi solo a lavoro completato.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {services.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="bg-background border border-border rounded-2xl p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}>
                <s.icon size={26} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
              <h3 className="font-bold text-lg mb-2 text-foreground group-hover:text-[hsl(var(--pr-green))] transition-colors">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
