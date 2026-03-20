import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";

export default function SolutionSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      id="soluzione"
      className="py-16 sm:py-20 lg:py-28"
      style={{ background: "linear-gradient(135deg, hsla(var(--pr-green), 0.06) 0%, hsla(var(--pr-green), 0.02) 100%)" }}
    >
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <motion.span
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6"
              style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
            >
              Il Tuo Partner N°1 per le Detrazioni Fiscali
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              className="font-bold text-2xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6 text-foreground"
            >
              Le Pratiche ENEA dei Tuoi Clienti?
              <br />
              <span style={{ color: "hsl(var(--pr-green))" }}>Ci Pensiamo Noi. A Nome Tuo.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground text-base sm:text-lg max-w-xl mb-8 leading-relaxed"
            >
              Pratica Rapida è il primo servizio in Italia pensato esclusivamente per aziende di serramenti, 
              tende da sole, pergole e fotovoltaico. Con <strong className="text-foreground">14+ anni di esperienza</strong> nel settore 
              e oltre <strong className="text-foreground">122 recensioni positive</strong> su Trustpilot, gestiamo le pratiche ENEA 
              dei tuoi clienti in modo completamente trasparente.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-3 gap-4"
            >
              {[
                { num: "14+", label: "Anni di esperienza" },
                { num: "122+", label: "Recensioni Trustpilot" },
                { num: "65€", label: "Prezzo fisso a pratica" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card rounded-2xl border border-border p-4 shadow-sm text-center">
                  <div className="font-bold text-2xl sm:text-3xl mb-1" style={{ color: "hsl(var(--pr-green))" }}>{stat.num}</div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isVisible ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="relative rounded-2xl overflow-hidden aspect-[4/3]"
          >
            <img
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80"
              alt="Team professionale al lavoro"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[hsla(var(--pr-green),0.15)] to-transparent" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
