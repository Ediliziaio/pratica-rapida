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
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isVisible ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="relative rounded-2xl overflow-hidden aspect-[4/3]"
          >
            <img
              src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80"
              alt="Documenti e burocrazia"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-destructive/20 to-transparent" />
          </motion.div>

          {/* Content */}
          <div>
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
              <p className="text-muted-foreground text-lg mb-8">
                E tu hai risposto: "Quella se la deve fare lei." In quel momento hai perso la vendita.
              </p>
            </motion.div>

            <div className="space-y-4">
              {pains.map((pain, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                  className="bg-destructive/5 border border-destructive/10 rounded-xl p-4 text-left flex items-start gap-3"
                >
                  <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-foreground">"{pain}"</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.8 }}
              className="mt-8 space-y-3"
            >
              <h3 className="font-bold text-2xl text-foreground">
                C'è un modo migliore. Si chiama{" "}
                <span style={{ color: "hsl(var(--pr-green))" }}>Pratica Rapida</span>.
              </h3>
              <ArrowDown className="animate-bounce" size={28} style={{ color: "hsl(var(--pr-green))" }} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
