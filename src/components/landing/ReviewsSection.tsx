import { Star, MessageSquare, ArrowRight } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

const REVIEWS = [
  { name: "Marcello", badge: "IT · 1 recensione", date: "16 ore fa", title: "Professionalità", text: "Professionalità, gentilezza e rapidità ed assistenza telefonica competente e di vero aiuto nel completare la pratica." },
  { name: "lalli65", badge: "IT · 7 recensioni", date: "9 feb 2026", title: "Veloci e comprensibili", text: "Pratica Enea pervenuta subito per la compilazione. Compilazione on Line semplice e ben comprensibile." },
  { name: "Cadeddu Marina", badge: "IT · 2 recensioni", date: "18 dic 2025", title: "Esperienza positiva con pratica rapida", text: "Sono stati molto disponibili e mi hanno supportato. Il tutto con gentilezza e professionalità." },
  { name: "Flavio", badge: "IT · 4 recensioni", date: "15 dic 2025", title: "Veloci", text: "Veloci, professionali e gentili, complimenti!" },
  { name: "Paola Maruca", badge: "IT · 3 recensioni", date: "27 nov 2025", title: "Servizio efficente", text: "Efficenti e gentili sempre disponibili contattati più volte per togliermi dei dubbi sempre disponibili e gentili pienamente soddisfatta." },
  { name: "Valentina Puddu", badge: "IT · 1 recensione", date: "2 ott 2025", title: "Ottimo servizio e super efficienti", text: "Ottimo servizio e super efficienti. La pratica è stata presa in carico ed inoltrata in un giorno lavorativo. Pronta risposta per qualsiasi dubbio. Consigliatissimo!" },
  { name: "Paola Dario", badge: "IT · 4 recensioni", date: "2 ott 2025", title: "Super efficienti e veloci, top!", text: "" },
  { name: "Alex Alex", badge: "IT · 1 recensione", date: "2 ott 2025", title: "Professionali e molto disponibili", text: "Professionali e molto disponibili." },
  { name: "Matteo", badge: "IT · 3 recensioni", date: "2 ott 2025", title: "Sembrerebbe che dopo aver compilato i…", text: "Sembrerebbe che dopo aver compilato i documenti in 1 giorno mi hanno rigirato la pratica ultimata. Veloci e professionali. Grazie!" },
];

export function ReviewsSection() {
  return (
    <Section className="bg-[#0d1a2d]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
            <MessageSquare className="w-3.5 h-3.5" /> RECENSIONI VERIFICATE
          </span>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Cosa dicono i nostri clienti</h2>
          <a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white/50 hover:text-white/70 transition-colors text-sm">
            <div className="flex gap-0.5">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-green-400 text-green-400" />)}</div>
            <span>4.9 su <strong className="text-white/70">Trustpilot</strong></span>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REVIEWS.map((r, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex gap-0.5 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />)}</div>
              <p className="text-white font-bold text-sm mb-1">{r.title}</p>
              {r.text && <p className="text-white/60 text-sm leading-relaxed mb-3">{r.text}</p>}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                <div>
                  <p className="text-white text-sm font-semibold">{r.name}</p>
                  <p className="text-white/30 text-xs">{r.badge}</p>
                </div>
                <p className="text-white/30 text-xs">{r.date}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:brightness-125" style={{ color: PR_GREEN }}>
            Vedi tutte le 122+ recensioni su Trustpilot <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </Section>
  );
}
