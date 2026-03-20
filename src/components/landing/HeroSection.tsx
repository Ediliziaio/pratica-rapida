import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, ArrowRight, Star } from "lucide-react";

const words = ["Quante", "Vendite", "Stai", "Perdendo", "Perché", "Non", "Gestisci", "le"];
const checks = [
  "Zero canoni mensili",
  "Consegna in 24h",
  "Supporto 100% italiano",
  "Paghi solo a pratica completata",
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" style={{ background: "linear-gradient(135deg, hsl(var(--pr-dark)) 0%, hsl(218 48% 16%) 100%)" }}>
      {/* Floating shapes */}
      <div className="absolute top-20 left-[10%] w-64 h-64 rounded-full animate-float-slow" style={{ background: "hsla(var(--pr-green), 0.06)" }} />
      <div className="absolute top-40 right-[15%] w-48 h-48 rounded-full animate-float-delayed" style={{ background: "hsla(var(--pr-green), 0.04)" }} />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-5 gap-8 lg:gap-12 items-center relative z-10">
        {/* Copy */}
        <div className="lg:col-span-3 space-y-6">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold"
            style={{ backgroundColor: "hsla(var(--pr-green), 0.15)", color: "hsl(var(--pr-green))" }}
          >
            PER AZIENDE DI INFISSI, TENDE, PERGOLE E SERRAMENTI
          </motion.span>

          <h1 className="font-bold text-3xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.05] text-white">
            {words.map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.5 }}
                className="inline-block mr-2 sm:mr-3"
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + words.length * 0.08 }}
              className="inline-block mr-2 sm:mr-3"
              style={{ color: "hsl(var(--pr-green))" }}
            >
              Pratiche ENEA
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + (words.length + 1) * 0.08 }}
              className="inline-block"
            >
              ?
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-base sm:text-lg text-white/60 max-w-xl leading-relaxed"
          >
            Il servizio chiavi in mano che ti permette di offrire le pratiche ENEA ai tuoi clienti a nome tuo, senza fare nulla. A soli <strong className="text-white">65€ a pratica</strong>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4"
          >
            {checks.map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-sm text-white/50">
                <Check size={16} className="shrink-0" style={{ color: "hsl(var(--pr-green))" }} /> {c}
              </span>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="space-y-3"
          >
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-full text-base transition-all animate-pulse-glow hover:brightness-110"
              style={{ backgroundColor: "hsl(var(--pr-green))" }}
            >
              Attiva Gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-white/40">
              Oltre 122 recensioni su Trustpilot • 14+ anni di esperienza • Nessun vincolo
            </p>
          </motion.div>
        </div>

        {/* Dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="lg:col-span-2 hidden lg:block"
        >
          <div className="rounded-2xl shadow-xl border border-white/10 p-6 space-y-4" style={{ backgroundColor: "hsl(var(--pr-dark-card))" }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--pr-green))" }} />
              <div className="w-3 h-3 rounded-full bg-muted" />
            </div>
            {[
              { label: "Pratiche completate questo mese", value: "47 ✅" },
              { label: "Costo per pratica", value: "€65" },
              { label: "Tempo medio consegna", value: "24h" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "hsla(var(--pr-green), 0.08)" }}>
                <span className="text-sm text-white/50">{item.label}</span>
                <span className="font-bold text-white">{item.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "hsl(var(--pr-green))" }} />
              Dashboard operativa — aggiornata in tempo reale
            </div>
          </div>

          {/* Trustpilot badge floating */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
            className="mt-4 flex items-center justify-center gap-2 text-white/40 text-sm"
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4" style={{ fill: "hsl(var(--pr-green))", color: "hsl(var(--pr-green))" }} />
              ))}
            </div>
            <span>4.9/5 su Trustpilot</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
