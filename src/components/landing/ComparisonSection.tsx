import { Scale, XCircle, CheckCircle2 } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function ComparisonSection() {
  return (
    <Section id="confronto" className="bg-[#0d1a2d]">
      <div className="max-w-5xl mx-auto px-6">
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

        <div className="grid md:grid-cols-2 gap-8 relative items-start">
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#0d1a2d] border-2 border-white/20 items-center justify-center z-10 shadow-lg">
            <span className="text-white font-black text-lg">VS</span>
          </div>

          {/* Traditional */}
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
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 space-y-2">
                <p className="text-red-400/80 text-sm font-medium">💸 Costo reale stimato: <strong className="text-red-400">250–500€</strong> a pratica</p>
                <p className="text-red-400/80 text-sm font-medium">⏳ Tempi: da <strong className="text-red-400">3 a 15 giorni</strong></p>
              </div>
            </div>
          </div>

          {/* Pratica Rapida */}
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
  );
}
