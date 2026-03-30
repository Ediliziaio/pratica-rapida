import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Star, ChevronDown } from "lucide-react";

function useCounter(target: number, delay: number, duration = 1500) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(eased * target));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, delay, duration]);
  return count;
}

function DashboardMockup() {
  const enea = useCounter(47, 900);
  const ct = useCounter(23, 1100);
  const hours = useCounter(48, 1300);
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 space-y-3"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2">
        {[{ c: "rgba(255,80,80,0.8)" }, { c: "hsla(152,100%,40%,0.8)" }, { c: "rgba(200,200,200,0.2)" }].map((d, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.7 + i * 0.08 }}
            className="w-3 h-3 rounded-full"
            style={{ background: d.c }}
          />
        ))}
        <span className="ml-auto text-xs hidden sm:block" style={{ color: "rgba(255,255,255,0.22)" }}>pannello.praticarapida.it</span>
      </div>

      {[
        { label: "Pratiche ENEA questo mese", val: enea, suffix: " ✅", delay: 0.9 },
        { label: "Pratiche Conto Termico", val: ct, suffix: " ✅", delay: 1.1 },
        { label: "Tempo medio evasione", val: hours, suffix: "h", delay: 1.3 },
      ].map((row) => (
        <motion.div
          key={row.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: row.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-xs sm:text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{row.label}</span>
          <span className="font-bold tabular-nums text-white text-sm">{row.val}{row.suffix}</span>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7 }}
        className="flex items-center gap-2 text-xs pt-1"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "hsl(152 100% 50%)" }} />
        Aggiornato in tempo reale
      </motion.div>
    </div>
  );
}

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
          <DashboardMockup />
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
