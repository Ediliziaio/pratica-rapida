import { Shield, CheckCircle2, Lock, ShieldCheck, CreditCard, XCircle } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function GuaranteesSection() {
  return (
    <Section className="bg-[#0d1a2d]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-widest px-4 py-1.5 rounded-full mb-6" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
            <Shield className="w-3.5 h-3.5" /> GARANZIE ESCLUSIVE
          </span>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Due garanzie che{" "}
            <span style={{ color: PR_GREEN }}>nessun altro</span> ti offre
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">Protezione totale e zero rischi economici: le nostre promesse concrete.</p>
          <div className="w-16 h-1 rounded-full mx-auto mt-6" style={{ backgroundColor: PR_GREEN }} />
        </div>

        <div className="space-y-8">
          {/* Garanzia #1 */}
          <div className="bg-[#0f1d32] rounded-2xl p-8 md:p-10 relative overflow-hidden border" style={{ borderColor: `${PR_GREEN}30`, boxShadow: `0 0 40px ${PR_GREEN}08`, background: `radial-gradient(circle at 0% 0%, ${PR_GREEN}08 0%, transparent 50%), #0f1d32` }}>
            <span className="absolute -top-4 -left-4 text-8xl font-black select-none pointer-events-none" style={{ color: `${PR_GREEN}06` }}>01</span>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: PR_GREEN }} />
            <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full font-bold text-white" style={{ backgroundColor: PR_GREEN }}>INCLUSA</span>
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="flex items-center justify-center order-1">
                <div className="relative">
                  <div className="w-52 h-52 rounded-full border flex items-center justify-center animate-pulse" style={{ borderColor: `${PR_GREEN}08` }}>
                    <div className="w-40 h-40 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}15` }}>
                      <div className="w-28 h-28 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}25` }}>
                        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15`, boxShadow: `0 0 30px ${PR_GREEN}30` }}>
                          <Shield className="w-12 h-12" style={{ color: PR_GREEN }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -top-3 right-4 px-2 py-1 rounded-lg text-[10px] font-bold text-white animate-float" style={{ backgroundColor: PR_GREEN }}>100%</div>
                  <div className="absolute top-1/2 -right-6 w-8 h-8 rounded-full flex items-center justify-center animate-float-delayed" style={{ backgroundColor: `${PR_GREEN}20` }}>
                    <Lock className="w-4 h-4" style={{ color: PR_GREEN }} />
                  </div>
                  <div className="absolute -bottom-3 left-4 px-2 py-1 rounded-lg text-[10px] font-bold text-white animate-float-slow" style={{ backgroundColor: `${PR_GREEN}80` }}>SICURA</div>
                </div>
              </div>
              <div className="order-2">
                <h3 className="text-2xl font-bold mb-5 text-white">Garanzia #1: Assicurazione Blindata</h3>
                <ul className="space-y-4">
                  {[
                    { title: "Ogni pratica è coperta dalla nostra assicurazione", sub: "Copertura professionale RC inclusa in ogni servizio" },
                    { title: "Errori? Responsabilità nostra al 100%", sub: "Nessun rischio per il tuo studio" },
                    { title: "Nessun costo aggiuntivo per te", sub: "L'assicurazione è già inclusa nel prezzo" },
                    { title: "Pratiche in mani sicure e assicurate", sub: "Tecnici qualificati e verificati" },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: PR_GREEN }} />
                      <div>
                        <span className="text-white text-sm font-medium">{item.title}</span>
                        <p className="text-white/40 text-xs mt-0.5">{item.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15` }}>
                    <ShieldCheck className="w-5 h-5" style={{ color: PR_GREEN }} />
                  </div>
                  <p className="text-sm font-semibold text-white/80">Protetto al 100% — senza costi aggiuntivi</p>
                </div>
              </div>
            </div>
          </div>

          {/* Garanzia #2 */}
          <div className="bg-[#0f1d32] rounded-2xl p-8 md:p-10 relative overflow-hidden border" style={{ borderColor: `${PR_GREEN}30`, boxShadow: `0 0 40px ${PR_GREEN}08`, background: `radial-gradient(circle at 100% 0%, #f59e0b08 0%, transparent 50%), #0f1d32` }}>
            <span className="absolute -top-4 -right-4 text-8xl font-black select-none pointer-events-none" style={{ color: `${PR_GREEN}06` }}>02</span>
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full font-bold text-white bg-amber-500">ZERO RISCHI</span>
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="order-2 md:order-1">
                <h3 className="text-2xl font-bold mb-5 text-white">Garanzia #2: Paghi Solo a Pratica Effettuata</h3>
                <ul className="space-y-4">
                  {[
                    { title: "Non ti chiediamo un euro prima", sub: "Zero anticipi, zero depositi cauzionali" },
                    { title: "Paghi solo quando la pratica è completata", sub: "Consegnata e verificata prima del pagamento" },
                    { title: "Se non facciamo pratiche, non paghi nulla", sub: "Nessun canone fisso o abbonamento" },
                    { title: "Il rischio è tutto nostro", sub: "Modello pay-per-use trasparente" },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: PR_GREEN }} />
                      <div>
                        <span className="text-white text-sm font-medium">{item.title}</span>
                        <p className="text-white/40 text-xs mt-0.5">{item.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/15">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                  </div>
                  <p className="text-sm font-semibold text-white/80">Zero euro anticipati — paghi solo a risultato</p>
                </div>
              </div>
              <div className="flex items-center justify-center order-1 md:order-2">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15`, boxShadow: `0 0 30px ${PR_GREEN}30` }}>
                      <CreditCard className="w-12 h-12" style={{ color: PR_GREEN }} />
                    </div>
                    <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white animate-float" style={{ backgroundColor: PR_GREEN }}>GRATIS</div>
                    <div className="absolute top-1/2 -left-10 px-2 py-0.5 rounded text-[10px] font-bold text-white animate-float-delayed" style={{ backgroundColor: `${PR_GREEN}80` }}>NO VINCOLI</div>
                  </div>
                  <div className="space-y-2 w-full max-w-[200px]">
                    {["Canone mensile", "Abbonamento", "Costo attivazione"].map((item) => (
                      <div key={item} className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="line-through text-red-400/60 text-xs">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 rounded-xl font-black text-lg" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN, boxShadow: `0 0 20px ${PR_GREEN}20` }}>
                    0€ anticipati
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
