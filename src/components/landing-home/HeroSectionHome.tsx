import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Star, ChevronDown } from "lucide-react";
import NewsWidget from "../landing/NewsWidget";

export default function HeroSectionHome() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden pt-20 pb-16"
      style={{ background: "hsl(var(--pr-dark))" }}
    >
      {/* BG */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 -right-60 w-[700px] h-[700px] rounded-full animate-aurora"
          style={{ background: "radial-gradient(circle, hsla(152,100%,30%,0.25) 0%, transparent 65%)" }} />
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full animate-aurora-alt"
          style={{ background: "radial-gradient(circle, hsla(200,100%,28%,0.16) 0%, transparent 65%)" }} />
        <div className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10 w-full">

        {/* Left: Copy */}
        <div className="space-y-8">
          {/* Trustpilot */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5" style={{ fill: "hsl(152 100% 55%)", color: "hsl(152 100% 55%)" }} />)}
            </div>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>4.9/5 · 122+ recensioni</span>
          </motion.div>

          {/* Headline */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.65 }}>
            <h1 className="font-extrabold text-4xl sm:text-5xl lg:text-6xl xl:text-[4rem] leading-[1.06] text-white">
              Installa.{" "}
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Vendi.</span>
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 68%) 0%, hsl(200 100% 62%) 100%)" }}
              >
                Le pratiche
                <br />
                le gestiamo noi.
              </span>
            </h1>
          </motion.div>

          {/* Sub */}
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-lg leading-relaxed max-w-lg"
            style={{ color: "rgba(255,255,255,0.55)" }}>
            Pratiche ENEA e Conto Termico per i tuoi clienti — raccolte, compilate e inviate a tuo nome.
            Tu installi. Noi facciamo il resto.
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/pratica-enea"
              className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "hsl(var(--pr-green))", boxShadow: "0 0 32px hsla(152,100%,30%,0.5)" }}
            >
              Pratiche ENEA <ArrowRight size={16} />
            </Link>
            <Link
              to="/conto-termico"
              className="inline-flex items-center justify-center gap-2 font-semibold px-7 py-4 rounded-full text-base transition-all hover:bg-white/10 active:scale-[0.97]"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
            >
              Conto Termico <ArrowRight size={16} />
            </Link>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
            350+ installatori attivi · Nessun costo fisso · Zero vincoli
          </motion.p>
        </div>

        {/* Right: Dashboard */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <NewsWidget />
        </motion.div>
      </div>

      {/* Scroll hint */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-1">
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <ChevronDown className="w-5 h-5" style={{ color: "rgba(255,255,255,0.2)" }} />
        </motion.div>
      </motion.div>
    </section>
  );
}
