import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Shield, Users, Zap, FileCheck, Leaf } from "lucide-react";

const services = [
  {
    tag: "PRATICHE ENEA",
    title: "Pratiche ENEA",
    subtitle: "Detrazioni fiscali per serramenti, tende, fotovoltaico e caldaie",
    description:
      "Gestiamo tutta la documentazione ENEA per i tuoi lavori di efficienza energetica. Compiliamo, raccogliamo la documentazione dal cliente a tuo nome e trasmettiamo in 48 ore.",
    features: [
      { icon: FileCheck, text: "Compilazione pratica completa" },
      { icon: Users, text: "Raccolta documenti a nome tuo" },
      { icon: Clock, text: "Evasione in 48 ore" },
      { icon: Shield, text: "RC professionale inclusa" },
    ],
    accent: "hsl(152 100% 42%)",
    border: "hsla(152,100%,42%,0.25)",
    tagBg: "hsla(152,100%,42%,0.1)",
    tagColor: "hsl(152 100% 38%)",
    to: "/pratica-enea",
    cta: "Scopri le pratiche ENEA",
  },
  {
    tag: "CONTO TERMICO",
    title: "Conto Termico",
    subtitle: "Contributo GSE per pompe di calore, solare termico e biomassa",
    description:
      "Otteniamo per i tuoi clienti il contributo statale del GSE sugli impianti termici. Gestiamo l'invio al portale GSE e tutto il rapporto con l'ente — tu non tocchi nulla.",
    features: [
      { icon: Leaf, text: "Invio GSE in 72 ore" },
      { icon: Users, text: "Contatto cliente a nome tuo" },
      { icon: Zap, text: "Stima contributo preventiva" },
      { icon: Shield, text: "Zero pratiche respinte" },
    ],
    accent: "hsl(200 90% 42%)",
    border: "hsla(200,90%,42%,0.25)",
    tagBg: "hsla(200,90%,42%,0.1)",
    tagColor: "hsl(200 90% 38%)",
    to: "/conto-termico",
    cta: "Scopri il Conto Termico",
  },
];

export default function ServicesSectionHome() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-card">
      <div className="max-w-5xl mx-auto px-4 lg:px-8">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14"
        >
          <h2 className="font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            Due servizi.{" "}
            <span className="text-gradient-green">Un unico partner.</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            Gestiamo ogni tipo di pratica incentivo per gli installatori — dall'ENEA al Conto Termico.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          {services.map((s, i) => (
            <motion.div
              key={s.tag}
              initial={{ opacity: 0, y: 24 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="bg-background rounded-2xl p-7 sm:p-8 flex flex-col gap-5 border"
              style={{ borderColor: s.border, boxShadow: `0 4px 24px ${s.border}` }}
            >
              {/* Tag */}
              <span
                className="self-start text-xs font-bold tracking-widest px-3 py-1 rounded-full"
                style={{ background: s.tagBg, color: s.tagColor, border: `1px solid ${s.border}` }}
              >
                {s.tag}
              </span>

              {/* Title */}
              <div>
                <h3 className="font-extrabold text-2xl sm:text-3xl text-foreground mb-1.5">{s.title}</h3>
                <p className="text-sm font-medium" style={{ color: s.accent }}>{s.subtitle}</p>
              </div>

              {/* Description */}
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{s.description}</p>

              {/* Features */}
              <ul className="space-y-2.5">
                {s.features.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-sm text-foreground">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ background: s.tagBg }}
                    >
                      <Icon size={13} style={{ color: s.accent }} />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                to={s.to}
                className="inline-flex items-center gap-2 text-sm font-semibold mt-auto pt-2 transition-all hover:gap-3"
                style={{ color: s.accent }}
              >
                {s.cta} <ArrowRight size={15} />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
