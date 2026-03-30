import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/390398682691?text=Ciao%2C%20vorrei%20sapere%20come%20funziona%20Pratica%20Rapida";

export default function FinalCTAHome() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      ref={ref}
      className="relative py-20 lg:py-28 overflow-hidden"
      style={{ background: "hsl(var(--pr-dark))" }}
    >
      {/* Glow orb */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsla(152,100%,30%,0.2) 0%, transparent 70%)", filter: "blur(40px)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />

      <div className="max-w-3xl mx-auto px-4 lg:px-8 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-white mb-5">
            Pronto a delegare la burocrazia
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(152 100% 68%) 0%, hsl(200 100% 65%) 100%)" }}
            >
              e concentrarti sulle vendite?
            </span>
          </h2>
          <p className="text-base sm:text-lg mb-8 max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
            Scegli il servizio che ti interessa. Nessun vincolo, nessun costo di attivazione.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "hsl(var(--pr-green))",
                boxShadow: "0 0 40px hsla(152,100%,30%,0.5), 0 4px 20px hsla(152,100%,24%,0.4)",
              }}
            >
              Attiva Gratis <ArrowRight size={16} />
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-full text-base transition-all hover:bg-white/15 active:scale-[0.97]"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <MessageCircle size={17} /> Contattaci su WhatsApp
            </a>
          </div>

          <p className="text-xs mt-5" style={{ color: "rgba(255,255,255,0.3)" }}>
            Registrazione gratuita · Nessun impegno · Zero costi nascosti
          </p>
        </motion.div>
      </div>
    </section>
  );
}
