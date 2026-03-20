import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { DoorOpen, Sun, Blinds, Flame, GlassWater } from "lucide-react";

const sectors = [
  { icon: DoorOpen, label: "Serramenti", img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&q=80" },
  { icon: Sun, label: "Fotovoltaico", img: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=80" },
  { icon: Blinds, label: "Tende da sole e schermature solari", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80" },
  { icon: Flame, label: "Caldaie e climatizzatori", img: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80" },
  { icon: GlassWater, label: "Vetrate e infissi", img: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80" },
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
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Lavori con uno di questi settori?{" "}
            <span style={{ color: "hsl(var(--pr-green))" }}>Sei nel posto giusto.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
          {sectors.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="bg-card border border-border rounded-2xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 group"
            >
              <div className="relative h-32 overflow-hidden">
                <img
                  src={s.img}
                  alt={s.label}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
              </div>
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "hsla(var(--pr-green), 0.1)" }}>
                  <s.icon size={18} style={{ color: "hsl(var(--pr-green))" }} />
                </div>
                <p className="text-sm font-medium text-foreground text-left">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
