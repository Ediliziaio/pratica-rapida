import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { Clock } from "lucide-react";

const SERVICES = [
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="8" />
        <line x1="24" y1="4" x2="24" y2="10" /><line x1="24" y1="38" x2="24" y2="44" />
        <line x1="4" y1="24" x2="10" y2="24" /><line x1="38" y1="24" x2="44" y2="24" />
        <line x1="9.4" y1="9.4" x2="13.6" y2="13.6" /><line x1="34.4" y1="34.4" x2="38.6" y2="38.6" />
        <line x1="38.6" y1="9.4" x2="34.4" y2="13.6" /><line x1="13.6" y1="34.4" x2="9.4" y2="38.6" />
      </svg>
    ),
    title: "PRATICA ALLACCIO FOTOVOLTAICO GSE",
    desc: "Forniamo la gestione completa delle pratiche GSE per impianti fotovoltaici (Iter semplificato)",
    cta: "INSERISCI PRATICA",
    to: "/area-riservata-vecchia/allaccio-fotovoltaico",
    soon: false,
  },
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="6" width="28" height="36" rx="3" />
        <line x1="16" y1="16" x2="32" y2="16" /><line x1="16" y1="22" x2="32" y2="22" /><line x1="16" y1="28" x2="24" y2="28" />
      </svg>
    ),
    title: "PRATICA ENEA",
    desc: "Gestiamo la tua pratica ENEA per schermature solari, infissi, climatizzatori.",
    cta: "INSERISCI PRATICA",
    to: "/area-riservata-vecchia/pratica-enea",
    soon: false,
  },
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="18" width="10" height="8" rx="1" /><rect x="19" y="18" width="10" height="8" rx="1" /><rect x="34" y="18" width="10" height="8" rx="1" />
        <rect x="4" y="30" width="10" height="8" rx="1" /><rect x="19" y="30" width="10" height="8" rx="1" /><rect x="34" y="30" width="10" height="8" rx="1" />
        <line x1="6" y1="18" x2="6" y2="14" /><line x1="42" y1="18" x2="42" y2="14" />
        <line x1="6" y1="14" x2="42" y2="14" /><line x1="2" y1="40" x2="46" y2="40" />
      </svg>
    ),
    title: "PRATICA FOTOVOLTAICO OFF GRID",
    desc: "Gestiamo la tua pratica ENEA a seguito dell'installazione di un impianto fotovoltaico off grid.",
    cta: "INSERISCI PRATICA",
    to: "/area-riservata-vecchia/fotovoltaico-off-grid",
    soon: false,
  },
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="20" r="12" /><circle cx="20" cy="20" r="6" />
        <line x1="28.5" y1="28.5" x2="40" y2="40" strokeWidth="3" strokeLinecap="round" />
        <line x1="17" y1="20" x2="23" y2="20" /><line x1="20" y1="17" x2="20" y2="23" />
      </svg>
    ),
    title: "VERIFICA PREZZI",
    desc: "Verifichiamo il rispetto dei massimali per garantirti di stare rispettando le normative vigenti.",
    cta: "RICHIEDI VERIFICA",
    to: "/area-riservata-vecchia/verifica-prezzi",
    soon: false,
  },
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="20" r="12" />
        <line x1="28.5" y1="28.5" x2="40" y2="40" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
    title: "VISURA CATASTALE",
    desc: "Forniamo la visura catastale ufficiale dell'Agenzia delle Entrate di qualsiasi immobile, a privati o rivenditori.",
    cta: "RICHIEDI VISURA",
    to: "/area-riservata-vecchia/visura-catastale",
    soon: false,
  },
  {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto" stroke="hsl(152 65% 38%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 6 C14 6 8 14 8 24 C8 34 14 42 24 42 C34 42 40 34 40 24" />
        <path d="M32 6 L40 6 L40 14" /><path d="M40 6 L28 18" />
        <line x1="20" y1="24" x2="28" y2="24" /><line x1="24" y1="20" x2="24" y2="28" />
      </svg>
    ),
    title: "PRATICA CONTO TERMICO 3.0",
    desc: "Forniamo la gestione completa delle pratiche relative al Conto Termico 3.0.",
    cta: "Arriverà prossimamente",
    to: null,
    soon: true,
  },
];

export default function AreaRiservataVecchia() {
  return (
    <>
      <SEO
        title="Area Riservata Vecchio Portale | Pratica Rapida"
        description="Accesso ai servizi del vecchio portale Pratica Rapida: pratiche ENEA, Conto Termico, visura catastale e verifica prezzi."
        canonical="/area-riservata-vecchia"
        noindex={true}
      />
      <Navbar />

      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">

          {/* Banner avviso */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 text-center text-sm font-medium bg-orange-50 border border-orange-200 text-orange-700 rounded-xl py-3 px-5"
          >
            Stai visualizzando il vecchio portale.{" "}
            <Link to="/auth" className="font-bold underline hover:text-orange-900 transition-colors">
              Clicca qui per il nuovo portale →
            </Link>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-extrabold text-center mb-10"
            style={{ color: "hsl(220 60% 25%)" }}
          >
            Come Possiamo Aiutarti?
          </motion.h1>

          {/* 2-col grid */}
          <div className="grid sm:grid-cols-2 gap-6">
            {SERVICES.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.45 }}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-8 flex flex-col items-center text-center gap-4"
              >
                {s.icon}
                <h2 className="text-sm font-extrabold tracking-wide" style={{ color: "hsl(152 65% 32%)" }}>
                  {s.title}
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed flex-1">{s.desc}</p>

                {s.soon ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 py-2.5 px-6 rounded-full cursor-default">
                    <Clock className="w-3.5 h-3.5" /> Arriverà prossimamente
                  </span>
                ) : (
                  <Link
                    to={s.to!}
                    className="text-xs font-bold text-white py-2.5 px-7 rounded-full transition-all hover:opacity-90 active:scale-[0.97]"
                    style={{ background: "hsl(152 65% 38%)" }}
                  >
                    {s.cta}
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
