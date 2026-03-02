import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, Clock, Headphones, Star, ArrowRight } from "lucide-react";
import { PR_GREEN } from "./constants";
import { DashboardMockup } from "./DashboardMockup";
import heroBg from "@/assets/hero-bg.jpg";

function HeroTitle() {
  const words = "Quante Vendite Stai Perdendo Perché Non Gestisci le".split(" ");
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
      {words.map((w, i) => (
        <span key={i} className="word-animate inline-block mr-[0.3em]" style={{ animationDelay: `${i * 0.08}s` }}>{w}</span>
      ))}
      <span className="word-animate inline-block" style={{ animationDelay: `${words.length * 0.08}s`, color: PR_GREEN }}>Pratiche ENEA</span>
      <span className="word-animate inline-block ml-[0.3em]" style={{ animationDelay: `${(words.length + 1) * 0.08}s` }}>?</span>
    </h1>
  );
}

export function HeroSection() {
  return (
    <section className="relative pt-[88px] pb-8 px-6">
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at center top, ${PR_GREEN}08 0%, transparent 60%)` }} />
      <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.04] pointer-events-none" />
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <span className="inline-block border text-xs font-semibold px-4 py-1.5 rounded-full mb-4 tracking-wide" style={{ backgroundColor: `${PR_GREEN}15`, borderColor: `${PR_GREEN}30`, color: PR_GREEN }}>
          PER AZIENDE DI INFISSI, TENDE, PERGOLE E SERRAMENTI
        </span>
        <div className="flex items-center justify-center gap-2 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400/80 text-sm font-medium">I tuoi concorrenti stanno già offrendo questo servizio. Tu?</span>
        </div>
        <HeroTitle />
        <DashboardMockup />
        <p className="text-white/60 max-w-3xl mx-auto mt-10 text-base md:text-lg leading-relaxed">
          Scopri come le aziende più furbe del tuo settore stanno chiudendo più contratti, eliminando le obiezioni dei clienti e distruggendo la concorrenza — con un servizio che costa appena <strong className="text-white">65€ a pratica</strong> e non richiede NESSUN lavoro da parte tua.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <Link to="/auth" className="text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-all flex items-center gap-2 animate-pulse-glow hover:brightness-110" style={{ backgroundColor: PR_GREEN }}>
            Attiva Gratis <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#come-funziona" className="border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-colors">
            Scopri Come Funziona
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-12">
          {[
            { icon: CreditCard, label: "65€/pratica" },
            { icon: Clock, label: "24h Consegna" },
            { icon: Headphones, label: "Supporto Italiano" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-white/50 text-sm">
              <s.icon className="w-4 h-4" style={{ color: PR_GREEN }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-6 text-white/40 hover:text-white/60 transition-colors text-sm">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-green-400 text-green-400" />)}
          </div>
          <span>Oltre 122 recensioni su <strong className="text-white/60">Trustpilot</strong></span>
        </a>
      </div>
    </section>
  );
}
