import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  Gauge,
  Headphones,
  LockKeyhole,
  MonitorCheck,
  ShieldCheck,
  Snowflake,
  Star,
  UploadCloud,
} from "lucide-react";
import { SEO } from "@/components/SEO";

const GREEN = "#009846";

const portalRows = [
  { client: "Cliente Demo Milano", service: "ENEA + F-Gas", status: "In lavorazione", tone: "amber" },
  { client: "Cliente Demo Monza", service: "F-Gas", status: "Documenti completi", tone: "green" },
  { client: "Cliente Demo Como", service: "ENEA", status: "Consegnata", tone: "blue" },
];

function Logo() {
  return (
    <img
      src="/pratica-rapida-logo-horizontal-official.png"
      alt="PraticaRapida"
      className="h-auto w-[230px] sm:w-[290px]"
    />
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] leading-6 text-slate-700">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function ServizioEneaFgas() {
  return (
    <div className="min-h-screen bg-[#f7faf8] text-slate-950">
      <SEO
        title="Pratiche ENEA e comunicazioni F-Gas per installatori"
        description="Un unico servizio amministrativo per le pratiche ENEA e le comunicazioni degli interventi alla Banca Dati F-Gas, dedicato a venditori e installatori di climatizzatori."
        canonical="/servizi/enea-fgas"
        noIndex
        noFollow
      />

      <header className="border-b border-emerald-900/10 bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
          <Logo />
          <a
            href="mailto:g.beretta@praticarapida.it?subject=Attivazione%20servizio%20ENEA%20e%20F-Gas"
            className="hidden items-center gap-2 rounded-full bg-[#009846] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#007d3b] sm:flex"
          >
            Richiedi l’attivazione <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#009846] text-white">
          <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full border-[80px] border-white/10" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em]">
                <Snowflake className="h-4 w-4" /> Per venditori e installatori di climatizzatori
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                ENEA e F-Gas.
                <span className="block text-[#d9ff74]">Una sola area riservata.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-emerald-50 sm:text-xl">
                Tu installi. Noi organizziamo i dati, curiamo gli adempimenti amministrativi e ti consegniamo la documentazione pronta da archiviare.
              </p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
                <span className="rounded-full bg-white px-4 py-2 text-[#007d3b]">Nessun canone</span>
                <span className="rounded-full bg-white px-4 py-2 text-[#007d3b]">Fattura a lavoro concluso</span>
                <span className="rounded-full bg-white px-4 py-2 text-[#007d3b]">Supporto telefonico</span>
              </div>
            </div>

            <div className="self-end rounded-[28px] bg-white p-4 text-slate-900 shadow-2xl shadow-emerald-950/25 sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">Area riservata</p>
                  <p className="mt-1 text-lg font-black">Le tue pratiche, sempre sotto controllo</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <MonitorCheck className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {portalRows.map((row) => (
                  <div key={row.client} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold">{row.client}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.service}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      row.tone === "green" ? "bg-emerald-100 text-emerald-800" : row.tone === "blue" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-[11px] text-slate-400">Anteprima dimostrativa · nessun dato cliente reale</p>
            </div>
          </div>
        </section>

        {/* Prezzi: NON pubblicati sul sito per decisione del titolare (19/09/2026).
            Il blocco con le tre tariffe e' conservato in docs/newsletter/ per la newsletter. */}

        <section className="border-y border-emerald-900/10 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#009846]">Come funziona</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Un flusso semplice, pensato per chi installa.</h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-4">
              {[
                ["01", "Inserisci il cliente", "Apri la pratica dalla tua area riservata e scegli ENEA, F-Gas oppure il pacchetto completo."],
                ["02", "Carica i dati", "Alleghi la fattura e una foto leggibile della targhetta: il resto lo ricaviamo noi."],
                ["03", "Controlliamo e compiliamo", "Verifichiamo la completezza formale, inseriamo i dati e ti contattiamo se manca qualcosa."],
                ["04", "Ricevi i documenti", "Trovi ricevute e documentazione nella tua area riservata. Solo allora emettiamo fattura."],
              ].map(([n, title, copy]) => (
                <article key={n} className="rounded-3xl border border-slate-200 bg-[#f9fbfa] p-6">
                  <p className="text-4xl font-black text-emerald-200">{n}</p>
                  <h3 className="mt-6 text-lg font-black">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Checklist completa e abilitazione sul portale F-Gas: NON pubbliche.
            Vivono nell'area riservata (Documenti utili) e nella newsletter. */}

        <section className="bg-[#e9f8ef]">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#009846]">Perché PraticaRapida</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Struttura, controllo e assistenza. A tuo nome.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">
                Siamo specializzati nella gestione B2B delle pratiche energetiche: il tuo cliente riceve un servizio ordinato e tu mantieni visibilità su ogni fase.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [Gauge, "48 ore lavorative", "per le pratiche ENEA, dalla documentazione completa"],
                [MonitorCheck, "Area riservata", "per monitorare stato e documenti delle pratiche"],
                [Headphones, "Supporto telefonico", "con un referente reale quando serve"],
                [ShieldCheck, "Controllo formale", "prima della trasmissione e consegna ordinata"],
              ].map(([Icon, title, copy]) => {
                const ItemIcon = Icon as typeof Gauge;
                return (
                  <article key={String(title)} className="rounded-3xl bg-white p-6 shadow-sm">
                    <ItemIcon className="h-6 w-6 text-[#009846]" />
                    <h3 className="mt-5 font-black">{String(title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{String(copy)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
          <div className="grid gap-7 rounded-[32px] border border-emerald-900/10 bg-white p-7 shadow-sm lg:grid-cols-[.72fr_1.28fr] lg:p-10">
            <div className="rounded-3xl bg-[#009846] p-7 text-white">
              <div className="flex gap-1 text-[#d9ff74]">
                {[0, 1, 2, 3, 4].map((n) => <Star key={n} className="h-5 w-5 fill-current" />)}
              </div>
              <p className="mt-6 text-5xl font-black">4,9/5</p>
              <p className="mt-2 font-bold">su 140 recensioni Trustpilot</p>
              <a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white underline underline-offset-4">
                Leggi tutte le recensioni <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["“Rapido e professionale”", "Documentazione gestita in modo rapido e professionale. Persone cortesi e disponibili."],
                ["“Veloci e precisi”", "Disponibili con contatti telefonici, veloci e precisi nelle pratiche."],
                ["“Chiarezza e rapidità”", "La velocità di evasione della pratica e la semplicità sono eccezionali."],
              ].map(([title, copy]) => (
                <blockquote key={title} className="rounded-2xl bg-slate-50 p-5">
                  <BadgeCheck className="h-5 w-5 text-[#009846]" />
                  <p className="mt-4 font-black">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
                  <footer className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recensione Trustpilot</footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8">
            <Clock3 className="mx-auto h-9 w-9 text-[#d9ff74]" />
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Attiviamo il servizio con la tua prima pratica.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Ti guidiamo nell’abilitazione F-Gas, configuriamo l’area riservata e verifichiamo insieme il primo fascicolo.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="mailto:g.beretta@praticarapida.it?subject=Attivazione%20servizio%20ENEA%20e%20F-Gas" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d9ff74] px-7 py-4 font-black text-slate-950 transition hover:bg-white">
                Richiedi l’attivazione <ArrowRight className="h-5 w-5" />
              </a>
              <a href="tel:+390398682692" className="inline-flex items-center justify-center rounded-full border border-white/30 px-7 py-4 font-bold text-white transition hover:bg-white/10">
                Chiama 039 868 2692
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-8 text-center sm:flex-row sm:text-left lg:px-8">
          <Logo />
          <div className="text-xs leading-5 text-slate-500">
            <p>PraticaRapida · Lissone (MB) · Servizi amministrativi per installatori</p>
            <p className="mt-1">Fonti operative: Banca Dati F-Gas ed Ecocerved · Informazioni aggiornate a settembre 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
