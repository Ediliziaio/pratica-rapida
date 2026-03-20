import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import heroBureaucracy from "@/assets/hero-bureaucracy.png";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16 bg-background">
      {/* Bureaucracy image faded on the right */}
      <div className="absolute right-0 top-0 h-full w-2/3 hidden lg:block">
        <img
          src={heroBureaucracy}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40" />
      </div>

      {/* Floating shapes */}
      <div className="absolute top-20 left-[10%] w-64 h-64 rounded-full bg-[hsla(var(--pr-green),0.08)]" />
      <div className="absolute top-40 right-[15%] w-48 h-48 rounded-full bg-[hsla(var(--pr-green),0.06)]" />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-5 gap-8 lg:gap-12 items-center relative z-10">
        {/* Copy */}
        <div className="lg:col-span-3 space-y-6">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[hsla(var(--pr-green),0.12)] text-[hsl(var(--pr-green))]"
          >
            PER AZIENDE DI SERRAMENTI, TENDE, FOTOVOLTAICO E CALDAIE
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="font-bold text-3xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.05] text-foreground"
          >
            Pratiche ENEA e detrazioni fiscali per i tuoi clienti —{" "}
            <span className="text-[hsl(var(--pr-green))]">
              le gestiamo noi, a nome tuo, in 48 ore.
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-4"
          >
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              <strong className="text-foreground">Sei un'azienda di serramenti, tende, fotovoltaico o caldaie?</strong>
              <br />
              Da oggi non perdi più tempo con la burocrazia. Noi ci occupiamo di tutto — dalla raccolta dei documenti alla trasmissione finale — mentre tu ti concentri solo sulle vendite.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="space-y-3"
          >
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-full text-base transition-all animate-pulse-glow hover:brightness-110 bg-[hsl(var(--pr-green))]"
            >
              → Richiedi informazioni gratuite <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-muted-foreground">
              Nessun impegno • Zero costi nascosti • Risposta entro 24h
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
          <div className="rounded-2xl shadow-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--pr-green))]" />
              <div className="w-3 h-3 rounded-full bg-muted" />
            </div>
            {[
              { label: "Pratiche completate questo mese", value: "47 ✅" },
              { label: "Tempo medio evasione", value: "48h" },
              { label: "Clienti contattati a tuo nome", value: "32" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-[hsla(var(--pr-green),0.08)]">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="font-bold text-foreground">{item.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full animate-pulse bg-[hsl(var(--pr-green))]" />
              Dashboard operativa — aggiornata in tempo reale
            </div>
          </div>

          {/* Trustpilot badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
            className="mt-4 flex items-center justify-center gap-2 text-muted-foreground text-sm"
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-[hsl(var(--pr-green))] text-[hsl(var(--pr-green))]" />
              ))}
            </div>
            <span>4.9/5 su Trustpilot</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
