import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Shield, Clock, Lock, Award } from "lucide-react";

const badges = [
  { icon: Award, title: "14+ Anni di Esperienza", desc: "Dal 2010 gestiamo pratiche ENEA per centinaia di aziende in tutta Italia." },
  { icon: Shield, title: "La Responsabilità è Nostra", desc: "La responsabilità è nostra. Se sbagliamo, paghiamo noi. Zero rischi per te." },
  { icon: Lock, title: "GDPR Compliant", desc: "I dati dei tuoi clienti sono protetti con i più alti standard di sicurezza." },
  { icon: Clock, title: "Consegna Garantita 24h", desc: "Dalla raccolta documenti alla pratica completa: massimo 24 ore lavorative." },
];

export default function TrustSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isVisible ? { opacity: 1, x: 0 } : {}}
            className="relative rounded-2xl overflow-hidden aspect-[4/3]"
          >
            <img
              src="https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80"
              alt="Stretta di mano professionale"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
          </motion.div>

          {/* Badges */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              className="mb-8"
            >
              <span
                className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4"
                style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
              >
                ✅ Perché Fidarsi di Noi
              </span>
              <h2 className="font-bold text-2xl sm:text-4xl lg:text-5xl leading-[1.1] text-foreground">
                Garanzie
                <br />
                <span style={{ color: "hsl(var(--pr-green))" }}>Concrete.</span>
              </h2>
            </motion.div>

            <div className="space-y-4">
              {badges.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-4 bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}
                  >
                    <b.icon size={22} style={{ color: "hsl(var(--pr-green))" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{b.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
