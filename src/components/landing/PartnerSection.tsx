import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { DoorOpen, Sun, Blinds, Flame, GlassWater, SunDim } from "lucide-react";

const sectors = [
  { icon: DoorOpen, label: "Serramenti e Infissi" },
  { icon: Sun, label: "Fotovoltaico" },
  { icon: Blinds, label: "Tende da Sole" },
  { icon: Flame, label: "Caldaie e Pompe di Calore" },
  { icon: GlassWater, label: "Vetrate Panoramiche" },
  { icon: SunDim, label: "Schermature Solari" },
];

export default function PartnerSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-background">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="mb-14"
        >
          <span
            className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
            style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
          >
            🤝 PER CHI È PRATICA RAPIDA
          </span>
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Collaboriamo con aziende di:
          </h2>
          <p className="text-muted-foreground text-lg">
            Il servizio è pensato per tutti i settori che richiedono pratiche ENEA.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {sectors.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 text-center hover:-translate-y-1 transition-transform duration-300"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}>
                <s.icon size={24} style={{ color: "hsl(var(--pr-green))" }} />
              </div>
              <p className="text-sm font-medium text-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
