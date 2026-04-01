import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle } from "lucide-react";

const STORAGE_KEY = "pr_new_portal_popup_v1";
const WHATSAPP_URL = "https://wa.me/390398682691?text=Ciao%2C%20ho%20bisogno%20di%20assistenza%20con%20il%20nuovo%20portale";

export default function NewPortalPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mostra solo se non è già stato chiuso
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function close() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div
              className="relative w-full max-w-md rounded-2xl p-7 shadow-2xl"
              style={{
                background: "hsl(var(--pr-dark))",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {/* Close */}
              <button
                onClick={close}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Chiudi"
              >
                <X size={18} />
              </button>

              {/* Badge */}
              <span
                className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-widest mb-4"
                style={{
                  background: "hsla(152,100%,45%,0.15)",
                  color: "hsl(152 100% 65%)",
                  border: "1px solid hsla(152,100%,45%,0.3)",
                }}
              >
                🚀 NOVITÀ
              </span>

              {/* Content */}
              <h2 className="text-xl font-bold text-white mb-3 leading-snug">
                È online il nuovo portale Pratica Rapida!
              </h2>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.6)" }}>
                L'<strong className="text-white">Area Rivenditori</strong> è rimasta invariata e funziona esattamente come prima.
                <br /><br />
                Se hai bisogno di aiuto o hai domande sul nuovo portale, siamo a disposizione.
              </p>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 text-white font-semibold px-5 py-3 rounded-full text-sm transition-all hover:brightness-110"
                  style={{ background: "hsl(var(--pr-green))" }}
                >
                  <MessageCircle size={15} /> Contattaci
                </a>
                <button
                  onClick={close}
                  className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-full text-sm font-semibold transition-all hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}
                >
                  Ho capito, grazie!
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
