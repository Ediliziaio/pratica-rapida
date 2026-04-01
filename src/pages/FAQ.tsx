import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { MessageCircle, Phone, ArrowRight, ChevronDown } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

const categories = [
  { id: "generale", label: "Generale" },
  { id: "enea", label: "Pratiche ENEA" },
  { id: "ct", label: "Conto Termico" },
  { id: "prezzi", label: "Prezzi e Pagamenti" },
];

const faqs: { cat: string; q: string; a: string }[] = [
  // GENERALE
  { cat: "generale", q: "Come funziona Pratica Rapida?", a: "Pratica Rapida è il tuo ufficio pratiche esterno. Tu inserisci i dati del tuo cliente nel nostro portale, noi chiamiamo il cliente a nome tuo, raccogliamo tutti i documenti necessari e trasmettiamo la pratica all'ente competente (ENEA o GSE) entro 48–72 ore." },
  { cat: "generale", q: "Chi può usare il servizio?", a: "Il servizio è rivolto a installatori, rivenditori e aziende che effettuano lavori di efficienza energetica: serramenti, schermature solari, fotovoltaico, pompe di calore, solare termico e altri interventi agevolati." },
  { cat: "generale", q: "Il mio cliente saprà che usate un servizio esterno?", a: "No. Chiamiamo il tuo cliente presentandoci come il tuo ufficio tecnico o ufficio pratiche. Il cliente non saprà mai che siamo un fornitore esterno. La relazione commerciale rimane tua." },
  { cat: "generale", q: "Il servizio è disponibile in tutta Italia?", a: "Sì, operiamo su tutto il territorio nazionale. Essendo un servizio completamente digitale, non ci sono limitazioni geografiche." },
  { cat: "generale", q: "Devo firmare un contratto vincolante?", a: "No. Puoi attivare e disattivare il servizio in qualsiasi momento. Non ci sono minimi mensili, contratti annuali o penali di uscita. Paghi solo quello che usi." },
  { cat: "generale", q: "Come ricevo le pratiche completate?", a: "Attraverso la tua area riservata nel portale Pratica Rapida e via email. Sia tu che il tuo cliente ricevete la documentazione completa in formato digitale." },
  { cat: "generale", q: "Posso provare il servizio con una sola pratica?", a: "Assolutamente sì. Non c'è nessun obbligo di volume. Registrati, inserisci la tua prima pratica e decidi se continuare. Non ti chiediamo nulla in anticipo." },
  { cat: "generale", q: "Come posso iniziare?", a: "Registrati gratuitamente sul nostro portale, inserisci i dati del primo cliente e lascia fare a noi. Sei operativo in meno di due minuti." },

  // ENEA
  { cat: "enea", q: "Cos'è la comunicazione ENEA e chi deve farla?", a: "La comunicazione ENEA è obbligatoria per accedere alle detrazioni fiscali del 50% o 65% (Ecobonus) per interventi di riqualificazione energetica. Deve essere trasmessa dall'impresa installatrice o dal committente entro 90 giorni dal collaudo dei lavori." },
  { cat: "enea", q: "Per quali interventi è necessaria la pratica ENEA?", a: "Serramenti e infissi, schermature solari, pompe di calore per riscaldamento, fotovoltaico con accumulo, vetrate panoramiche, isolamento termico dell'involucro e tutti gli interventi previsti dall'Ecobonus. Nota: le caldaie a condensazione non sono più detraibili ai fini ENEA." },
  { cat: "enea", q: "Entro quanto tempo va trasmessa la pratica ENEA?", a: "Entro 90 giorni dalla data di fine lavori (collaudo). Noi la trasmettiamo entro 24 ore lavorative dalla raccolta completa della documentazione, garantendo sempre il rispetto della scadenza." },
  { cat: "enea", q: "Cosa succede se la pratica ENEA viene trasmessa in ritardo?", a: "Il cliente perde il diritto alla detrazione fiscale. Per questo lavoriamo con rapidità: una volta che abbiamo i documenti completi, la pratica viene trasmessa entro 24 ore." },
  { cat: "enea", q: "Quali documenti servono per la pratica ENEA?", a: "Generalmente: fattura di acquisto e posa, scheda tecnica del prodotto installato con valori termici, foto dell'installazione, dati catastali dell'immobile e codice fiscale del proprietario. Raccogliamo noi tutto direttamente dal tuo cliente." },
  { cat: "enea", q: "La pratica ENEA garantisce automaticamente la detrazione al cliente?", a: "La comunicazione ENEA è una condizione necessaria ma non sufficiente. Il cliente deve anche rispettare i requisiti tecnici del prodotto installato e le condizioni previste dall'Agenzia delle Entrate per la propria dichiarazione dei redditi." },
  { cat: "enea", q: "Cosa succede se c'è un errore nella pratica?", a: "Ogni pratica è coperta da assicurazione RC professionale. In caso di errore imputabile a noi, lo correggiamo immediatamente e gratuitamente. La responsabilità è nostra, non tua." },

  // CONTO TERMICO
  { cat: "ct", q: "Cos'è il Conto Termico e chi può accedervi?", a: "Il Conto Termico (DM 16/02/2016) è un incentivo statale gestito dal GSE che eroga un contributo diretto in denaro per interventi di efficienza energetica termica. Possono accedervi i privati che hanno installato caldaie a condensazione, pompe di calore, solare termico e altri impianti ammessi." },
  { cat: "ct", q: "Quali impianti sono ammessi al Conto Termico?", a: "Caldaie a condensazione, pompe di calore (aria-acqua, aria-aria, geotermiche), collettori solari termici, sistemi ibridi pompa di calore + caldaia, generatori a biomassa, sistemi di building automation (BACS) e, per le PA, anche interventi sull'involucro edilizio." },
  { cat: "ct", q: "Entro quanto tempo va inviata la pratica al GSE?", a: "Entro 90 giorni dalla fine dei lavori. Noi gestiamo l'invio entro 72 ore dalla raccolta completa della documentazione, garantendo sempre il rispetto della scadenza." },
  { cat: "ct", q: "Quanto vale il contributo del Conto Termico?", a: "Il valore dipende dal tipo di impianto, dalla potenza installata e dalla zona climatica. In media si va da poche centinaia a qualche migliaio di euro. Ti inviamo una stima indicativa gratuita prima di procedere con la pratica." },
  { cat: "ct", q: "Come viene pagato il contributo al cliente?", a: "Il GSE eroga il contributo direttamente al beneficiario (il tuo cliente) tramite bonifico bancario, suddiviso in rate annuali per un periodo di 2–5 anni a seconda dell'intervento e dell'importo totale." },
  { cat: "ct", q: "Cosa succede se la pratica viene respinta dal GSE?", a: "Con il nostro servizio non accade: la documentazione viene preparata secondo ogni requisito tecnico del GSE e verificata prima dell'invio. In ogni caso, ogni pratica è coperta da RC professionale e, se ci fosse un nostro errore, lo correggiamo gratuitamente." },
  { cat: "ct", q: "Devo fornire la documentazione tecnica degli impianti?", a: "No. Chiamiamo il tuo cliente a nome tuo e raccogliamo noi tutta la documentazione: schede tecniche del prodotto, fatture, verbali di collaudo, dati catastali e tutto il resto." },

  // PREZZI
  { cat: "prezzi", q: "Quanto costa la pratica ENEA?", a: "65€ a pratica completata, IVA esclusa. Il pagamento avviene solo quando la pratica è stata effettivamente trasmessa e consegnata. Zero costi se la pratica non va a buon fine per motivi a noi imputabili." },
  { cat: "prezzi", q: "Quanto costa la pratica Conto Termico?", a: "250€ a pratica completata, IVA esclusa. Il costo riflette la complessità maggiore della procedura GSE rispetto a una semplice comunicazione ENEA. Nessun costo di attivazione, nessun canone." },
  { cat: "prezzi", q: "Ci sono canoni mensili o costi fissi?", a: "No. Il modello è completamente a consumo: paghi solo quando una pratica viene completata. Nessun abbonamento, nessun minimo garantito, nessuna penale se non usi il servizio per un mese." },
  { cat: "prezzi", q: "Come avviene il pagamento?", a: "A fine mese emettiamo un'unica fattura riepilogativa con tutte le pratiche completate nel mese. Paghi solo per quelle effettivamente consegnate, senza nessun anticipo." },
  { cat: "prezzi", q: "Posso ricevere fattura?", a: "Sì. Emettiamo regolare fattura elettronica a fine mese sul numero di pratiche completate nel periodo." },
  { cat: "prezzi", q: "Esiste un costo di attivazione o una fee di registrazione?", a: "No. La registrazione al portale è completamente gratuita. Non paghiamo mai nulla prima di aver completato il lavoro." },
];

function FAQItem({ faq, index }: { faq: typeof faqs[0]; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="border-b border-border last:border-0"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="font-semibold text-base text-foreground group-hover:text-[hsl(var(--pr-green))] transition-colors leading-snug">
          {faq.q}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="shrink-0 mt-0.5"
        >
          <ChevronDown size={18} className="text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="text-muted-foreground text-sm leading-relaxed pb-5">{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState("generale");
  const filtered = faqs.filter((f) => f.cat === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Domande Frequenti su Pratiche ENEA e Conto Termico"
        description="Risposte a tutte le domande su Pratica Rapida: come funziona, pratiche ENEA, Conto Termico GSE, prezzi e pagamenti. Tutto quello che devi sapere."
        canonical="/faq"
        jsonLd={faqJsonLd}
      />
      <Navbar />

      {/* Hero */}
      <section
        className="relative pt-32 pb-20 overflow-hidden"
        style={{ background: "linear-gradient(160deg, #f0fdf4 0%, #ffffff 50%, #f0f9ff 100%)" }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(ellipse, hsla(152,80%,50%,0.07) 0%, transparent 70%)", filter: "blur(40px)" }}
          />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
        </div>
        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-6"
              style={{ background: "hsla(152,70%,40%,0.10)", color: "hsl(152 60% 28%)", border: "1px solid hsla(152,70%,40%,0.22)" }}
            >
              FAQ
            </span>
            <h1 className="font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-foreground mb-5">
              Hai una domanda?
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(152 70% 30%) 0%, hsl(200 70% 35%) 100%)" }}
              >
                Abbiamo la risposta.
              </span>
            </h1>
            <p className="text-base sm:text-lg max-w-xl mx-auto text-muted-foreground">
              Tutto quello che devi sapere su Pratica Rapida, le pratiche ENEA, il Conto Termico e i prezzi.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main content */}
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4">

          {/* Category tabs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap gap-2 mb-10"
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={
                  activeCategory === cat.id
                    ? { background: "hsl(var(--pr-green))", color: "#fff" }
                    : { background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" }
                }
              >
                {cat.label}
              </button>
            ))}
          </motion.div>

          {/* FAQ list */}
          <div className="bg-card rounded-2xl border border-border px-5 sm:px-8">
            <AnimatePresence mode="wait">
              <motion.div key={activeCategory}>
                {filtered.map((faq, i) => (
                  <FAQItem key={faq.q} faq={faq} index={i} />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Contact CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-12 rounded-2xl p-7 sm:p-10 text-center border border-border bg-card"
          >
            <h3 className="font-bold text-xl sm:text-2xl text-foreground mb-2">
              Non trovi quello che cerchi?
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              Il nostro team risponde entro poche ore, dal lunedì al venerdì 9:00–18:00.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="tel:+390398682691"
                className="inline-flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-full text-sm transition-all hover:brightness-110 text-white"
                style={{ background: "hsl(var(--pr-green))" }}
              >
                <Phone size={15} /> Chiamaci adesso
              </a>
              <a
                href="mailto:modulistica@praticarapida.it"
                className="inline-flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-full text-sm border border-border text-foreground hover:bg-muted transition-all"
              >
                <MessageCircle size={15} /> Scrivici una email
              </a>
            </div>
          </motion.div>

          {/* Service links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              to="/pratica-enea"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors hover:underline"
              style={{ color: "hsl(var(--pr-green))" }}
            >
              Scopri le pratiche ENEA <ArrowRight size={14} />
            </Link>
            <Link
              to="/conto-termico"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Scopri il Conto Termico <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
