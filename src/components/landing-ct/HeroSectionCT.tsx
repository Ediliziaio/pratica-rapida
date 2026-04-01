import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Star, Check, Phone, ChevronDown } from "lucide-react";
import NewsWidget from "../landing/NewsWidget";

const socialProofAvatars = [
  { initials: "MR", bg: "bg-[hsl(var(--pr-green))]" },
  { initials: "LB", bg: "bg-primary" },
  { initials: "AG", bg: "bg-[hsl(var(--warning))]" },
  { initials: "FS", bg: "bg-[hsl(var(--destructive))]" },
];

const checkpoints = [
  "Raccogliamo tutta la documentazione tecnica richiesta dal GSE",
  "Inviamo la pratica entro i 90 giorni dalla fine lavori",
  "Il tuo cliente riceve il contributo direttamente",
];

export default function HeroSectionCT() {
  return (
    <section
      className="relative min-h-[90vh] flex items-center overflow-hidden pt-20 pb-12"
      style={{ background: "hsl(var(--pr-dark))" }}
    >
      {/* Background mesh / orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-60 -right-60 w-[700px] h-[700px] rounded-full animate-aurora"
          style={{ background: "radial-gradient(circle, hsla(152,100%,30%,0.28) 0%, transparent 65%)" }}
        />
        <div
          className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full animate-aurora-alt"
          style={{ background: "radial-gradient(circle, hsla(152,100%,24%,0.18) 0%, transparent 65%)" }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full animate-aurora"
          style={{ background: "radial-gradient(circle, hsla(152,100%,40%,0.08) 0%, transparent 70%)", animationDelay: "6s" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)" }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-5 gap-8 lg:gap-12 items-center relative z-10 w-full">
        {/* Copy */}
        <div className="lg:col-span-3 space-y-5">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold leading-snug"
            style={{
              background: "hsla(152,100%,45%,0.12)",
              color: "hsl(152 100% 65%)",
              border: "1px solid hsla(152,100%,45%,0.25)",
            }}
          >
            PER INSTALLATORI DI CALDAIE, POMPE DI CALORE E SOLARE TERMICO
          </motion.span>

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
                  className={`w-8 h-8 rounded-full ${a.bg} flex items-center justify-center text-[10px] font-bold text-white`}
                  style={{ border: "2px solid hsl(var(--pr-dark))" }}
                >
                  {a.initials}
                </div>
              ))}
            </div>
            <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
              80+ installatori ci affidano le pratiche
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="font-extrabold text-3xl sm:text-4xl lg:text-5xl xl:text-[3.6rem] leading-[1.08] text-white"
          >
            Pratiche Conto Termico per i tuoi clienti —{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 68%) 0%, hsl(152 100% 50%) 100%)" }}
            >
              le gestiamo noi, senza errori, in 72 ore.
            </span>
          </motion.h1>

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
                className="flex items-center gap-2.5 text-sm sm:text-base"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "hsla(152,100%,45%,0.2)" }}
                >
                  <Check className="w-3 h-3" style={{ color: "hsl(152 100% 65%)" }} />
                </span>
                {text}
              </motion.li>
            ))}
          </motion.ul>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="space-y-3 pt-1"
          >
            <Link
              to="/auth"
              className="flex sm:inline-flex items-center justify-center gap-2 text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "hsl(var(--pr-green))",
                boxShadow: "0 0 40px hsla(152,100%,30%,0.5), 0 4px 20px hsla(152,100%,24%,0.4)",
              }}
            >
              Inizia Gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                Nessun impegno • Zero costi nascosti
              </p>
              <a
                href="tel:+390398682691"
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                style={{ color: "hsl(152 100% 65%)" }}
              >
                <Phone className="w-3 h-3" />
                +39 039 868 2691
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="flex items-center gap-2 text-sm pt-1 lg:hidden"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4" style={{ fill: "hsl(152 100% 55%)", color: "hsl(152 100% 55%)" }} />
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
          className="lg:col-span-2"
        >
          <NewsWidget />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
            className="mt-4 flex items-center justify-center gap-2 text-sm"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4" style={{ fill: "hsl(152 100% 55%)", color: "hsl(152 100% 55%)" }} />
              ))}
            </div>
            <span>4.9/5 su Trustpilot</span>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-1"
      >
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Scopri di più</span>
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <ChevronDown className="w-5 h-5" style={{ color: "rgba(255,255,255,0.2)" }} />
        </motion.div>
      </motion.div>
    </section>
  );
}
