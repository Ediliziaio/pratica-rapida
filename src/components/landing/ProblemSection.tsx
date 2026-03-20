import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { AlertTriangle, ArrowDown } from "lucide-react";

const pains = [
  "Il cliente ti chiede della pratica ENEA e tu lo mandi dal commercialista",
  "Perdi vendite perché il concorrente offre il servizio completo",
  "Sprechi ore a raccogliere documenti catastali e certificazioni",
  "I clienti ti richiamano per sapere a che punto è la pratica",
  "Hai paura di sbagliare compilazione e ricevere sanzioni",
  "Non hai tempo né risorse per formare il personale su ENEA",
];

export default function ProblemSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="vantaggi" className="py-20 lg:py-28 bg-card">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Quante volte il cliente ti ha chiesto:
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>"E per la pratica ENEA?"</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-12">
            E tu hai risposto: "Quella se la deve fare lei." In quel momento hai perso la vendita.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
              className="bg-destructive/5 border border-destructive/10 rounded-2xl p-6 text-left hover:-translate-y-1 transition-transform duration-300"
            >
              <AlertTriangle size={20} className="text-destructive mb-3" />
              <p className="text-sm font-medium text-foreground">"{pain}"</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 1 }}
          className="mt-16 space-y-4"
        >
          <h3 className="font-bold text-2xl text-foreground">
            C'è un modo migliore. Si chiama{" "}
            <span style={{ color: "hsl(var(--pr-green))" }}>Pratica Rapida</span>.
          </h3>
          <ArrowDown className="mx-auto animate-bounce" size={28} style={{ color: "hsl(var(--pr-green))" }} />
        </motion.div>
      </div>
    </section>
  );
}
