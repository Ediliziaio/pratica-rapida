/**
 * /area-riservata-vecchia — bivio d'ingresso del vecchio portale.
 *
 * Due strade:
 *  1. "Carica la tua richiesta" → /area-riservata-vecchia/servizi
 *     (griglia moduli: ENEA, fotovoltaico, visura, ecc. — form interni)
 *  2. "Accedi alla tua area"   → /auth
 *     (login portale: stato pratiche, documenti, comunicazioni)
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { Upload, LogIn, ArrowRight } from "lucide-react";

const CHOICES = [
  {
    icon: Upload,
    title: "Carica la tua richiesta",
    desc: "Inserisci una nuova pratica: ENEA, fotovoltaico, visura catastale, verifica prezzi e altro. Bastano i dati della tua azienda e del cliente — al resto pensiamo noi.",
    cta: "Inserisci pratica",
    to: "/area-riservata-vecchia/servizi",
  },
  {
    icon: LogIn,
    title: "Accedi alla tua area",
    desc: "Entra nel portale per vedere lo stato delle tue pratiche in tempo reale, scaricare le ricevute e comunicare con il nostro team.",
    cta: "Accedi al portale",
    to: "/auth",
  },
];

export default function AreaRiservataVecchia() {
  return (
    <>
      <SEO
        title="Area Riservata | Pratica Rapida"
        description="Carica una nuova richiesta o accedi alla tua area per vedere lo stato delle tue pratiche ENEA e Conto Termico."
        canonical="/area-riservata-vecchia"
        noindex={true}
      />
      <Navbar />

      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-extrabold text-center mb-3"
            style={{ color: "hsl(220 60% 25%)" }}
          >
            Benvenuto nell'Area Riservata
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="text-center text-gray-500 mb-12"
          >
            Cosa vuoi fare oggi?
          </motion.p>

          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {CHOICES.map((c, i) => {
              const Icon = c.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.45 }}
                >
                  <Link
                    to={c.to}
                    className="group block h-full bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-[hsl(152_65%_38%)]/40 transition-all p-8 text-center"
                  >
                    <div
                      className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ background: "hsl(152 65% 38% / 0.1)" }}
                    >
                      <Icon className="w-8 h-8" style={{ color: "hsl(152 65% 38%)" }} />
                    </div>
                    <h2 className="text-lg font-extrabold mb-3" style={{ color: "hsl(220 60% 25%)" }}>
                      {c.title}
                    </h2>
                    <p className="text-sm text-gray-500 leading-relaxed mb-6">{c.desc}</p>
                    <span
                      className="inline-flex items-center gap-2 text-sm font-bold text-white py-2.5 px-7 rounded-full transition-all group-hover:opacity-90"
                      style={{ background: "hsl(152 65% 38%)" }}
                    >
                      {c.cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
