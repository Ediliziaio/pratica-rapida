import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Phone, Users, Clock, Shield, CreditCard, CheckCircle2, XCircle, Scale,
  ArrowRight, FileText, BarChart3, AlertTriangle, Zap, Star, Sparkles,
  Headphones, Gift, Building2, Target, TrendingDown, Monitor, Menu, X,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import teamImg from "@/assets/team-illustration.jpg";

/* ── Brand color ── */
const PR_GREEN = "#00843D";

/* ── Scroll fade-in hook ── */
function useScrollFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("landing-visible"); observer.unobserve(el); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/* ── Animated counter hook ── */
function useCounter(end: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setCount(Math.floor(progress * end));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);
  return { count, ref };
}

/* ── Section wrapper with light/dark support ── */
function Section({ children, className = "", id, light = false }: { children: React.ReactNode; className?: string; id?: string; light?: boolean }) {
  const ref = useScrollFadeIn();
  return (
    <section ref={ref} id={id} className={`landing-fade-in py-20 md:py-28 ${light ? "bg-white" : ""} ${className}`}>
      {children}
    </section>
  );
}

/* ── Floating Icons ── */
function FloatingIcons() {
  return (
    <>
      <div className="hidden lg:block fixed left-6 top-1/4 z-0 opacity-[0.07]">
        <FileText className="w-10 h-10 mb-12 animate-float" style={{ color: PR_GREEN }} />
        <BarChart3 className="w-8 h-8 mb-14 animate-float-delayed" style={{ color: PR_GREEN }} />
        <Building2 className="w-9 h-9 animate-float-slow" style={{ color: PR_GREEN }} />
      </div>
      <div className="hidden lg:block fixed right-6 top-1/3 z-0 opacity-[0.07]">
        <Shield className="w-10 h-10 mb-12 animate-float-delayed" style={{ color: PR_GREEN }} />
        <Target className="w-8 h-8 mb-14 animate-float" style={{ color: PR_GREEN }} />
        <Star className="w-9 h-9 animate-float-slow" style={{ color: PR_GREEN }} />
      </div>
    </>
  );
}

/* ── Dashboard Mockup ── */
function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-4xl mt-14 rounded-xl border border-white/10 bg-[#101d30] shadow-2xl overflow-hidden animate-mockup-enter">
      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-[#0c1727] border-r border-white/5 flex flex-col items-center py-4 gap-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}20` }}><Shield className="w-4 h-4" style={{ color: PR_GREEN }} /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><Users className="w-4 h-4 text-white/40" /></div>
      </div>
      {/* Content */}
      <div className="ml-12 p-6">
        <p className="text-white/40 text-xs mb-0.5">Benvenuto</p>
        <p className="text-white font-semibold text-sm mb-5">Dashboard</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: FileText, label: "Pratiche Totali", value: "284", color: "#3b82f6" },
            { icon: CheckCircle2, label: "Completate", value: "218", color: PR_GREEN },
            { icon: Clock, label: "In Lavorazione", value: "42", color: "#f59e0b" },
            { icon: CreditCard, label: "Risparmio", value: "€ 18.400", color: "#8b5cf6" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#0c1727] rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                <span className="text-white/50 text-[10px]">{kpi.label}</span>
              </div>
              <span className="text-white font-bold text-lg">{kpi.value}</span>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[#0c1727] rounded-lg p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-3">Pratiche Recenti</p>
            <div className="space-y-2">
              {[
                { id: "PR-0147", client: "Rossi Mario", amount: "€ 65", status: "In Lavorazione", sc: "bg-amber-500/20 text-amber-400" },
                { id: "PR-0146", client: "Bianchi & Figli", amount: "€ 65", status: "Completata", sc: "bg-green-500/20 text-green-400" },
                { id: "PR-0145", client: "Condominio Via Roma", amount: "€ 65", status: "In Attesa", sc: "bg-blue-500/20 text-blue-400" },
              ].map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono" style={{ color: PR_GREEN }}>{r.id}</span>
                  <span className="text-white/70 flex-1 ml-3">{r.client}</span>
                  <span className="text-white/60 mr-3">{r.amount}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.sc}`}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#0c1727] rounded-lg p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-3">Statistiche Mensili</p>
            <div className="flex items-end gap-1 h-20">
              {[35, 48, 60, 42, 55, 72, 65].map((h, i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: `${PR_GREEN}50` }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-white/30 mt-1">
              <span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Animated Hero Title ── */
function HeroTitle() {
  const words = "Quante Vendite Stai Perdendo Perché Non Gestisci le".split(" ");
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
      {words.map((w, i) => (
        <span key={i} className="word-animate inline-block mr-[0.3em]" style={{ animationDelay: `${i * 0.08}s` }}>
          {w}
        </span>
      ))}
      <span className="word-animate inline-block" style={{ animationDelay: `${words.length * 0.08}s`, color: PR_GREEN }}>
        Pratiche ENEA
      </span>
      <span className="word-animate inline-block ml-[0.3em]" style={{ animationDelay: `${(words.length + 1) * 0.08}s` }}>?</span>
    </h1>
  );
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const priceCounter = useCounter(65);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMobile = useCallback(() => setMobileMenuOpen(false), []);

  const navLinks = [
    { href: "#come-funziona", label: "Come Funziona" },
    { href: "#vantaggi", label: "Vantaggi" },
    { href: "#confronto", label: "Confronto" },
    { href: "#prezzi", label: "Prezzi" },
  ];

  return (
    <div className="min-h-screen bg-[#0a1628] text-white font-sans relative overflow-x-hidden">
      <FloatingIcons />

      {/* ── Top Banner ── */}
      <div className="text-white text-center py-2.5 text-xs md:text-sm font-semibold tracking-wide flex items-center justify-center gap-2" style={{ backgroundColor: PR_GREEN }}>
        <Gift className="w-4 h-4" />
        ZERO VINCOLI. PAGHI SOLO A PRATICA COMPLETATA.
      </div>

      {/* ── Navbar ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "navbar-scrolled" : "bg-[#0a1628]/90 backdrop-blur-md border-b border-white/5"}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 transition-all duration-300">
          <Link to="/home" className="flex items-center gap-2">
            <img
              src={scrolled ? "/pratica-rapida-logo.png" : "/pratica-rapida-logo-white.png"}
              alt="Pratica Rapida"
              className="max-h-10 w-auto object-contain transition-all duration-300"
            />
          </Link>
          <div className={`hidden md:flex items-center gap-8 text-sm ${scrolled ? "text-gray-600" : "text-white/70"}`}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className={`nav-link transition-colors ${scrolled ? "hover:text-[#00843D]" : "hover:text-white"}`}>{l.label}</a>
            ))}
            <Link to="/auth" className={`nav-link transition-colors ${scrolled ? "hover:text-[#00843D]" : "hover:text-white"}`}>Accedi</Link>
          </div>
          <Link to="/auth" className="hidden md:inline-flex text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all animate-pulse-glow" style={{ backgroundColor: PR_GREEN }}>
            Attiva Ora
          </Link>
          {/* Hamburger */}
          <button className={`md:hidden flex flex-col gap-1.5 z-[60] ${mobileMenuOpen ? "hamburger-open" : ""}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
          </button>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 mobile-menu-overlay flex flex-col items-center justify-center gap-8" onClick={closeMobile}>
          <button className="absolute top-5 right-6 text-white" onClick={closeMobile}><X className="w-7 h-7" /></button>
          {navLinks.map((l, i) => (
            <a key={l.href} href={l.href} onClick={closeMobile} className="text-2xl font-semibold text-white stagger-child landing-visible" style={{ transitionDelay: `${i * 0.1}s`, opacity: 1, transform: "none" }}>
              {l.label}
            </a>
          ))}
          <Link to="/auth" onClick={closeMobile} className="text-2xl font-semibold text-white">Accedi</Link>
          <Link to="/auth" onClick={closeMobile} className="text-white font-semibold px-8 py-3 rounded-lg text-lg mt-4" style={{ backgroundColor: PR_GREEN }}>
            Attiva Ora
          </Link>
        </div>
      )}

      {/* ── Hero (SCURO) ── */}
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
              Attiva Pratica Rapida <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#come-funziona" className="border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-colors">
              Scopri Come Funziona
            </a>
          </div>

          {/* Stats */}
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
        </div>
      </section>

      {/* ── Il Problema (BIANCO) ── */}
      <Section id="vantaggi" light>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-8 text-gray-900">
            Sai qual è il modo più veloce per{" "}
            <span style={{ color: PR_GREEN }}>perdere un cliente</span> nel 2025?
          </h2>
          <p className="text-gray-500 text-center max-w-3xl mx-auto text-lg mb-6">
            Dirgli: <em className="text-gray-900 font-medium">"La pratica ENEA? Ah, quella se la deve fare lei."</em>
          </p>
          <div className="max-w-3xl mx-auto space-y-4 text-gray-500 leading-relaxed mb-6">
            <p>Forse fino a qualche anno fa funzionava. Il cliente annuiva, tornava a casa e — forse — si arrangiava. Ma oggi? Oggi il mercato è cambiato. E se non te ne sei accorto, il tuo fatturato probabilmente te lo sta già urlando.</p>
            <p>Perché nel frattempo, il tuo concorrente dall'altra parte della strada ha capito una cosa semplicissima:</p>
            <p className="text-gray-700 font-medium text-center italic">"Il cliente non vuole pensare alla burocrazia. Vuole che qualcuno gli risolva il problema. E chi glielo risolve… si prende la vendita."</p>
            <p>Pensa a quante volte è successo. Il cliente ti chiede un preventivo. Gli piace il prodotto. Gli piace il prezzo. Poi arriva la domanda fatidica: <em className="text-gray-900 font-medium">"Ma per la pratica ENEA come funziona?"</em></p>
            <p>E tu rispondi: "Guardi, quella la deve fare lei, oppure il suo commercialista…"</p>
            <p>In quel momento — in quel preciso istante — hai perso il vantaggio competitivo. Hai dato al cliente un motivo per andare a chiedere un preventivo anche al tuo concorrente. Quello che risponde: <em className="text-gray-900 font-medium">"Non si preoccupi, a tutto ci pensiamo noi."</em></p>
            <p>Domanda scomoda: quante vendite hai perso negli ultimi 12 mesi per questa ragione? 5? 10? 20? Fai il conto in euro. Quanti soldi sono rimasti sul tavolo perché non offrivi un servizio che avresti potuto attivare per soli <strong className="text-gray-900">65€ a pratica</strong>?</p>
          </div>
        </div>
      </Section>

      {/* ── Parliamoci chiaro + Trappole (SCURO) ── */}
      <Section className="bg-[#0d1a2d]">
        <div className="max-w-5xl mx-auto px-6">
          {/* Badge + Titolo + Divider */}
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
              <Target className="w-3.5 h-3.5" /> IL PROBLEMA DEL SETTORE
            </span>
            <h2 className="text-3xl md:text-5xl font-bold" style={{ color: PR_GREEN }}>
              Parliamoci chiaro<span className="text-white">.</span>
            </h2>
            <div className="w-16 h-1 rounded-full mx-auto mt-5" style={{ backgroundColor: PR_GREEN }} />
          </div>

          <div className="max-w-3xl mx-auto space-y-5 text-white/60 leading-relaxed mb-12 text-base">
            <p>Il settore degli infissi, delle tende da sole, delle pergole e dei serramenti è diventato un <strong className="text-white/90">campo di battaglia</strong>.</p>
            <p>I margini si sono assottigliati. I clienti confrontano 3, 4, 5 preventivi prima di decidere. E sai cosa fa la differenza quando il prezzo è simile? <strong className="text-white">Il servizio.</strong></p>
            <p>L'azienda che offre un <strong className="text-white/90">pacchetto completo</strong> — dalla consulenza, alla posa, fino alla gestione burocratica — vince. Sempre. Perché il cliente sceglie la strada con meno attrito.</p>
            <p>Tu puoi avere il miglior prodotto del mondo. Ma se il tuo cliente deve prendersi mezza giornata di ferie per capire come compilare una pratica ENEA, mentre il tuo concorrente gli dice "ci pensiamo noi a tutto"… indovina chi firma il contratto?</p>

            {/* Blockquote evidenziata */}
            <blockquote className="border-l-4 rounded-r-xl p-6 my-8" style={{ borderColor: PR_GREEN, backgroundColor: `${PR_GREEN}08` }}>
              <p className="text-white/90 text-lg md:text-xl italic font-medium leading-relaxed">
                "Non è il migliore che vince. È quello che rende la vita più facile al cliente."
              </p>
            </blockquote>

            <p>E non stiamo parlando di teoria. Stiamo parlando di <strong className="text-white/90">vendite perse</strong>. Soldi veri. Clienti che avevano il portafoglio in mano e se ne sono andati perché tu non offrivi quel servizio in più che li avrebbe fatti sentire seguiti al 100%.</p>
          </div>

          {/* Badge Attenzione + Titolo Trappole */}
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-4 bg-red-500/15 text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" /> ATTENZIONE
            </span>
            <h3 className="text-2xl md:text-4xl font-bold flex items-center justify-center gap-3">
              Le 2 trappole in cui cadono il 90% delle aziende
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Trappola #1 */}
            <div className="bg-[#0f1d32] border border-red-500/20 rounded-xl overflow-hidden card-hover-glow relative">
              <span className="absolute top-4 right-5 text-6xl font-black text-red-500/10 select-none">#1</span>
              <div className="px-8 pt-7 pb-2">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  </div>
                  <h4 className="text-lg font-bold">Il Fornitore "Low Cost"</h4>
                </div>
                <p className="text-white/55 text-sm leading-relaxed mb-4">
                  Ti dicono che il prezzo è basso (50–200€). Peccato che poi il lavoro sporco lo devi fare <strong className="text-white/90">TU</strong>:
                </p>
                <ul className="space-y-2 mb-5">
                  {[
                    "Raccogliere i contatti del cliente",
                    "Inseguire il cliente per i documenti catastali",
                    "Procurarti fatture, certificazioni, dati tecnici",
                    "Impacchettare tutto e inviarlo all'azienda",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mx-6 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-5 py-3.5">
                <p className="text-red-300 text-sm font-semibold">
                  💸 Costo reale: <span className="text-white font-bold">3-5x di più</span> di quanto pensi
                </p>
                <p className="text-white/40 text-xs mt-1">Ore del personale + telefonate + solleciti + email</p>
              </div>
            </div>

            {/* Trappola #2 */}
            <div className="bg-[#0f1d32] border border-red-500/20 rounded-xl overflow-hidden card-hover-glow relative">
              <span className="absolute top-4 right-5 text-6xl font-black text-red-500/10 select-none">#2</span>
              <div className="px-8 pt-7 pb-2">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-red-400" />
                  </div>
                  <h4 className="text-lg font-bold">Il Software "Premium"</h4>
                </div>
                <p className="text-white/55 text-sm leading-relaxed mb-4">
                  Ti vendono un software con un canone annuale da capogiro — <strong className="text-white/90">più di 1.000€</strong> — e poi scopri la beffa: massimo 3 pratiche ENEA incluse. <strong className="text-white/90">Tre.</strong>
                </p>
                <ul className="space-y-2 mb-5">
                  {[
                    "Paghi 1.000€+ per sole 3 pratiche incluse",
                    "Ogni pratica extra? Paghi ancora",
                    "Il software lo devi imparare tu",
                    "Lo devi gestire e aggiornare tu",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mx-6 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-5 py-3.5">
                <p className="text-red-300 text-sm font-semibold">
                  💸 Costo reale: <span className="text-white font-bold">333€+ a pratica</span>
                </p>
                <p className="text-white/40 text-xs mt-1">Come comprare una Ferrari per andare a prendere il pane</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Come Funziona (BIANCO) ── */}
      <Section id="come-funziona" light>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-4" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
              <Sparkles className="w-4 h-4" /> 3 SEMPLICI PASSI
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900">
              Come funziona? È{" "}
              <span style={{ color: PR_GREEN }}>imbarazzantemente semplice</span>.
            </h2>
            <p className="text-gray-500 text-xl mt-4">Tre passi. Zero sforzo.</p>
            <div className="w-16 h-1 rounded mx-auto mt-4" style={{ backgroundColor: PR_GREEN }} />
          </div>

          {/* Timeline numerata - solo desktop */}
          <div className="hidden md:flex justify-between items-center mb-8 px-20 relative">
            <div className="absolute top-1/2 left-20 right-20 h-0.5 -translate-y-1/2" style={{ backgroundColor: `${PR_GREEN}30` }} />
            {[1, 2, 3].map((n) => (
              <div key={n} className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm z-10 shadow-md" style={{ backgroundColor: PR_GREEN }}>
                {n}
              </div>
            ))}
          </div>

          {/* Card grid a 3 colonne */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Phone, title: "Inserisci il numero di telefono del cliente",
                desc: "Accedi alla tua area riservata e inserisci il numero del tuo cliente. Fine. Questo è TUTTO quello che devi fare. Non un documento, non una email, non un fax. Solo un numero di telefono.",
              },
              {
                icon: Users, title: "Noi contattiamo il cliente A NOME TUO",
                desc: "Il nostro team chiama il tuo cliente presentandosi come parte della tua azienda. Nessuna confusione, nessun imbarazzo. Il cliente penserà di parlare con il tuo ufficio tecnico. Raccogliamo noi tutti i documenti: dati catastali, fatture, certificazioni. Tutto.",
              },
              {
                icon: Zap, title: "In 24 ore la pratica è pronta",
                desc: "Entro 24 ore, sia tu che il tuo cliente ricevete la Pratica ENEA completa e pronta. Nessun ritardo. Nessun sollecito. Nessuna telefonata di follow-up. Fatto.",
              },
            ].map((item, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm hover:shadow-md transition-all duration-300 stagger-child" style={{ borderColor: undefined }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${PR_GREEN}60`; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; }}>
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${PR_GREEN}12` }}>
                  <item.icon className="w-10 h-10" style={{ color: PR_GREEN }} />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-gray-500 text-center max-w-3xl mx-auto mt-10 text-base leading-relaxed">
            Il risultato? Tu offri un servizio completo ai tuoi clienti, non perdi più vendite, non sprechi più ore in burocrazia — e paghi solo <strong className="text-gray-900">65€ a pratica completata</strong>. Non un centesimo prima.
          </p>
        </div>
      </Section>

      {/* ── Confronto (SCURO) ── */}
      <Section id="confronto" className="bg-[#0d1a2d]">
        <div className="max-w-5xl mx-auto px-6">
          {/* Badge + Header */}
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-4" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
              <Scale className="w-4 h-4" /> CONFRONTO DIRETTO
            </span>
            <h2 className="text-3xl md:text-5xl font-bold">
              Il <span style={{ color: PR_GREEN }}>Confronto</span> che parla da solo
            </h2>
            <p className="text-white/50 mt-3 text-base max-w-2xl mx-auto">Vedi tu stesso la differenza tra il metodo tradizionale e Pratica Rapida</p>
            <div className="w-16 h-1 rounded-full mx-auto mt-6" style={{ backgroundColor: PR_GREEN }} />
          </div>

          {/* Cards grid con VS */}
          <div className="grid md:grid-cols-2 gap-8 relative items-start">
            {/* VS circle (desktop only) */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#0d1a2d] border-2 border-white/20 items-center justify-center z-10 shadow-lg">
              <span className="text-white font-black text-lg">VS</span>
            </div>

            {/* Card sinistra - Metodo Tradizionale */}
            <div className="bg-[#0f1d32] border border-red-500/20 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-red-500/40" />
              <span className="inline-block text-xs bg-red-500/10 text-red-400 px-3 py-1 rounded-full mb-6 font-semibold tracking-wide">METODO TRADIZIONALE</span>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-400" /> Quello che hai adesso
              </h3>
              <ul className="space-y-4">
                {[
                  "Raccogli tu i documenti del cliente",
                  "Insegui tu il cliente per dati mancanti",
                  "Paghi 1.000€+ per software con 3 pratiche",
                  "Oppure 50-200€ ma fai tutto tu",
                  "Tempi lunghi e incerti",
                  "Zero garanzia sugli errori",
                  "Il tuo staff perde ore in burocrazia",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-white/50 text-base">
                    <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {/* Footer verdetto */}
              <div className="mt-8 pt-6 border-t border-white/10">
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 space-y-2">
                  <p className="text-red-400/80 text-sm font-medium">💸 Costo reale stimato: <strong className="text-red-400">250–500€</strong> a pratica</p>
                  <p className="text-red-400/80 text-sm font-medium">⏳ Tempi: da <strong className="text-red-400">3 a 15 giorni</strong></p>
                </div>
              </div>
            </div>

            {/* Card destra - Pratica Rapida (vincente) */}
            <div className="rounded-2xl p-8 relative overflow-hidden md:scale-105 shadow-2xl border-2" style={{ borderColor: PR_GREEN, backgroundColor: `${PR_GREEN}08` }}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: PR_GREEN }} />
              <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full text-white font-bold" style={{ backgroundColor: PR_GREEN }}>✨ CONSIGLIATO</span>
              <span className="inline-block text-xs px-3 py-1 rounded-full mb-6 font-semibold tracking-wide" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>PRATICA RAPIDA</span>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6" style={{ color: PR_GREEN }} /> Pratica Rapida
              </h3>
              <ul className="space-y-4">
                {[
                  "Ci diamo noi i documenti del cliente",
                  "Contattiamo noi il cliente a nome tuo",
                  "Solo 65€ a pratica, zero canoni",
                  "Non devi fare NIENTE",
                  "Pratica consegnata in 24 ore",
                  "Assicurazione su ogni pratica",
                  "Il tuo staff torna a vendere",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-white/90 text-base">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: PR_GREEN }} />
                    {item}
                  </li>
                ))}
              </ul>
              {/* Footer prezzo */}
              <div className="mt-8 pt-6 border-t" style={{ borderColor: `${PR_GREEN}30` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-bold" style={{ color: PR_GREEN }}>65€</span>
                    <span className="text-white/50 text-sm ml-2">a pratica</span>
                  </div>
                  <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ backgroundColor: `${PR_GREEN}20`, color: PR_GREEN }}>⚡ 24h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Prezzi (BIANCO) ── */}
      <Section id="prezzi" light>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-gray-400 text-sm mb-3">Il prezzo che cambia tutto</p>
          <p className="text-gray-500 text-lg mb-2">Non 200€. Non 150€. Non 100€.</p>
          <h2 ref={priceCounter.ref} className="text-5xl md:text-7xl font-bold mb-4 text-gray-900">
            <span style={{ color: PR_GREEN }}>{priceCounter.count}€</span> a pratica completata
          </h2>
          <p className="text-gray-500 text-lg mb-2">Tutto incluso, nessun canone</p>
          <p className="text-gray-400 text-sm mb-10">
            Mentre i tuoi concorrenti pagano 1.000€ per un software che fa 3 pratiche, tu con lo stesso budget ne fai 15. E non devi muovere un dito.
          </p>

          <div className="grid md:grid-cols-2 gap-8 text-left mb-10">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 card-hover-glow">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-900">
                <CheckCircle2 className="w-5 h-5" style={{ color: PR_GREEN }} /> Tutto quello che ottieni
              </h3>
              <ul className="space-y-2.5">
                {[
                  "Gestione completa della Pratica ENEA — noi facciamo tutto",
                  "Area riservata personale per la tua azienda",
                  "Basta inserire il numero di telefono del cliente",
                  "Contattiamo il cliente a nome della tua azienda",
                  "Raccogliamo noi tutti i documenti necessari",
                  "Pratica ENEA consegnata in 24 ore",
                  "Consegna sia a te che al tuo cliente",
                  "Assicurazione a Garanzia Blindata su ogni pratica",
                  "Nessun canone, nessun abbonamento, nessun software da comprare",
                  "Paghi solo a pratica completata: 65€",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-gray-500 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: PR_GREEN }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 card-hover-glow">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-900">
                <XCircle className="w-5 h-5 text-red-400" /> Cosa NON devi più fare
              </h3>
              <ul className="space-y-2.5">
                {[
                  "Raccogliere documenti catastali",
                  "Inseguire clienti per fatture e certificazioni",
                  "Compilare moduli e piattaforme",
                  "Pagare software da 1.000€+ con 3 pratiche incluse",
                  "Fare il lavoro sporco per un fornitore \"low cost\"",
                  "Dire ai clienti \"se la faccia lei\" e perderli",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-gray-500 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Link to="/auth" className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-all animate-pulse-glow hover:brightness-110" style={{ backgroundColor: PR_GREEN }}>
            Attiva Pratica Rapida Adesso <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-gray-400 text-sm mt-3">Nessun costo iniziale. Paghi solo a pratica effettuata.</p>
        </div>
      </Section>

      {/* ── Garanzie (SCURO) ── */}
      <Section className="bg-[#0d1a2d]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-14">
            Due garanzie che{" "}
            <span style={{ color: PR_GREEN }}>nessun altro</span> ti offre
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0f1d32] rounded-xl p-8 card-hover-glow" style={{ borderWidth: 1, borderColor: `${PR_GREEN}30` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: `${PR_GREEN}15` }}>
                <Shield className="w-6 h-6" style={{ color: PR_GREEN }} />
              </div>
              <h3 className="text-xl font-bold mb-3">Garanzia #1: Assicurazione Blindata</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                Ogni pratica che gestiamo è coperta dalla nostra assicurazione. Se dovesse esserci un errore — qualsiasi errore — ci prendiamo noi la piena responsabilità. Nessun costo aggiuntivo per te. Nessun rischio. Nessuna preoccupazione. Dormi tranquillo sapendo che le pratiche dei tuoi clienti sono in mani sicure e assicurate.
              </p>
            </div>
            <div className="bg-[#0f1d32] rounded-xl p-8 card-hover-glow" style={{ borderWidth: 1, borderColor: `${PR_GREEN}30` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: `${PR_GREEN}15` }}>
                <CreditCard className="w-6 h-6" style={{ color: PR_GREEN }} />
              </div>
              <h3 className="text-xl font-bold mb-3">Garanzia #2: Paghi Solo a Pratica Effettuata</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                Non ti chiediamo un euro prima. Nessun canone mensile. Nessun abbonamento. Nessun costo di attivazione. Paghi solo ed esclusivamente quando la pratica è completata e consegnata. Se non facciamo pratiche, non paghi nulla. Il rischio è tutto nostro.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Chi c'è dietro (BIANCO) ── */}
      <Section light>
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold mb-8 text-gray-900">
                Chi c'è dietro <span style={{ color: PR_GREEN }}>Pratica Rapida</span>?
              </h2>
              <div className="space-y-4 text-gray-500 leading-relaxed">
                <p>Non siamo l'ennesima startup che ha scoperto ieri cosa sia una pratica ENEA.</p>
                <p>Pratica Rapida è nata dall'esperienza diretta nel settore degli infissi, delle tende da sole, delle pergole e dei serramenti. Conosciamo le vostre sfide perché le abbiamo vissute in prima persona. Sappiamo cosa significa perdere una vendita per un cavillo burocratico. Sappiamo cosa significa inseguire un cliente per un documento catastale.</p>
                <p>Ed è proprio per questo che abbiamo costruito un servizio che elimina completamente questo problema dalla vostra vita lavorativa. Un servizio pensato da chi lavora nel vostro settore, per chi lavora nel vostro settore.</p>
                <p>Il nostro team è composto da professionisti specializzati nella gestione delle pratiche ENEA. Ogni pratica è seguita con cura, verificata e assicurata. Ci presentiamo a nome della vostra azienda e trattiamo i vostri clienti come se fossero i nostri — perché per noi, lo sono.</p>
              </div>
              <p className="mt-6 font-semibold text-lg italic" style={{ color: PR_GREEN }}>
                "Permetterti di offrire un servizio completo ai tuoi clienti senza aggiungere un solo minuto di lavoro alla tua giornata."
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <img src={teamImg} alt="Il team di Pratica Rapida" className="w-full h-auto" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── CTA Finale (SCURO) ── */}
      <Section className="bg-[#0d1a2d]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Sei pronto a smettere di{" "}
            <span style={{ color: PR_GREEN }}>perdere vendite</span>?
          </h2>
          <p className="text-white/60 text-lg mb-2">Attiva Pratica Rapida Oggi.</p>
          <p className="text-white/50 mb-4">Domani i tuoi clienti saranno più felici.</p>
          <p className="text-white/50 mb-8">
            Zero rischi. Zero costi anticipati. Zero lavoro da parte tua. Solo pratiche ENEA gestite in 24 ore a 65€ l'una, con assicurazione inclusa.
          </p>
          <Link to="/auth" className="inline-flex items-center gap-2 text-white font-bold text-lg px-10 py-4 rounded-lg transition-all animate-pulse-glow hover:brightness-110" style={{ backgroundColor: PR_GREEN }}>
            Contattaci e Attiva il Servizio <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-white/30 text-sm mt-3">Risponderemo entro poche ore. Nessun impegno.</p>

          <div className="mt-12 bg-[#0f1d32] border border-white/10 rounded-xl p-8 text-left max-w-3xl mx-auto">
            <p className="text-white/40 text-sm leading-relaxed mb-4">
              <strong className="text-white/60">P.S.</strong> — Se stai ancora pensando "ma i miei clienti se la cavano da soli con la pratica ENEA"… chiediti questo: quanti di loro tornano da te per il secondo acquisto? Quanti ti mandano referenze? Il servizio post-vendita è quello che costruisce la fedeltà. E la gestione della pratica ENEA è il servizio post-vendita più facile e redditizio che puoi offrire. A 65€.
            </p>
            <p className="text-white/40 text-sm leading-relaxed">
              <strong className="text-white/60">P.P.S.</strong> — E se stai già gestendo le pratiche con un altro fornitore, fai un semplice calcolo: quanto ti costa veramente ogni pratica tra canoni software, ore del personale, telefonate e stress? Poi confronta quel numero con 65€ e zero lavoro. La scelta è ovvia.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Footer (BIANCO) ── */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8">
            {/* Logo + dati aziendali */}
            <div className="space-y-3">
              <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-8 w-auto" />
              <div className="space-y-1.5 text-sm text-gray-500">
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4" style={{ color: PR_GREEN }} />
                  +39 351 7935227
                </p>
                <p className="flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: PR_GREEN }} />
                  modulistica@praticarapida.it
                </p>
                <p className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" style={{ color: PR_GREEN }} />
                  Lissone (MB)
                </p>
                <p className="text-xs text-gray-400">P.IVA 03937130791</p>
              </div>
            </div>
            {/* Link navigazione */}
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#come-funziona" className="hover:text-gray-800 transition-colors">Come Funziona</a>
              <a href="#confronto" className="hover:text-gray-800 transition-colors">Confronto</a>
              <a href="#prezzi" className="hover:text-gray-800 transition-colors">Prezzi</a>
              <Link to="/auth" className="hover:text-gray-800 transition-colors">Accedi</Link>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Pratica Rapida. Tutti i diritti riservati.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
