import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { Clock, ShieldCheck, BadgeEuro } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    stat: "72h",
    title: "Pratica inviata al GSE in 72 ore",
    desc: "Dal momento in cui abbiamo la documentazione completa, la pratica viene trasmessa entro 72 ore. Sempre entro la scadenza dei 90 giorni.",
    gradient: "linear-gradient(135deg, hsla(152,100%,30%,0.3) 0%, hsla(152,100%,20%,0.1) 100%)",
    iconGlow: "hsla(152,100%,40%,0.4)",
  },
  {
    icon: BadgeEuro,
    stat: "0 rifiuti",
    title: "Zero pratiche respinte dal GSE",
    desc: "Conosciamo ogni requisito tecnico del GSE. La documentazione è sempre completa e conforme: il contributo arriva sempre.",
    gradient: "linear-gradient(135deg, hsla(220,80%,40%,0.25) 0%, hsla(220,80%,20%,0.1) 100%)",
    iconGlow: "hsla(220,80%,60%,0.4)",
  },
  {
    icon: ShieldCheck,
    stat: "A tuo nome",
    title: "Gestiamo tutto con il GSE per te",
    desc: "Chiamate, documentazione, caricamento sul portale GSE: il tuo cliente non sa che ci siamo noi. Tu mantieni il rapporto.",
    gradient: "linear-gradient(135deg, hsla(38,92%,50%,0.2) 0%, hsla(38,92%,30%,0.05) 100%)",
    iconGlow: "hsla(38,92%,50%,0.4)",
  },
];

const iconColors = [
  "hsl(152 100% 60%)",
  "hsl(220 80% 70%)",
  "hsl(38 92% 60%)",
];

export default function BenefitsSectionCT() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 sm:py-20 lg:py-28" style={{ background: "hsl(var(--pr-dark))" }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div className="max-w-6xl mx-auto px-4 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-16"
        >
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-5"
            style={{ background: "hsla(152,100%,45%,0.12)", color: "hsl(152 100% 65%)", border: "1px solid hsla(152,100%,45%,0.25)" }}
          >
            Vantaggi concreti
          </span>
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-white">
            I vantaggi concreti{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 68%) 0%, hsl(152 100% 50%) 100%)" }}>
              per la tua attività
            </span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
              className="rounded-2xl p-6 sm:p-8 text-center group transition-all duration-300 hover:-translate-y-1"
              style={{ background: b.gradient, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:scale-110"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: `0 0 24px ${b.iconGlow}` }}
              >
                <b.icon size={26} style={{ color: iconColors[i] }} />
              </div>
              <span
                className="font-bold text-4xl block mb-2 bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${iconColors[i]} 0%, white 100%)` }}
              >
                {b.stat}
              </span>
              <h3 className="font-bold text-base sm:text-lg mb-3 text-white">{b.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
