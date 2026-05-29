import { useState } from "react";
import { Navbar, Footer, WhatsAppButton, FinalCTA } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks } from "lucide-react";

const SECTIONS = [
  { id: "cosa-e", n: 1, title: "Cos'è il Conto Termico 3.0" },
  { id: "soggetti", n: 2, title: "Chi può accedere" },
  { id: "interventi", n: 3, title: "Interventi incentivati (Titolo III)" },
  { id: "requisiti", n: 4, title: "Requisiti e condizioni di accesso" },
  { id: "percentuali", n: 5, title: "Percentuali di incentivo" },
  { id: "accesso", n: 6, title: "Modalità di accesso" },
  { id: "mandato", n: 7, title: "Il Mandato all'Incasso" },
  { id: "fattura-bonifico", n: 8, title: "Fattura e bonifico" },
  { id: "documentazione", n: 9, title: "Documentazione necessaria" },
  { id: "checklist", n: 10, title: "Checklist pre-portale" },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Guida al Conto Termico 3.0 per installatori",
    description:
      "Guida operativa completa al Conto Termico 3.0 (D.M. 7 agosto 2025): soggetti ammessi, interventi, percentuali, requisiti, mandato all'incasso, fattura e bonifico, documentazione e checklist GSE.",
    author: { "@type": "Organization", name: "Pratica Rapida" },
    publisher: {
      "@type": "Organization",
      name: "Pratica Rapida",
      logo: { "@type": "ImageObject", url: "https://www.praticarapida.it/pratica-rapida-logo.png" },
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.praticarapida.it/" },
      { "@type": "ListItem", position: 2, name: "Conto Termico", item: "https://www.praticarapida.it/conto-termico" },
      { "@type": "ListItem", position: 3, name: "Guida al CT 3.0", item: "https://www.praticarapida.it/conto-termico/guida" },
    ],
  },
];

const interventi = [
  { code: "III.A", title: "Pompe di calore", color: "bg-emerald-600", desc: "Sostituzione impianto con PdC elettriche o a gas (aerotermica, idrotermica, geotermica) per riscaldamento e ACS.", novita: "Parametri SCOP/SPER per incentivo maggiore. Nuovi ambiti: piscine, processi industriali." },
  { code: "III.B", title: "Sistemi ibridi e bivalenti", color: "bg-emerald-600", desc: "Sistemi Factory Made (integrati) o bivalenti (caldaia + PdC) con regolazione certificata dal produttore o tecnico.", novita: "Ammesse PdC 'add on' su caldaie esistenti predisposte (max 5 anni di età)." },
  { code: "III.C", title: "Generatori a biomassa", color: "bg-amber-500", desc: "Caldaie a biomassa, stufe/termocamini a legna o pellet. Ammessi anche per serre e fabbricati rurali.", novita: "Ibridi biomassa + PdC ora ammessi. Processi produttivi e teleriscaldamento." },
  { code: "III.D", title: "Solare termico", color: "bg-amber-500", desc: "Installazione o sostituzione impianti solari termici per ACS e/o riscaldamento. Abbinabile a sistemi di solar cooling.", novita: "Ampliamento a processi produttivi e reti. Richiesta certificazione Solar Keymark." },
  { code: "III.E", title: "Scaldacqua a PdC", color: "bg-sky-600", desc: "Sostituzione scaldacqua elettrici o a gas con scaldacqua a pompa di calore. Richiesta classe energetica A o superiore.", novita: "Ora ammessa anche sostituzione da gas. Incentivi maggiorati per classe superiore." },
  { code: "III.F", title: "Teleriscaldamento", color: "bg-pink-600", desc: "Allaccio a sistemi di teleriscaldamento efficienti censiti nell'Anagrafica ARERA. Incentivo massimo: 65% della spesa.", novita: "Categoria interamente nuova nel CT 3.0." },
  { code: "III.G", title: "Microcogenerazione", color: "bg-purple-600", desc: "Produzione combinata elettrica e termica con impianti < 50 kW da fonti rinnovabili (biomassa, biogas, bioliquidi).", novita: "Categoria interamente nuova nel CT 3.0. Incentivo massimo: 65% della spesa." },
];

const docComuni = [
  "Fattura dettagliata con tutti gli elementi richiesti",
  "Ricevuta del bonifico ordinario con causale corretta",
  "Certificazione del produttore dell'apparecchiatura installata",
  "Dichiarazione di conformità dell'impianto (D.M. 37/2008)",
  "Certificato di avvenuto smaltimento del vecchio generatore",
  "Documentazione fotografica (min. 5-7 foto ante/durante/post operam)",
  "Asseverazione del tecnico abilitato (Modello 8)",
  "Dichiarazione spese sostenute (Modello 9)",
];

const checklist = [
  { group: "Accesso area clienti GSE", items: ["Registrazione Area Clienti GSE completata (SPID o credenziali)", "Operatore creato per il soggetto corretto (SA o SR)", "Servizio CT 3.0 sottoscritto (sezione Efficienza Energetica > FER-TER)", "Tutti i soggetti coinvolti registrati come Operatori"] },
  { group: "Anagrafica edificio", items: ["Dati catastali completi (comune, foglio, particella, subalterno)", "Indirizzo completo, destinazione d'uso e categoria catastale", "Superficie utile, zona climatica, anno di costruzione", "Titolo di disponibilità e visura catastale aggiornata"] },
  { group: "Identificazione soggetto", items: ["Soggetto Ammesso e Soggetto Responsabile identificati", "Tipologia SA determinata (PA, impresa, privato, ETS)", "Per imprese: dimensione e codice ATECO disponibili", "PEC del soggetto e referente tecnico identificato"] },
  { group: "Verifica finale", items: ["Tipo di accesso determinato (diretto o prenotazione)", "Modello 7 (fine lavori) o Modello 6 (avvio lavori) pronto", "Tutti gli allegati in PDF o P7M (max 25 MB)", "DSAN generata, firmata e ricaricata"] },
];

export default function GuidaCT() {
  const [indexOpen, setIndexOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Guida al Conto Termico 3.0 per Installatori | Pratica Rapida"
        description="Guida operativa completa al Conto Termico 3.0 (D.M. 7 agosto 2025): soggetti ammessi, interventi, percentuali, requisiti, mandato all'incasso, fattura, bonifico, documentazione e checklist GSE."
        canonical="/conto-termico/guida"
        keywords="guida conto termico 3.0, conto termico GSE, D.M. 7 agosto 2025, mandato all'incasso, bonifico conto termico, documentazione GSE, incentivi pompe di calore"
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="pt-16">
        {/* Hero */}
        <header className="bg-gradient-to-b from-emerald-900 to-emerald-800 text-white">
          <div className="max-w-5xl mx-auto px-4 py-12 md:py-16">
            <p className="text-emerald-200 text-sm font-semibold uppercase tracking-wide">
              Guida operativa per installatori e impiantisti
            </p>
            <h1 className="mt-2 text-3xl md:text-5xl font-bold tracking-tight">
              Conto Termico 3.0
            </h1>
            <p className="mt-4 max-w-2xl text-emerald-100 text-base md:text-lg">
              Tutto quello che serve sapere per gestire le pratiche del Conto Termico 3.0,
              basato sul D.M. 7 agosto 2025 e sulle Regole Applicative GSE.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
              {[
                { v: "65%", l: "Rimborso fino al (privati)" },
                { v: "90 giorni", l: "Erogazione dall'approvazione" },
                { v: "900 Mln", l: "Plafond annuale" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-white/20 bg-white/5 px-3 py-4 text-center">
                  <div className="text-xl md:text-2xl font-bold">{s.v}</div>
                  <div className="mt-1 text-[11px] md:text-xs text-emerald-200 leading-tight">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-4 py-10 lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
          {/* Indice */}
          <aside className="lg:sticky lg:top-20 lg:self-start mb-8 lg:mb-0">
            <div className="rounded-xl border border-border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 lg:cursor-default"
                onClick={() => setIndexOpen((v) => !v)}
                aria-expanded={indexOpen}
              >
                <span className="text-sm font-semibold text-foreground">Indice</span>
                <ChevronDown size={16} className={`lg:hidden transition-transform ${indexOpen ? "rotate-180" : ""}`} />
              </button>
              <nav className={`${indexOpen ? "block" : "hidden"} lg:block border-t border-border px-2 py-2`}>
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={() => setIndexOpen(false)}
                    className="flex items-start gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                      {s.n}
                    </span>
                    <span className="leading-tight">{s.title}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Contenuti */}
          <article className="max-w-3xl space-y-14 [&_h2]:scroll-mt-24">
            {/* 1 — Cos'è */}
            <section id="cosa-e">
              <SectionTitle n={1} title="Cos'è il Conto Termico 3.0" />
              <p className="text-muted-foreground leading-relaxed">
                Il Conto Termico 3.0 è un meccanismo di incentivazione statale, disciplinato dal{" "}
                <strong className="text-foreground">D.M. 7 agosto 2025</strong>, che premia gli interventi
                di efficientamento energetico e la produzione di energia termica da fonti rinnovabili. A
                differenza delle detrazioni fiscali, l'incentivo viene erogato tramite{" "}
                <strong className="text-foreground">bonifico diretto dal GSE</strong> (Gestore dei Servizi Energetici).
              </p>
              <h3 className="mt-6 mb-2 font-semibold text-foreground">Perché è importante per il tuo lavoro</h3>
              <ul className="space-y-2 text-muted-foreground">
                {[
                  "Rimborso diretto fino al 65% della spesa per i privati, fino al 100% per la Pubblica Amministrazione",
                  "Erogazione rapida: il GSE accredita l'incentivo entro 90 giorni dall'approvazione",
                  "Possibilità di applicare lo sconto immediato in fattura tramite il Mandato all'Incasso",
                  "Non è una detrazione fiscale: il cliente riceve denaro reale, non un credito da recuperare",
                  "Un'alternativa concreta al calo delle percentuali dei bonus edilizi tradizionali",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-6 mb-3 font-semibold text-foreground">Le due categorie di intervento</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="p-4">
                  <Badge variant="secondary" className="mb-2">Titolo II — Art. 5</Badge>
                  <p className="text-sm font-medium text-foreground mb-1">Efficienza energetica su edifici esistenti</p>
                  <p className="text-sm text-muted-foreground">Isolamento involucro, infissi e schermature solari, trasformazione in nZEB, illuminazione e building automation, fotovoltaico e colonnine (con PdC).</p>
                </Card>
                <Card className="p-4">
                  <Badge variant="secondary" className="mb-2">Titolo III — Art. 8</Badge>
                  <p className="text-sm font-medium text-foreground mb-1">Produzione energia termica rinnovabile</p>
                  <p className="text-sm text-muted-foreground">Pompe di calore, sistemi ibridi e bivalenti, generatori a biomassa, solare termico e scaldacqua a PdC, teleriscaldamento e microcogenerazione.</p>
                </Card>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { v: "500 Mln", l: "Privati", c: "bg-orange-500" },
                  { v: "400 Mln", l: "P.A.", c: "bg-sky-600" },
                  { v: "900 Mln", l: "Totale annuo", c: "bg-emerald-700" },
                ].map((b) => (
                  <div key={b.l} className={`${b.c} rounded-xl px-3 py-4 text-center text-white`}>
                    <div className="text-lg md:text-xl font-bold">{b.v}</div>
                    <div className="text-xs opacity-90">{b.l}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 2 — Soggetti */}
            <section id="soggetti">
              <SectionTitle n={2} title="Chi può accedere: soggetti ammessi" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                Il Conto Termico 3.0 è accessibile a diverse categorie di beneficiari. Ogni tipologia ha
                regole specifiche per interventi ammessi, percentuali di incentivo e modalità di accesso.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Beneficiario</TableHead>
                      <TableHead>Cat. Catastale</TableHead>
                      <TableHead>Titolo II</TableHead>
                      <TableHead>Titolo III</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>Pubblica Amministrazione</TableCell><TableCell>Tutte</TableCell><TableCell>SI</TableCell><TableCell>SI</TableCell></TableRow>
                    <TableRow><TableCell>Enti Terzo Settore</TableCell><TableCell>Tutte</TableCell><TableCell>SI</TableCell><TableCell>SI</TableCell></TableRow>
                    <TableRow><TableCell>Privati - Terziario</TableCell><TableCell>A/10, B, C, D, E</TableCell><TableCell>SI</TableCell><TableCell>SI</TableCell></TableRow>
                    <TableRow><TableCell>Privati - Residenziale</TableCell><TableCell>Cat. A (escl. A/8, A/9)</TableCell><TableCell>NO</TableCell><TableCell>SI</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mt-5">
                <Card className="p-4">
                  <p className="text-sm font-medium text-foreground mb-1">Soggetto Ammesso (SA)</p>
                  <p className="text-sm text-muted-foreground">Chi ha la disponibilità giuridica dell'edificio su cui si realizza l'intervento (proprietario o titolare di altro diritto reale o personale di godimento).</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm font-medium text-foreground mb-1">Soggetto Responsabile (SR)</p>
                  <p className="text-sm text-muted-foreground">Chi sostiene le spese, stipula il contratto con il GSE e richiede l'incentivo. Può coincidere con il SA, oppure essere una ESCo certificata UNI CEI 11352, una CER o un soggetto in PPP con la PA.</p>
                </Card>
              </div>
              <CalloutBox tone="warning" title="Attenzione: imprese ed ETS economici">
                <ul className="list-disc pl-4 space-y-1">
                  <li>Presentare una RICHIESTA PRELIMINARE prima dell'avvio lavori (Modello 4)</li>
                  <li>Per interventi Art. 5: APE obbligatoria pre e post, riduzione fabbisogno energia primaria min. 10%</li>
                  <li>Esclusa l'installazione di apparecchiature a combustibili fossili (compreso gas naturale)</li>
                  <li>Non ammesse le imprese in difficoltà o con ordine di recupero UE</li>
                </ul>
              </CalloutBox>
            </section>

            {/* 3 — Interventi */}
            <section id="interventi">
              <SectionTitle n={3} title="Interventi incentivati — Titolo III" />
              <p className="text-muted-foreground leading-relaxed mb-5">
                Il Conto Termico 3.0 potenzia gli incentivi per la produzione di energia termica da fonti
                rinnovabili, amplia le tecnologie ammesse e introduce nuove categorie. Le sette tipologie
                previste dall'Art. 8:
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {interventi.map((it) => (
                  <Card key={it.code} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`${it.color} text-white text-xs font-bold px-2 py-1 rounded`}>{it.code}</span>
                      <span className="font-semibold text-foreground">{it.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{it.desc}</p>
                    <p className="mt-2 text-xs text-emerald-700"><strong>Novità CT 3.0:</strong> {it.novita}</p>
                  </Card>
                ))}
              </div>
            </section>

            {/* 4 — Requisiti */}
            <section id="requisiti">
              <SectionTitle n={4} title="Requisiti e condizioni di accesso" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                Per accedere all'incentivo è necessario rispettare una serie di requisiti fondamentali.
                Verifica sempre questi punti prima di avviare qualsiasi intervento.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { t: "Immobile", d: "Accatastato ed esistente. Categoria F esclusa. Deve avere impianto di riscaldamento funzionante." },
                  { t: "Soggetti", d: "Titolari di un diritto reale o personale di godimento sull'immobile oggetto dell'intervento." },
                  { t: "Nuovo impianto", d: "Deve servire i medesimi ambienti dell'impianto sostituito. Requisiti da mantenere per 5 anni." },
                  { t: "Pagamenti", d: "Esclusivamente tracciabili. Bonifico ORDINARIO. NO bonifici per detrazioni fiscali." },
                  { t: "Impianti", d: "Nuovi o ricondizionati. Potenza termica ≤ 2 MW. Superficie solare termico ≤ 2.500 m²." },
                  { t: "Tempistiche", d: "Richiesta entro 90 giorni dalla fine lavori. Fine lavori non oltre 120 gg dall'ultimo pagamento." },
                ].map((c) => (
                  <Card key={c.t} className="p-4">
                    <p className="text-sm font-semibold text-foreground mb-1">{c.t}</p>
                    <p className="text-sm text-muted-foreground">{c.d}</p>
                  </Card>
                ))}
              </div>
              <CalloutBox tone="danger" title='Errore critico: il bonifico "parlante"'>
                <p>NON utilizzare il bonifico per detrazioni fiscali (il cosiddetto "bonifico parlante"). L'uso di questo tipo di bonifico comporta la <strong>decadenza automatica</strong> dall'incentivo del Conto Termico 3.0. Utilizzare sempre un bonifico ORDINARIO con la causale corretta (vedi sezione Fattura e bonifico).</p>
              </CalloutBox>
              <h3 className="mt-6 mb-2 font-semibold text-foreground">Non cumulabilità</h3>
              <p className="text-muted-foreground">
                Il Conto Termico 3.0 NON è mai cumulabile con: Ecobonus, Bonus Casa, Superbonus, Certificati
                Bianchi. Per la PA è ammessa la cumulabilità con fondi in conto capitale (PNRR, FESR) fino al
                100%. Per le imprese valgono le regole del regime de minimis.
              </p>
            </section>

            {/* 5 — Percentuali */}
            <section id="percentuali">
              <SectionTitle n={5} title="Percentuali di incentivo" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                L'incentivo per i soggetti privati (persone fisiche, condomìni) è calcolato in base alla
                potenza dell'impianto e ai coefficienti di valorizzazione previsti dal decreto. Il tetto
                massimo è pari al <strong className="text-foreground">65% della spesa ammissibile</strong>.
                Per PA ed ETS non economici si può arrivare al 100% nei casi previsti.
              </p>
              <CalloutBox tone="info" title="Modalità di erogazione">
                <ul className="list-disc pl-4 space-y-1">
                  <li>Importo ≤ 15.000 €: erogazione in un'unica soluzione</li>
                  <li>Importo &gt; 15.000 €: erogazione a rate annuali (da 2 a 5 anni)</li>
                </ul>
              </CalloutBox>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <Card className="p-4">
                  <p className="font-semibold text-foreground mb-2">Imprese — Titolo II (Art. 5)</p>
                  <p className="text-sm text-muted-foreground">25% singolo intervento · 30% multi-intervento</p>
                  <p className="text-sm text-muted-foreground mt-2">Maggiorazioni: +20% piccole imprese, +10% medie, +15% se miglioramento ≥ 40%, +15% zona assistita lett. A, +5% lett. C.</p>
                  <p className="text-xs text-orange-600 mt-2">Obbligo: no combustibili fossili, -10% energia primaria</p>
                </Card>
                <Card className="p-4">
                  <p className="font-semibold text-foreground mb-2">Imprese — Titolo III (Art. 8)</p>
                  <p className="text-sm text-muted-foreground">45% singolo intervento · 45% multi-intervento</p>
                  <p className="text-sm text-muted-foreground mt-2">Maggiorazioni: +20% piccole imprese, +10% medie. Plafond: 150 Mln annui, 30 Mln per singolo intervento.</p>
                  <p className="text-xs text-orange-600 mt-2">Obbligo: no combustibili fossili</p>
                </Card>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                <strong className="text-foreground">Richiesta preliminare per imprese:</strong> imprese ed ETS
                economici devono trasmettere una richiesta preliminare al GSE PRIMA dell'avvio lavori
                (Modello 4). Solo dopo l'approvazione del GSE si potranno avviare i lavori.
              </p>
            </section>

            {/* 6 — Accesso */}
            <section id="accesso">
              <SectionTitle n={6} title="Modalità di accesso all'incentivo" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                Esistono due modalità di accesso al Conto Termico 3.0. La scelta dipende dalla tipologia di
                soggetto e dal tipo di intervento.
              </p>
              <div className="space-y-4">
                <Card className="p-4 border-l-4 border-l-emerald-600">
                  <p className="font-semibold text-foreground mb-2">Accesso diretto</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li><strong>Chi:</strong> PA, Enti del Terzo Settore e tutti i Soggetti Privati</li>
                    <li><strong>Tempistiche:</strong> richiesta entro 90 giorni dalla conclusione dei lavori</li>
                    <li><strong>Erogazione:</strong> unica soluzione se ≤ 15.000 € (privati) o qualsiasi importo (PA/ETS non eco.); a rate da 2 a 5 anni se &gt; 15.000 € (privati)</li>
                    <li className="text-emerald-700"><strong>Mandato all'Incasso disponibile solo con accesso diretto</strong></li>
                  </ul>
                </Card>
                <Card className="p-4 border-l-4 border-l-sky-600">
                  <p className="font-semibold text-foreground mb-2">Accesso con prenotazione</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li><strong>Chi:</strong> solo PA e Enti del Terzo Settore (NO mandato all'incasso)</li>
                    <li><strong>Tempistiche:</strong> avvio lavori entro 18 mesi dall'accettazione o 90 giorni; conclusione entro 12 mesi dall'avvio (36 mesi per nZEB)</li>
                    <li><strong>Erogazione:</strong> rata di acconto entro 60 gg dall'avvio + rata intermedia (opz.) + saldo a fine lavori</li>
                  </ul>
                </Card>
              </div>
            </section>

            {/* 7 — Mandato */}
            <section id="mandato">
              <SectionTitle n={7} title="Il Mandato all'Incasso" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                Il Mandato Irrevocabile all'Incasso è lo strumento che ti permette, come installatore, di
                applicare uno sconto immediato in fattura al cliente e ricevere l'importo dell'incentivo
                direttamente dal GSE. È la chiave per replicare lo "sconto in fattura" nel Conto Termico.
              </p>
              <h3 className="mb-2 font-semibold text-foreground">Come funziona in pratica</h3>
              <ol className="space-y-2 text-muted-foreground mb-4">
                {[
                  "Il cliente (Soggetto Responsabile) ti conferisce il mandato irrevocabile a riscuotere l'incentivo",
                  "Emetti la fattura indicando la quota a carico del cliente e la quota per cessione del credito",
                  "Il cliente paga solo la quota non coperta dall'incentivo tramite bonifico ordinario",
                  "La richiesta di incentivo viene presentata a nome del cliente (Mandante)",
                  "Il GSE, una volta approvata la pratica, liquida direttamente te (Mandatario) entro 90 giorni",
                ].map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <CalloutBox tone="info" title="Esempio pratico">
                <ul className="space-y-1">
                  <li>Costo intervento (IVA esclusa): 4.508 € · IVA 22%: 991 € · Totale: 5.500 €</li>
                  <li>Incentivo netto calcolato: 3.531 € (quota per cessione del credito)</li>
                  <li>Quota a carico del cliente: 1.969 € (pagata con bonifico ordinario)</li>
                  <li className="text-emerald-700"><strong>Risultato:</strong> il cliente paga solo 1.969 € invece di 5.500 €. Tu ricevi 1.969 € dal cliente + 3.531 € dal GSE = 5.500 € totali.</li>
                </ul>
              </CalloutBox>
            </section>

            {/* 8 — Fattura e bonifico */}
            <section id="fattura-bonifico">
              <SectionTitle n={8} title="Focus documenti: fattura e bonifico" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                La fattura e la ricevuta del bonifico sono i due documenti contabili su cui il GSE concentra
                i controlli. Una compilazione imprecisa è tra le cause più frequenti di richiesta di
                integrazione o di rigetto della pratica.
              </p>
              <h3 className="mb-2 font-semibold text-foreground">La fattura — cosa deve contenere</h3>
              <ul className="space-y-2 text-muted-foreground mb-4">
                {[
                  "Descrizione dettagliata del prodotto sostituito (marca, modello, matricola)",
                  "Descrizione del nuovo prodotto installato (marca, modello, matricola)",
                  "Indirizzo completo dell'immobile in cui è stato eseguito l'intervento",
                  "Riferimento normativo esplicito: D.M. 7 agosto 2025",
                  "Dettaglio delle voci di spesa: fornitura, posa, smontaggio, prestazioni professionali, opere edili accessorie",
                ].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" /><span>{t}</span></li>
                ))}
              </ul>
              <CalloutBox tone="info" title="Con Mandato all'Incasso — voci da aggiungere in fattura">
                <p className="mb-2">La fattura deve distinguere in modo esplicito le due quote che compongono il totale:</p>
                <pre className="whitespace-pre-wrap rounded bg-emerald-950 text-emerald-50 text-xs p-3 overflow-x-auto">IMPORTO A CARICO DEL S.R. € [quota versata dal cliente]
QUOTA OGGETTO DI CESSIONE DEL CREDITO € [incentivo netto] — D.M. 7 AGOSTO 2025</pre>
              </CalloutBox>
              <h3 className="mt-6 mb-2 font-semibold text-foreground">Il bonifico — la causale corretta</h3>
              <CalloutBox tone="warning" title="Mai il bonifico per detrazioni fiscali">
                <p>Il pagamento va effettuato con <strong>bonifico ORDINARIO</strong>. L'uso del bonifico "parlante" (quello previsto per Ecobonus e Bonus Casa) comporta la <strong>decadenza automatica</strong> dall'incentivo.</p>
              </CalloutBox>
              <p className="text-muted-foreground mt-3 mb-2">La causale del bonifico ordinario deve sempre contenere i quattro elementi seguenti:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1 mb-3">
                <li>Decreto di riferimento: D.M. 7 agosto 2025</li>
                <li>Numero e data della fattura</li>
                <li>Codice fiscale del cliente, in qualità di Soggetto Responsabile (S.R.)</li>
                <li>Codice fiscale o Partita IVA del beneficiario del bonifico (es. l'installatore)</li>
              </ul>
              <pre className="whitespace-pre-wrap rounded bg-emerald-950 text-emerald-50 text-xs p-3 overflow-x-auto">D.M. 7 Agosto 2025 — Fattura n. 037/2026 del 14/04/2026 —
S.R. C.F. XXXXXXXXXXXXXXXX — Beneficiario P.IVA XXXXXXXXXX</pre>
            </section>

            {/* 9 — Documentazione */}
            <section id="documentazione">
              <SectionTitle n={9} title="Documentazione necessaria" />
              <h3 className="mb-2 font-semibold text-foreground">Documenti comuni a tutti gli interventi</h3>
              <ul className="space-y-2 text-muted-foreground mb-5">
                {docComuni.map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" /><span>{t}</span></li>
                ))}
              </ul>
              <Accordion type="single" collapsible className="mb-5">
                <AccordionItem value="complessi">
                  <AccordionTrigger>Documenti aggiuntivi per interventi complessi</AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li>Relazione tecnica di progetto timbrata e firmata</li>
                      <li>Schemi funzionali d'impianto (collegamenti tra componenti)</li>
                      <li>Asseverazione tecnica di conformità ai requisiti CT</li>
                      <li>APE e Diagnosi Energetica (se obbligatorie per la tipologia)</li>
                      <li>Schede tecniche dei componenti installati (dal produttore)</li>
                      <li>Titolo autorizzativo/abilitativo (CILA, SCIA, permesso, se previsto)</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <h3 className="mb-2 font-semibold text-foreground">Documenti specifici per tipologia</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Intervento</TableHead><TableHead>Documenti specifici</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>III.A Pompe di calore</TableCell><TableCell>Cert. produttore, smaltimento vecchio gen.</TableCell></TableRow>
                    <TableRow><TableCell>III.B Sistemi ibridi</TableCell><TableCell>Cert. produttore, relazione tecnica obblig.</TableCell></TableRow>
                    <TableRow><TableCell>III.C Biomassa</TableCell><TableCell>Cert. ambientale (stelle), smaltimento</TableCell></TableRow>
                    <TableRow><TableCell>III.D Solare termico</TableCell><TableCell>Cert. Solar Keymark, schema impianto</TableCell></TableRow>
                    <TableRow><TableCell>III.E Scaldacqua PdC</TableCell><TableCell>Cert. produttore, classe energetica</TableCell></TableRow>
                    <TableRow><TableCell>III.F Teleriscaldamento</TableCell><TableCell>Dichiarazione conformità allaccio</TableCell></TableRow>
                    <TableRow><TableCell>III.G Microcogenerazione</TableCell><TableCell>Cert. produttore, assev. PES</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
              <CalloutBox tone="info" title="Riepilogo Modelli GSE">
                <p>Mod. 5 Delega · Mod. 6 Avvio lavori · Mod. 7 Fine lavori · Mod. 8 Asseverazione · Mod. 9 Spese · Mod. 11 Pagamento · Mod. 12 Mandato incasso · Mod. 14 Biomassa · Mod. 17 Resp. solidale · Mod. 18 Autorizzazione proprietario</p>
              </CalloutBox>
            </section>

            {/* 10 — Checklist */}
            <section id="checklist">
              <SectionTitle n={10} title="Checklist operativa pre-portale" />
              <p className="text-muted-foreground leading-relaxed mb-4">
                Prima di accedere al Portaltermico del GSE per caricare la pratica, verifica di avere tutto
                pronto. Spunta ogni voce man mano che la completi.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {checklist.map((grp) => (
                  <Card key={grp.group} className="p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                      <ListChecks size={18} className="text-emerald-600" /> {grp.group}
                    </p>
                    <ul className="space-y-2">
                      {grp.items.map((it) => (
                        <li key={it} className="flex gap-2 text-sm text-muted-foreground">
                          <span className="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-sm border border-muted-foreground/40" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <CalloutBox tone="danger" title="Tempistica perentoria">
                <p>Inviare la richiesta entro 90 giorni dalla fine lavori. Il superamento comporta l'inammissibilità totale.</p>
              </CalloutBox>
            </section>
          </article>
        </div>

        <FinalCTA />
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-4 pb-3 border-b border-border">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{n}</span>
      {title}
    </h2>
  );
}

function CalloutBox({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-emerald-300 bg-emerald-50 text-emerald-900",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    danger: "border-red-300 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={`mt-5 rounded-xl border ${styles} px-4 py-3 text-sm leading-relaxed`}>
      <p className="flex items-center gap-2 font-semibold mb-1">
        {tone !== "info" && <AlertTriangle size={16} className="flex-shrink-0" />}
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}
