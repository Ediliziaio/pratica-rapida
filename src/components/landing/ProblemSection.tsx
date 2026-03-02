import { PR_GREEN } from "./constants";
import { Section } from "./Section";

export function ProblemSection() {
  return (
    <Section id="vantaggi" light>
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-center mb-8 text-gray-900">
          Sai qual è il modo più veloce per{" "}
          <span style={{ color: PR_GREEN }}>perdere un cliente</span> nel 2025?
        </h2>
        <p className="text-gray-500 text-center max-w-3xl mx-auto text-lg mb-6">
          Dirgli: <em className="text-gray-900 font-medium">"La pratica ENEA? Ah, quella se la deve fare lei."</em>
        </p>
        <div className="max-w-3xl mx-auto space-y-4 text-gray-500 leading-relaxed mb-6">
          <p>Forse fino a qualche anno fa funzionava. Il cliente annuiva, tornava a casa e — forse — si arrangiava. Ma oggi? Oggi il mercato è cambiato. E se non te ne sei accorto, il tuo fatturato probabilmente te lo sta già urlando.</p>
          <p>Perché nel frattempo, il tuo concorrente dall'altra parte della strada ha capito una cosa semplicissima:</p>
          <p className="text-gray-700 font-medium text-center italic">"Il cliente non vuole pensare alla burocrazia. Vuole che qualcuno gli risolva il problema. E chi glielo risolve… si prende la vendita."</p>
          <p>Pensa a quante volte è successo. Il cliente ti chiede un preventivo. Gli piace il prodotto. Gli piace il prezzo. Poi arriva la domanda fatidica: <em className="text-gray-900 font-medium">"Ma per la pratica ENEA come funziona?"</em></p>
          <p>E tu rispondi: "Guardi, quella la deve fare lei, oppure il suo commercialista…"</p>
          <p>In quel momento — in quel preciso istante — hai perso il vantaggio competitivo. Hai dato al cliente un motivo per andare a chiedere un preventivo anche al tuo concorrente. Quello che risponde: <em className="text-gray-900 font-medium">"Non si preoccupi, a tutto ci pensiamo noi."</em></p>
          <p>Domanda scomoda: quante vendite hai perso negli ultimi 12 mesi per questa ragione? 5? 10? 20? Fai il conto in euro. Quanti soldi sono rimasti sul tavolo perché non offrivi un servizio che avresti potuto attivare per soli <strong className="text-gray-900">65€ a pratica</strong>?</p>
        </div>
      </div>
    </Section>
  );
}
