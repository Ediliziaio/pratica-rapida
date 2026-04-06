import { motion } from "framer-motion";
import { Check, Phone, Mail, Clock, ExternalLink, ArrowRight } from "lucide-react";

const BASE = "https://www.praticarapida.com";
const WHATSAPP = "https://wa.me/390398682691";

// ── Hero cards (4) ─────────────────────────────────────────────
const HERO_CARDS = [
  {
    title: "Visura catastale ufficiale",
    subtitle: "Richiedi i dati del tuo immobile",
    bullets: [
      "Visura valida 12 mesi dall'emissione",
      "Intera procedura online",
      "Documento ufficiale Agenzia delle Entrate",
      "Supporto telefonico",
      "Supporto WhatsApp",
    ],
    cta: "Inserisci visura",
    href: `${BASE}/visura%20catastale`,
    color: "hsl(200 70% 48%)",
  },
  {
    title: "Verifica congruità dei prezzi",
    subtitle: "Assicurati di rispettare le normative",
    bullets: [
      "Verifica di rispetto dei massimali",
      "Intera procedura online",
      "Servizio per schermature solari e infissi",
      "Supporto telefonico",
      "Supporto WhatsApp",
    ],
    cta: "Inserisci verifica",
    href: `${BASE}/congruita`,
    color: "hsl(38 95% 50%)",
  },
  {
    title: "Fotovoltaico off grid",
    subtitle: "Gestione pratiche ENEA",
    bullets: [
      "Contatto con il cliente",
      "Intera procedura online",
      "Gestione del portale ENEA",
      "Supporto normativo",
      "Supporto telefonico",
      "Supporto WhatsApp",
    ],
    cta: "Inserisci pratica",
    href: `${BASE}/modulo%20rivenditori`,
    color: "hsl(152 65% 38%)",
  },
  {
    title: "Gestione pratiche ENEA",
    subtitle: "Gestione pratiche ENEA",
    bullets: [
      "Contatto con il cliente",
      "Intera procedura online",
      "Gestione del portale ENEA",
      "Supporto normativo",
      "Supporto telefonico",
      "Supporto WhatsApp",
    ],
    cta: "Inserisci pratica",
    href: `${BASE}/modulo%20rivenditori`,
    color: "hsl(152 65% 38%)",
  },
];

// ── Service cards (6) ──────────────────────────────────────────
const SERVICE_CARDS = [
  {
    emoji: "⚡",
    title: "Pratica Allaccio Fotovoltaico GSE",
    desc: "Gestione completa della pratica di allaccio alla rete per impianti fotovoltaici.",
    href: `${BASE}/allaccio-fotovoltaico`,
  },
  {
    emoji: "☀️",
    title: "Pratica Fotovoltaico Off Grid",
    desc: "Pratiche ENEA per impianti fotovoltaici off grid, dalla raccolta documenti all'invio.",
    href: `${BASE}/modulo%20rivenditori`,
  },
  {
    emoji: "🏠",
    title: "Visura Catastale",
    desc: "Richiesta visura catastale ufficiale tramite Agenzia delle Entrate, 100% online.",
    href: `${BASE}/visura%20catastale`,
  },
  {
    emoji: "📋",
    title: "Pratica ENEA",
    desc: "Trasmissione pratiche ENEA per ecobonus: serramenti, schermature, pompe di calore e altro.",
    href: `${BASE}/modulo%20rivenditori`,
  },
  {
    emoji: "✅",
    title: "Verifica Congruità Prezzi",
    desc: "Controllo dei massimali di spesa per schermature solari e infissi in detrazione.",
    href: `${BASE}/congruita`,
  },
  {
    emoji: "🌡️",
    title: "Pratica Conto Termico 3.0",
    desc: "Gestione completa della pratica Conto Termico sul portale GSE per i tuoi clienti.",
    href: `${BASE}/area-rivenditori`,
  },
];

export default function AreaRiservataVecchia() {
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header vecchio stile ─────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          {/* Top bar */}
          <div className="hidden md:flex items-center justify-between py-2 border-b border-gray-100 text-xs text-gray-500">
            <div className="flex items-center gap-6">
              <a href="tel:+390398682691" className="flex items-center gap-1.5 hover:text-gray-800 transition-colors">
                <Phone className="w-3 h-3" /> +39 039 868 2691
              </a>
              <a href="mailto:modulistica@praticarapida.it" className="flex items-center gap-1.5 hover:text-gray-800 transition-colors">
                <Mail className="w-3 h-3" /> modulistica@praticarapida.it
              </a>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Lun–Ven: 9:00–18:00
              </span>
            </div>
            <a
              href="https://www.praticarapida.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-gray-800 transition-colors"
            >
              Vai al sito completo <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between h-16">
            <a href="https://www.praticarapida.com" target="_blank" rel="noopener noreferrer">
              <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-9 w-auto object-contain" />
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <a href="https://www.praticarapida.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Home</a>
              <a href="https://www.praticarapida.com/contatti" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Contatti</a>
              <a href={`${BASE}/area-rivenditori/`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Area rivenditori</a>
              <a href="https://www.praticarapida.com/news" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">News</a>
            </nav>
            <div className="flex items-center gap-2">
              <div className="text-xs text-orange-600 font-semibold bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">
                Portale precedente (sola lettura)
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Banner avviso ───────────────────────────────────────── */}
      <div className="bg-orange-500 text-white text-center py-2.5 px-4 text-sm font-medium">
        Stai visualizzando il vecchio portale in modalità copia. Per inserire nuove pratiche usa il{" "}
        <a href="/auth" className="underline font-bold hover:text-orange-100 transition-colors">
          nuovo portale →
        </a>
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="bg-white py-14">
        <div className="max-w-6xl mx-auto px-4">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-2"
          >
            di cosa hai bisogno?
          </motion.h1>
          <p className="text-center text-gray-500 mb-10">Seleziona il servizio che ti serve</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HERO_CARDS.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.45 }}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
              >
                {/* Color top stripe */}
                <div className="h-1.5" style={{ background: card.color }} />

                <div className="p-5 flex flex-col flex-1">
                  <h2 className="text-base font-bold text-gray-900 mb-0.5">{card.title}</h2>
                  <p className="text-xs text-gray-500 mb-4 italic">{card.subtitle}</p>

                  <ul className="space-y-1.5 mb-6 flex-1">
                    {card.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: card.color }} />
                        {b}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: card.color }}
                  >
                    {card.cta}
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divisore ─────────────────────────────────────────────── */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mx-8" />

      {/* ── Sezione servizi ─────────────────────────────────────── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2"
          >
            come possiamo aiutarti?
          </motion.h2>
          <p className="text-center text-gray-500 mb-10">Tutti i servizi disponibili sul portale</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICE_CARDS.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.45 }}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4"
              >
                <div className="text-3xl">{s.emoji}</div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-white py-2.5 px-5 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "hsl(152 65% 38%)" }}
                >
                  INSERISCI PRATICA <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA nuovo portale ────────────────────────────────────── */}
      <section className="py-12 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-lg font-semibold text-gray-800 mb-2">Vuoi usare il nuovo portale?</p>
          <p className="text-gray-500 text-sm mb-6">
            Il nuovo portale Pratica Rapida è più veloce, moderno e con più funzionalità.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/auth"
              className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3 rounded-full text-sm transition-all hover:brightness-110"
              style={{ background: "hsl(152 65% 38%)" }}
            >
              Accedi al nuovo portale <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-semibold px-7 py-3 rounded-full text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
            >
              Scrivici su WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer minimale ─────────────────────────────────────── */}
      <footer className="bg-gray-800 text-gray-400 py-8 text-sm">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Pratica Rapida S.r.l.s. — P.IVA 03937130791 — Lissone (MB)</p>
          <div className="flex gap-4">
            <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
