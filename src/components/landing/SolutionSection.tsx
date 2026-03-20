import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { ArrowRight, Settings } from "lucide-react";
import { Link } from "react-router-dom";

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
              Chi Siamo
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              className="font-bold text-2xl sm:text-4xl lg:text-5xl leading-[1.1] mb-6 text-foreground"
            >
              Il tuo team pratiche in outsourcing —{" "}
              <span style={{ color: "hsl(var(--pr-green))" }}>senza costi fissi, senza assunzioni.</span>
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.3 }}
              className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed"
            >
              <p>
                Pratica Rapida gestisce dal 2011 le pratiche per detrazioni fiscali per conto di aziende di serramenti, schermature solari, tende, vetrate, fotovoltaico e caldaie.
              </p>

              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Settings size={18} style={{ color: "hsl(var(--pr-green))" }} />
                <span>Come funziona?</span>
              </div>

              <p>
                Semplice: chiamiamo i tuoi clienti a nome della tua azienda, raccogliamo tutta la documentazione necessaria e trasmettiamo la pratica entro 48 ore dal completamento del fascicolo. Tu e il tuo cliente ricevete l'esito direttamente.
              </p>
              <p className="font-medium text-foreground">
                Niente intermediari. Niente stress. Niente pratiche ferme in attesa.
              </p>
            </motion.div>

            {/* Mini CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="mt-6"
            >
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full transition-all hover:brightness-110 active:scale-[0.97] text-white"
                style={{ backgroundColor: "hsl(var(--pr-green))" }}
              >
                Provalo gratis — zero impegno <ArrowRight size={16} />
              </Link>
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
