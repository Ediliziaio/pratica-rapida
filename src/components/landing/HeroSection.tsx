import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Star, Check, Phone, ChevronDown } from "lucide-react";
import heroBureaucracy from "@/assets/hero-bureaucracy.png";

const socialProofAvatars = [
  { initials: "MR", bg: "bg-[hsl(var(--pr-green))]" },
  { initials: "LB", bg: "bg-primary" },
  { initials: "AG", bg: "bg-[hsl(var(--warning))]" },
  { initials: "FS", bg: "bg-[hsl(var(--destructive))]" },
];

const checkpoints = [
  "Raccogliamo i documenti al posto tuo",
  "Trasmettiamo la pratica in 48h",
  "Tu ti concentri solo sulle vendite",
];

export default function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-20 pb-12 bg-background">
      {/* Bureaucracy image faded on the right */}
      <div className="absolute right-0 top-0 h-full w-2/3 hidden lg:block">
        <img
          src={heroBureaucracy}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.6]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
      </div>

      {/* Floating shapes */}
      <div className="absolute top-20 left-[10%] w-64 h-64 rounded-full bg-[hsla(var(--pr-green),0.06)]" />
      <div className="absolute top-40 right-[15%] w-48 h-48 rounded-full bg-[hsla(var(--pr-green),0.04)]" />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-5 gap-8 lg:gap-12 items-center relative z-10">
        {/* Copy */}
        <div className="lg:col-span-3 space-y-5">
          {/* Target badge */}
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[hsla(var(--pr-green),0.12)] text-[hsl(var(--pr-green))]"
          >
            PER AZIENDE DI SERRAMENTI, TENDE, FOTOVOLTAICO E CALDAIE
          </motion.span>

          {/* Social proof - avatar stack */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3"
          >
            <div className="flex -space-x-2.5">
              {socialProofAvatars.map((a, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full ${a.bg} border-2 border-background flex items-center justify-center text-[10px] font-bold text-white`}
                >
                  {a.initials}
                </div>
              ))}
            </div>
            <span className="text-sm text-muted-foreground font-medium">
              120+ aziende ci affidano le pratiche
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="font-bold text-3xl sm:text-4xl lg:text-5xl xl:text-[3.4rem] leading-[1.1] text-foreground"
          >
            Pratiche ENEA e detrazioni fiscali per i tuoi clienti —{" "}
            <span className="text-[hsl(var(--pr-green))]">
              le gestiamo noi, a nome tuo, in 48 ore.
            </span>
          </motion.h1>

          {/* Checkpoints */}
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-2"
          >
            {checkpoints.map((text, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 + i * 0.1 }}
                className="flex items-center gap-2.5 text-sm sm:text-base text-muted-foreground"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[hsla(var(--pr-green),0.15)] flex items-center justify-center">
                  <Check className="w-3 h-3 text-[hsl(var(--pr-green))]" />
                </span>
                {text}
              </motion.li>
            ))}
          </motion.ul>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="space-y-3 pt-1"
          >
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 text-white font-semibold px-10 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97] bg-[hsl(var(--pr-green))] shadow-[0_4px_20px_hsla(var(--pr-green),0.3)]"
            >
              → Richiedi informazioni gratuite <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-xs text-muted-foreground">
                Nessun impegno • Zero costi nascosti
              </p>
              <a
                href="tel:+390398682691"
                className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--pr-green))] font-medium hover:underline"
              >
                <Phone className="w-3 h-3" />
                +39 039 868 2691
              </a>
            </div>
          </motion.div>

          {/* Trustpilot - visible on mobile too */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="flex items-center gap-2 text-muted-foreground text-sm pt-1 lg:hidden"
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-[hsl(var(--pr-green))] text-[hsl(var(--pr-green))]" />
              ))}
            </div>
            <span>4.9/5 su Trustpilot</span>
          </motion.div>
        </div>

        {/* Dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="lg:col-span-2 hidden lg:block"
        >
          <div className="rounded-2xl shadow-2xl border border-border/60 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive/80" />
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--pr-green))]/80" />
              <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
            </div>
            {[
              { label: "Pratiche completate questo mese", value: "47 ✅" },
              { label: "Tempo medio evasione", value: "48h" },
              { label: "Clienti contattati a tuo nome", value: "32" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3.5 rounded-xl bg-[hsla(var(--pr-green),0.06)] border border-[hsla(var(--pr-green),0.1)]">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="font-bold text-foreground">{item.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full animate-pulse bg-[hsl(var(--pr-green))]" />
              Dashboard operativa — aggiornata in tempo reale
            </div>
          </div>

          {/* Trustpilot badge - desktop */}
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

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-1"
      >
        <span className="text-xs text-muted-foreground/60">Scopri di più</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}
