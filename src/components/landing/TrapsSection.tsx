import { Target, AlertTriangle, TrendingDown, Monitor, XCircle } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function TrapsSection() {
  return (
    <Section className="bg-[#0d1a2d]">
      <div className="max-w-5xl mx-auto px-6">
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
          <blockquote className="border-l-4 rounded-r-xl p-6 my-8" style={{ borderColor: PR_GREEN, backgroundColor: `${PR_GREEN}08` }}>
            <p className="text-white/90 text-lg md:text-xl italic font-medium leading-relaxed">
              "Non è il migliore che vince. È quello che rende la vita più facile al cliente."
            </p>
          </blockquote>
          <p>E non stiamo parlando di teoria. Stiamo parlando di <strong className="text-white/90">vendite perse</strong>. Soldi veri. Clienti che avevano il portafoglio in mano e se ne sono andati perché tu non offrivi quel servizio in più che li avrebbe fatti sentire seguiti al 100%.</p>
        </div>

        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-4 bg-red-500/15 text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" /> ATTENZIONE
          </span>
          <h3 className="text-2xl md:text-4xl font-bold flex items-center justify-center gap-3">
            Le 2 trappole in cui cadono il 90% delle aziende
          </h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <TrapCard
            number="#1"
            icon={TrendingDown}
            title='Il Fornitore "Low Cost"'
            description='Ti dicono che il prezzo è basso (50–200€). Peccato che poi il lavoro sporco lo devi fare TU:'
            items={[
              "Raccogliere i contatti del cliente",
              "Inseguire il cliente per i documenti catastali",
              "Procurarti fatture, certificazioni, dati tecnici",
              "Impacchettare tutto e inviarlo all'azienda",
            ]}
            footerCost="3-5x di più"
            footerNote="Ore del personale + telefonate + solleciti + email"
          />
          <TrapCard
            number="#2"
            icon={Monitor}
            title='Il Software "Premium"'
            description='Ti vendono un software con un canone annuale da capogiro — più di 1.000€ — e poi scopri la beffa: massimo 3 pratiche ENEA incluse. Tre.'
            items={[
              "Paghi 1.000€+ per sole 3 pratiche incluse",
              "Ogni pratica extra? Paghi ancora",
              "Il software lo devi imparare tu",
              "Lo devi gestire e aggiornare tu",
            ]}
            footerCost="333€+ a pratica"
            footerNote="Come comprare una Ferrari per andare a prendere il pane"
          />
        </div>
      </div>
    </Section>
  );
}

function TrapCard({ number, icon: Icon, title, description, items, footerCost, footerNote }: {
  number: string;
  icon: React.ElementType;
  title: string;
  description: string;
  items: string[];
  footerCost: string;
  footerNote: string;
}) {
  return (
    <div className="bg-[#0f1d32] border border-red-500/20 rounded-xl overflow-hidden card-hover-glow relative">
      <span className="absolute top-4 right-5 text-6xl font-black text-red-500/10 select-none">{number}</span>
      <div className="px-8 pt-7 pb-2">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-red-400" />
          </div>
          <h4 className="text-lg font-bold">{title}</h4>
        </div>
        <p className="text-white/55 text-sm leading-relaxed mb-4">
          {description.split("TU").map((part, i, arr) =>
            i < arr.length - 1 ? <span key={i}>{part}<strong className="text-white/90">TU</strong></span> : <span key={i}>{part}</span>
          )}
        </p>
        <ul className="space-y-2 mb-5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-white/55 text-sm">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-6 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-5 py-3.5">
        <p className="text-red-300 text-sm font-semibold">
          💸 Costo reale: <span className="text-white font-bold">{footerCost}</span> di quanto pensi
        </p>
        <p className="text-white/40 text-xs mt-1">{footerNote}</p>
      </div>
    </div>
  );
}
