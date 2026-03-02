import { Link } from "react-router-dom";
import { Shield, CreditCard, Clock, Zap, Star, ArrowRight, FileText, Sparkles } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function CTASection() {
  return (
    <Section className="bg-[#0d1a2d] relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${PR_GREEN}12 0%, transparent 50%)` }} />
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
          <Zap className="w-3.5 h-3.5" /> NON ASPETTARE
        </span>

        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6">
          Sei pronto a smettere di{" "}
          <span style={{ color: PR_GREEN }}>perdere vendite</span>?
        </h2>
        <p className="text-white/60 text-lg mb-2">Attiva Pratica Rapida Oggi.</p>
        <p className="text-white/50 mb-8">
          Zero rischi. Zero costi anticipati. Zero lavoro da parte tua. Solo pratiche ENEA gestite in 24 ore a 65€ l'una, con assicurazione inclusa.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-10">
          {[
            { icon: Shield, label: "Zero Rischi", desc: "Assicurazione inclusa" },
            { icon: CreditCard, label: "65€/pratica", desc: "Paghi solo a consegna" },
            { icon: Clock, label: "Consegna 24h", desc: "Velocità garantita" },
          ].map((b) => (
            <div key={b.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <b.icon className="w-6 h-6 mx-auto mb-2" style={{ color: PR_GREEN }} />
              <p className="text-white font-bold text-sm">{b.label}</p>
              <p className="text-white/40 text-xs mt-1">{b.desc}</p>
            </div>
          ))}
        </div>

        <Link to="/auth" className="inline-flex items-center gap-2 text-white font-bold text-lg px-12 py-4 rounded-lg transition-all animate-pulse-glow hover:brightness-110 shadow-lg" style={{ backgroundColor: PR_GREEN, boxShadow: `0 0 30px ${PR_GREEN}40` }}>
          Attiva Gratis <ArrowRight className="w-5 h-5" />
        </Link>
        <p className="text-white/30 text-sm mt-3">Risponderemo entro poche ore. Nessun impegno.</p>

        <a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-6 text-white/40 hover:text-white/60 transition-colors text-sm">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-green-400 text-green-400" />)}
          </div>
          <span>122+ recensioni su <strong className="text-white/60">Trustpilot</strong></span>
        </a>

        <div className="mt-12 space-y-4 max-w-3xl mx-auto text-left">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex gap-4">
            <FileText className="w-5 h-5 mt-0.5 shrink-0" style={{ color: PR_GREEN }} />
            <p className="text-white/40 text-sm leading-relaxed">
              <strong className="text-white/60">P.S.</strong> — Se stai ancora pensando "ma i miei clienti se la cavano da soli con la pratica ENEA"… chiediti questo: quanti di loro tornano da te per il secondo acquisto? Quanti ti mandano referenze? Il servizio post-vendita è quello che costruisce la fedeltà. E la gestione della pratica ENEA è il servizio post-vendita più facile e redditizio che puoi offrire. A 65€.
            </p>
          </div>
          <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-6 flex gap-4">
            <Sparkles className="w-5 h-5 mt-0.5 shrink-0" style={{ color: PR_GREEN }} />
            <p className="text-white/40 text-sm leading-relaxed">
              <strong className="text-white/60">P.P.S.</strong> — E se stai già gestendo le pratiche con un altro fornitore, fai un semplice calcolo: quanto ti costa veramente ogni pratica tra canoni software, ore del personale, telefonate e stress? Poi confronta quel numero con 65€ e zero lavoro. La scelta è ovvia.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
