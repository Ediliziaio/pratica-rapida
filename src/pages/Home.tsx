import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  Users,
  Clock,
  Shield,
  CreditCard,
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText,
  BarChart3,
  AlertTriangle,
  Zap,
  Star,
  Headphones,
  ChevronRight,
  Gift,
  Building2,
  Target,
  TrendingDown,
  DollarSign,
  Monitor,
} from "lucide-react";

function useScrollFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landing-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useScrollFadeIn();
  return (
    <section ref={ref} id={id} className={`landing-fade-in py-20 md:py-28 ${className}`}>
      {children}
    </section>
  );
}

/* ── Floating Icons ── */
function FloatingIcons() {
  return (
    <>
      <div className="hidden lg:block fixed left-6 top-1/4 z-0 opacity-10">
        <FileText className="w-10 h-10 text-emerald-400 mb-12" />
        <BarChart3 className="w-8 h-8 text-emerald-400 mb-14" />
        <Building2 className="w-9 h-9 text-emerald-400" />
      </div>
      <div className="hidden lg:block fixed right-6 top-1/3 z-0 opacity-10">
        <Shield className="w-10 h-10 text-emerald-400 mb-12" />
        <Target className="w-8 h-8 text-emerald-400 mb-14" />
        <Star className="w-9 h-9 text-emerald-400" />
      </div>
    </>
  );
}

/* ── Dashboard Mockup ── */
function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-4xl mt-14 rounded-xl border border-white/10 bg-[#101d30] shadow-2xl overflow-hidden">
      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-[#0c1727] border-r border-white/5 flex flex-col items-center py-4 gap-4">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center"><Shield className="w-4 h-4 text-emerald-400" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><Users className="w-4 h-4 text-white/40" /></div>
      </div>
      {/* Content */}
      <div className="ml-12 p-6">
        <p className="text-white/40 text-xs mb-0.5">Benvenuto</p>
        <p className="text-white font-semibold text-sm mb-5">Dashboard</p>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: FileText, label: "Pratiche Totali", value: "284", color: "text-blue-400" },
            { icon: CheckCircle2, label: "Completate", value: "218", color: "text-emerald-400" },
            { icon: Clock, label: "In Lavorazione", value: "42", color: "text-amber-400" },
            { icon: CreditCard, label: "Risparmio", value: "€ 18.400", color: "text-purple-400" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#0c1727] rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                <span className="text-white/50 text-[10px]">{kpi.label}</span>
              </div>
              <span className="text-white font-bold text-lg">{kpi.value}</span>
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[#0c1727] rounded-lg p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-3">Pratiche Recenti</p>
            <div className="space-y-2">
              {[
                { id: "PR-0147", client: "Rossi Mario", amount: "€ 65", status: "In Lavorazione", statusColor: "bg-amber-500/20 text-amber-400" },
                { id: "PR-0146", client: "Bianchi & Figli", amount: "€ 65", status: "Completata", statusColor: "bg-emerald-500/20 text-emerald-400" },
                { id: "PR-0145", client: "Condominio Via Roma", amount: "€ 65", status: "In Attesa", statusColor: "bg-blue-500/20 text-blue-400" },
              ].map((row) => (
                <div key={row.id} className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-mono">{row.id}</span>
                  <span className="text-white/70 flex-1 ml-3">{row.client}</span>
                  <span className="text-white/60 mr-3">{row.amount}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${row.statusColor}`}>{row.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#0c1727] rounded-lg p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-3">Statistiche Mensili</p>
            <div className="flex items-end gap-1 h-20">
              {[35, 48, 60, 42, 55, 72, 65].map((h, i) => (
                <div key={i} className="flex-1 bg-emerald-500/30 rounded-t" style={{ height: `${h}%` }} />
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

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a1628] text-white font-sans relative overflow-x-hidden">
      <FloatingIcons />

      {/* ── Top Banner ── */}
      <div className="bg-emerald-500 text-white text-center py-2 text-xs md:text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
        <Gift className="w-4 h-4" />
        ZERO VINCOLI. PAGHI SOLO A PRATICA COMPLETATA.
      </div>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#0a1628]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/home" className="flex items-center gap-2">
            <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-8" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#come-funziona" className="hover:text-white transition-colors">Come Funziona</a>
            <a href="#confronto" className="hover:text-white transition-colors">Confronto</a>
            <a href="#prezzi" className="hover:text-white transition-colors">Prezzi</a>
            <Link to="/auth" className="hover:text-white transition-colors">Accedi</Link>
          </div>
          <Link to="/auth" className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
            Attiva Ora
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-16 pb-8 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <span className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-wide">
            PER AZIENDE DI INFISSI, TENDE, PERGOLE E SERRAMENTI
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
            Quante Vendite Stai Perdendo Perché Non Gestisci le{" "}
            <span className="text-emerald-400">Pratiche ENEA</span>?
          </h1>

          <DashboardMockup />

          <p className="text-white/60 max-w-3xl mx-auto mt-10 text-base md:text-lg leading-relaxed">
            Scopri come le aziende più furbe del tuo settore stanno chiudendo più contratti, eliminando le obiezioni dei clienti e distruggendo la concorrenza — con un servizio che costa appena <strong className="text-white">65€ a pratica</strong> e non richiede NESSUN lavoro da parte tua.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link to="/auth" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-colors flex items-center gap-2">
              Attiva Pratica Rapida <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#come-funziona" className="border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-colors">
              Scopri Come Funziona
            </a>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-12">
            {[
              { icon: DollarSign, label: "65€/pratica" },
              { icon: Clock, label: "24h Consegna" },
              { icon: Headphones, label: "Supporto Italiano" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-white/50 text-sm">
                <s.icon className="w-4 h-4 text-emerald-400" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Il Problema ── */}
      <Section id="problema">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-8">
            Sai qual è il modo più veloce per{" "}
            <span className="text-emerald-400">perdere un cliente</span> nel 2025?
          </h2>
          <p className="text-white/60 text-center max-w-3xl mx-auto text-lg mb-6">
            Dirgli: <em className="text-white">"La pratica ENEA? Ah, quella se la deve fare lei."</em>
          </p>
          <p className="text-white/50 text-center max-w-3xl mx-auto leading-relaxed mb-4">
            Il cliente non vuole pensare alla burocrazia. Vuole che qualcuno gli risolva il problema. E chi glielo risolve… si prende la vendita.
          </p>
          <p className="text-white/50 text-center max-w-3xl mx-auto leading-relaxed mb-12">
            Domanda scomoda: quante vendite hai perso negli ultimi 12 mesi per questa ragione? 5? 10? 20? Fai il conto in euro. Quanti soldi sono rimasti sul tavolo perché non offrivi un servizio che avresti potuto attivare per soli <strong className="text-white">65€ a pratica</strong>?
          </p>

          <h3 className="text-2xl md:text-3xl font-bold text-center mb-10">
            Le 2 trappole in cui cadono il 90% delle aziende
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Trappola 1 */}
            <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                </div>
                <h4 className="text-lg font-bold">Trappola #1: Il Fornitore "Low Cost"</h4>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                Ti dicono che il prezzo è basso (50–200€). Peccato che poi il lavoro sporco lo devi fare TU. Sei tu che devi raccogliere i contatti, inseguire il cliente per i documenti catastali, procurarti le fatture e le certificazioni. Alla fine stai spendendo 3–5 volte di più di quanto pensi.
              </p>
            </div>
            {/* Trappola 2 */}
            <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-red-400" />
                </div>
                <h4 className="text-lg font-bold">Trappola #2: Il Software "Premium"</h4>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                Ti vendono un software con un canone annuale da capogiro — più di 1.000€ — e poi scopri la beffa: ti fanno massimo 3 pratiche ENEA incluse. È come comprare una Ferrari per andare a prendere il pane.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Come Funziona ── */}
      <Section id="come-funziona" className="bg-[#0d1a2d]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">
            Come funziona? È{" "}
            <span className="text-emerald-400">imbarazzantemente semplice</span>.
          </h2>
          <p className="text-white/50 text-center mb-14 text-lg">Tre passi. Zero sforzo.</p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: Phone,
                title: "Inserisci il numero di telefono",
                desc: "Accedi alla tua area riservata e inserisci il numero del tuo cliente. Fine. Questo è TUTTO quello che devi fare.",
              },
              {
                step: "02",
                icon: Users,
                title: "Contattiamo il cliente a nome tuo",
                desc: "Il nostro team chiama il tuo cliente presentandosi come parte della tua azienda. Raccogliamo noi tutti i documenti necessari.",
              },
              {
                step: "03",
                icon: Zap,
                title: "In 24 ore la pratica è pronta",
                desc: "Entro 24 ore, sia tu che il tuo cliente ricevete la Pratica ENEA completa e pronta. Nessun ritardo. Nessun sollecito.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-[#0f1d32] border border-white/10 rounded-xl p-8 text-center relative">
                <span className="absolute top-4 right-4 text-emerald-500/20 text-4xl font-bold">{item.step}</span>
                <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                  <item.icon className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold mb-3">{item.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Confronto ── */}
      <Section id="confronto">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-14">
            Il <span className="text-emerald-400">Confronto</span> che parla da solo
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left — Quello che hai */}
            <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-8">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" /> Quello che hai adesso
              </h3>
              <ul className="space-y-3">
                {[
                  "Raccogli tu i documenti del cliente",
                  "Insegui tu il cliente per dati mancanti",
                  "Paghi 1.000€+ per software con 3 pratiche",
                  "Oppure 50-200€ ma fai tutto tu",
                  "Tempi lunghi e incerti",
                  "Zero garanzia sugli errori",
                  "Il tuo staff perde ore in burocrazia",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white/50 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Right — Pratica Rapida */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Pratica Rapida
              </h3>
              <ul className="space-y-3">
                {[
                  "Ci diamo noi i documenti del cliente",
                  "Contattiamo noi il cliente a nome tuo",
                  "Solo 65€ a pratica, zero canoni",
                  "Non devi fare NIENTE",
                  "Pratica consegnata in 24 ore",
                  "Assicurazione su ogni pratica",
                  "Il tuo staff torna a vendere",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white/90 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Prezzi ── */}
      <Section id="prezzi" className="bg-[#0d1a2d]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-white/40 text-sm mb-3">Il prezzo che cambia tutto</p>
          <p className="text-white/50 text-lg mb-2">Non 200€. Non 150€. Non 100€.</p>
          <h2 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="text-emerald-400">65€</span> a pratica completata
          </h2>
          <p className="text-white/50 text-lg mb-10">Tutto incluso, nessun canone</p>

          <div className="grid md:grid-cols-2 gap-8 text-left mb-10">
            <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-8">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Tutto quello che ottieni
              </h3>
              <ul className="space-y-2.5">
                {[
                  "Gestione completa della Pratica ENEA",
                  "Area riservata personale per la tua azienda",
                  "Basta inserire il numero di telefono del cliente",
                  "Contattiamo il cliente a nome della tua azienda",
                  "Raccogliamo noi tutti i documenti necessari",
                  "Pratica ENEA consegnata in 24 ore",
                  "Consegna sia a te che al tuo cliente",
                  "Assicurazione a Garanzia Blindata su ogni pratica",
                  "Nessun canone, nessun abbonamento",
                  "Paghi solo a pratica completata: 65€",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#0f1d32] border border-white/10 rounded-xl p-8">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" /> Cosa NON devi più fare
              </h3>
              <ul className="space-y-2.5">
                {[
                  "Raccogliere documenti catastali",
                  "Inseguire clienti per fatture e certificazioni",
                  "Compilare moduli e piattaforme",
                  "Pagare software da 1.000€+ con 3 pratiche incluse",
                  "Fare il lavoro sporco per un fornitore 'low cost'",
                  "Dire ai clienti 'se la faccia lei' e perderli",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white/50 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Link to="/auth" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 py-3.5 rounded-lg text-base transition-colors">
            Attiva Pratica Rapida Adesso <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-white/30 text-sm mt-3">Nessun costo iniziale. Paghi solo a pratica effettuata.</p>
        </div>
      </Section>

      {/* ── Garanzie ── */}
      <Section>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-14">
            Due garanzie che{" "}
            <span className="text-emerald-400">nessun altro</span> ti offre
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0f1d32] border border-emerald-500/20 rounded-xl p-8">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Garanzia #1: Assicurazione Blindata</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                Ogni pratica che gestiamo è coperta dalla nostra assicurazione. Se dovesse esserci un errore — qualsiasi errore — ci prendiamo noi la piena responsabilità. Nessun costo aggiuntivo per te. Nessun rischio. Dormi tranquillo.
              </p>
            </div>
            <div className="bg-[#0f1d32] border border-emerald-500/20 rounded-xl p-8">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5">
                <CreditCard className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Garanzia #2: Paghi Solo a Pratica Effettuata</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                Non ti chiediamo un euro prima. Nessun canone mensile. Nessun abbonamento. Nessun costo di attivazione. Paghi solo ed esclusivamente quando la pratica è completata e consegnata. Il rischio è tutto nostro.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Chi c'è dietro ── */}
      <Section className="bg-[#0d1a2d]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-8">
            Chi c'è dietro <span className="text-emerald-400">Pratica Rapida</span>?
          </h2>
          <p className="text-white/50 text-lg leading-relaxed mb-6">
            Non siamo l'ennesima startup che ha scoperto ieri cosa sia una pratica ENEA. Pratica Rapida è nata dall'esperienza diretta nel settore degli infissi, delle tende da sole, delle pergole e dei serramenti. Conosciamo le vostre sfide perché le abbiamo vissute in prima persona.
          </p>
          <p className="text-white/50 leading-relaxed mb-6">
            Il nostro team è composto da professionisti specializzati nella gestione delle pratiche ENEA. Ogni pratica è seguita con cura, verificata e assicurata. Ci presentiamo a nome della vostra azienda e trattiamo i vostri clienti come se fossero i nostri.
          </p>
          <p className="text-white/70 font-semibold text-lg italic">
            "Permetterti di offrire un servizio completo ai tuoi clienti senza aggiungere un solo minuto di lavoro alla tua giornata."
          </p>
        </div>
      </Section>

      {/* ── CTA Finale ── */}
      <Section>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Sei pronto a smettere di{" "}
            <span className="text-emerald-400">perdere vendite</span>?
          </h2>
          <p className="text-white/50 text-lg mb-4">
            Ogni giorno che passi senza questo servizio, è un giorno in cui il tuo concorrente ti sta rubando clienti.
          </p>
          <p className="text-white/50 mb-8">
            Zero rischi. Zero costi anticipati. Zero lavoro da parte tua. Solo pratiche ENEA gestite in 24 ore a 65€ l'una, con assicurazione inclusa.
          </p>
          <Link to="/auth" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg px-10 py-4 rounded-lg transition-colors">
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

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-6" />
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <a href="#come-funziona" className="hover:text-white/70 transition-colors">Come Funziona</a>
            <a href="#confronto" className="hover:text-white/70 transition-colors">Confronto</a>
            <a href="#prezzi" className="hover:text-white/70 transition-colors">Prezzi</a>
            <Link to="/auth" className="hover:text-white/70 transition-colors">Accedi</Link>
          </div>
          <p className="text-white/20 text-xs">© 2025 Pratica Rapida. Tutti i diritti riservati.</p>
        </div>
      </footer>
    </div>
  );
}
