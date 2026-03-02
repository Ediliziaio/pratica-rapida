import { Phone, Users, Zap, Sparkles } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function HowItWorksSection() {
  const steps = [
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
  ];

  return (
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

        <div className="hidden md:flex justify-between items-center mb-8 px-20 relative">
          <div className="absolute top-1/2 left-20 right-20 h-0.5 -translate-y-1/2" style={{ backgroundColor: `${PR_GREEN}30` }} />
          {[1, 2, 3].map((n) => (
            <div key={n} className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm z-10 shadow-md" style={{ backgroundColor: PR_GREEN }}>
              {n}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((item, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm hover:shadow-md transition-all duration-300 stagger-child" onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${PR_GREEN}60`; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; }}>
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
  );
}
