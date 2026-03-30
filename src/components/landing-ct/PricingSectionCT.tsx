import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";

const included = [
  "Compilazione pratica Conto Termico completa",
  "Invio sul portale GSE",
  "Raccolta documentazione tecnica dal cliente",
  "Contatto cliente a nome tuo",
  "Assicurazione RC professionale",
  "Evasione in 72 ore",
  "Correzioni gratuite illimitate",
  "Supporto dedicato via WhatsApp",
];

const notIncluded = [
  "Canoni mensili",
  "Costi di attivazione",
  "Vincoli contrattuali",
  "Numero minimo di pratiche",
];

export default function PricingSectionCT() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="prezzi" className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-4xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Un Prezzo. Tutto Incluso.
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>Zero Sorprese.</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Nessun abbonamento. Paghi solo quando la pratica è completata.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border-2 p-6 sm:p-10 bg-card shadow-xl max-w-2xl mx-auto relative"
          style={{ borderColor: "hsl(var(--pr-green))" }}
        >
          <span
            className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-4 py-1 rounded-full"
            style={{ backgroundColor: "hsl(var(--pr-green))" }}
          >
            PREZZO UNICO
          </span>

          <div className="text-center mb-8">
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-bold text-5xl sm:text-6xl text-foreground">250</span>
              <span className="text-2xl text-foreground font-bold">€</span>
            </div>
            <p className="text-muted-foreground mt-1">a pratica completata • IVA esclusa</p>
            <p className="text-sm font-medium mt-2" style={{ color: "hsl(var(--pr-green))" }}>
              Prima pratica? Prova senza impegno.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "hsl(var(--pr-green))" }}>
                Incluso
              </p>
              <ul className="space-y-3">
                {included.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={16} className="shrink-0 mt-0.5" style={{ color: "hsl(var(--pr-green))" }} />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3">Mai</p>
              <ul className="space-y-3">
                {notIncluded.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <X size={16} className="text-destructive shrink-0 mt-0.5" />
                    <span className="text-muted-foreground line-through">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/auth"
              className="inline-flex items-center text-white font-bold px-8 py-3.5 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ backgroundColor: "hsl(var(--pr-green))" }}
            >
              Attiva Gratis — Zero Rischi
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
