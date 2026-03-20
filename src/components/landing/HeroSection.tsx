import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import heroBureaucracy from "@/assets/hero-bureaucracy.png";

const spring = { type: "spring", stiffness: 100, damping: 18 };

const floatingPills = [
  { label: "47 pratiche ✅", x: "-8%", y: "18%", delay: 1.2 },
  { label: "⚡ 48h", x: "92%", y: "35%", delay: 1.5 },
  { label: "32 clienti", x: "85%", y: "75%", delay: 1.8 },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-20 pb-12 bg-background">
      {/* Background image */}
      <div className="absolute right-0 top-0 h-full w-3/4 hidden lg:block pointer-events-none">
        <img
          src={heroBureaucracy}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.07]"
          style={{ mixBlendMode: "multiply" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 relative z-10 w-full">
        {/* Badge with animated gradient border */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.1 }}
          className="mb-8"
        >
          <span className="gradient-border-spin inline-block">
            <span className="inline-block px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase bg-background text-[hsl(var(--pr-green))]">
              Per aziende di serramenti, tende, fotovoltaico e caldaie
            </span>
          </span>
        </motion.div>

        {/* Massive headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="font-display font-bold leading-[0.95] tracking-tight text-foreground mb-10"
          style={{ fontSize: "clamp(2rem, 5.5vw, 4.5rem)" }}
        >
          Pratiche ENEA e detrazioni fiscali
          <br className="hidden sm:block" />
          {" "}per i tuoi clienti —{" "}
          <span className="relative inline-block text-[hsl(var(--pr-green))]">
            le gestiamo noi, a nome tuo, in 48 ore.
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -bottom-1 left-0 w-full h-[3px] rounded-full origin-left"
              style={{ background: "linear-gradient(90deg, hsl(var(--pr-green)), hsl(var(--pr-green-light)))" }}
            />
          </span>
        </motion.h1>

        {/* Two-column: copy + dashboard */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: subtitle + CTA */}
          <div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg mb-8"
            >
              <strong className="text-foreground">Sei un'azienda di serramenti, tende, fotovoltaico o caldaie?</strong>
              <br />
              Da oggi non perdi più tempo con la burocrazia. Noi ci occupiamo di tutto — dalla raccolta dei documenti alla trasmissione finale — mentre tu ti concentri solo sulle vendite.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, ...spring }}
              className="space-y-3"
            >
              <Link
                to="/auth"
                className="group inline-flex items-center gap-3 text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97] bg-[hsl(var(--pr-green))] shadow-[0_4px_24px_hsla(var(--pr-green),0.35)]"
              >
                → Richiedi informazioni gratuite
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <p className="text-xs text-muted-foreground pl-1">
                Nessun impegno · Zero costi nascosti · Risposta entro 24h
              </p>
            </motion.div>
          </div>

          {/* Right: glassmorphism dashboard */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotateY: -8 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ delay: 0.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:block"
            style={{ perspective: "1200px" }}
          >
            <div
              className="rounded-2xl p-6 space-y-4 border border-white/20 shadow-2xl"
              style={{
                background: "hsla(var(--card), 0.7)",
                backdropFilter: "blur(20px) saturate(1.5)",
                transform: "rotateY(-3deg) rotateX(2deg)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-destructive/80" />
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--pr-green))]/80" />
                <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">dashboard.praticarapida.it</span>
              </div>
              {[
                { label: "Pratiche completate questo mese", value: "47 ✅" },
                { label: "Tempo medio evasione", value: "48h" },
                { label: "Clienti contattati a tuo nome", value: "32" },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.9 + i * 0.12, ...spring }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[hsla(var(--pr-green),0.06)] border border-[hsla(var(--pr-green),0.1)]"
                >
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="font-bold text-foreground tabular-nums">{item.value}</span>
                </motion.div>
              ))}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <span className="w-2 h-2 rounded-full animate-pulse bg-[hsl(var(--pr-green))]" />
                Dashboard operativa — aggiornata in tempo reale
              </div>
            </div>

            {/* Floating stat pills */}
            {floatingPills.map((pill) => (
              <motion.div
                key={pill.label}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: pill.delay, type: "spring", stiffness: 200, damping: 15 }}
                className="absolute px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg border border-white/20 animate-float"
                style={{
                  left: pill.x,
                  top: pill.y,
                  background: "hsla(var(--card), 0.85)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {pill.label}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium">Scopri di più</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground/40 animate-bounce" />
      </motion.div>
    </section>
  );
}
