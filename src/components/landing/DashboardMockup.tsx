import { FileText, CheckCircle2, Clock, CreditCard, Shield, BarChart3, Users } from "lucide-react";
import { PR_GREEN } from "./constants";

export function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-4xl mt-14 rounded-xl border border-white/10 bg-[#101d30] shadow-2xl overflow-hidden animate-mockup-enter">
      <div className="hidden md:flex absolute left-0 top-0 bottom-0 w-12 bg-[#0c1727] border-r border-white/5 flex-col items-center py-4 gap-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}20` }}><Shield className="w-4 h-4" style={{ color: PR_GREEN }} /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-white/40" /></div>
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><Users className="w-4 h-4 text-white/40" /></div>
      </div>
      <div className="md:ml-12 p-4 md:p-6">
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
        <div className="hidden md:grid md:grid-cols-2 gap-4">
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
