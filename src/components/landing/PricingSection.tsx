import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { PR_GREEN } from "./constants";
import { useCounter } from "./hooks";
import { Section } from "./Section";

export function PricingSection() {
  const priceCounter = useCounter(65);

  return (
    <Section id="prezzi" light>
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
          Un prezzo che <span style={{ color: PR_GREEN }}>ha senso</span>
        </h2>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto mb-12">
          Nessun canone. Nessun abbonamento. Nessun costo di attivazione. Paghi solo le pratiche effettivamente gestite.
        </p>

        <div className="bg-white border-2 rounded-3xl p-10 md:p-14 shadow-xl relative overflow-hidden max-w-2xl mx-auto mb-10" style={{ borderColor: PR_GREEN }}>
          <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: PR_GREEN }} />
          <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full text-white font-bold" style={{ backgroundColor: PR_GREEN }}>TUTTO INCLUSO</span>

          <h3 className="text-xl font-bold text-gray-900 mb-6">Per ogni Pratica ENEA</h3>

          <ul className="text-left space-y-3 mb-8 max-w-sm mx-auto">
            {[
              "Compilazione pratica ENEA",
              "Invio telematico ad ENEA",
              "Raccolta documenti dal cliente",
              "Contatto cliente a nome tuo",
              "Assicurazione professionale RC",
              "Consegna in 24h",
              "Assistenza dedicata",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-gray-700 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: PR_GREEN }} />
                {item}
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 pt-6 mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Non dovrai più</p>
            <ul className="space-y-2 max-w-sm mx-auto">
              {["Raccogliere documenti", "Inseguire clienti", "Compilare moduli", "Pagare canoni software"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-400 text-sm">
                  <XCircle className="w-4 h-4 text-red-300 shrink-0" />
                  <span className="line-through">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-gray-300 line-through text-lg">200€</span>
            <span className="text-gray-300 line-through text-lg">150€</span>
            <span className="text-gray-300 line-through text-lg">100€</span>
          </div>

          <div ref={priceCounter.ref} className="flex items-baseline justify-center gap-1 mb-4">
            <span className="text-6xl md:text-7xl font-black" style={{ color: PR_GREEN }}>{priceCounter.count}€</span>
            <span className="text-gray-500 text-lg">a pratica completata</span>
          </div>
          <div className="flex justify-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>ZERO CANONI</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>24H</span>
          </div>
        </div>

        <Link to="/auth" className="inline-flex items-center gap-2 text-white font-semibold px-10 py-4 rounded-lg text-lg transition-all animate-pulse-glow hover:brightness-110" style={{ backgroundColor: PR_GREEN }}>
          Attiva Gratis <ArrowRight className="w-5 h-5" />
        </Link>
        <p className="text-gray-400 text-sm mt-3">Nessun costo iniziale. Paghi solo a pratica effettuata.</p>
      </div>
    </Section>
  );
}
