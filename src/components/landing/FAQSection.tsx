import { HelpCircle } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";

const FAQ_ITEMS = [
  { q: "Cos'è la pratica ENEA e quando serve?", a: "La pratica ENEA è una comunicazione obbligatoria da inviare all'ente ENEA per poter accedere alle detrazioni fiscali (Ecobonus) su interventi come la sostituzione di infissi, l'installazione di tende da sole, pergole bioclimatiche e serramenti. Va presentata entro 90 giorni dalla fine dei lavori." },
  { q: "Quanto costa il servizio?", a: "Il servizio costa 65€ a pratica, tutto incluso: compilazione, invio, assicurazione professionale. Nessun canone mensile, nessun abbonamento, nessun costo di attivazione. Paghi solo le pratiche effettivamente gestite." },
  { q: "In quanto tempo viene completata la pratica?", a: "Entro 24 ore lavorative dalla ricezione di tutti i documenti completi. In molti casi riusciamo a consegnare anche prima." },
  { q: "Cosa succede se la pratica contiene un errore?", a: "Ogni pratica è coperta da assicurazione professionale. Se dovesse esserci un errore — anche se rarissimo — l'assicurazione copre eventuali danni economici. Lavori con la massima tranquillità." },
  { q: "Quali documenti servono per avviare la pratica?", a: "Servono la fattura dei lavori, i dati catastali dell'immobile, le schede tecniche dei prodotti installati e i dati del committente. Ti guidiamo noi passo passo nella raccolta." },
  { q: "Come funziona il pagamento?", a: "Si paga solo a pratica completata e consegnata. Zero anticipi, zero rischi. Ricevi la pratica, verifichi che sia tutto corretto, e poi procedi con il pagamento." },
  { q: "Lavorate con aziende di tutta Italia?", a: "Sì, il servizio è completamente digitale e copriamo tutto il territorio nazionale. Che tu sia a Milano, Roma, Napoli o in un piccolo paese, il processo è identico e i tempi sono gli stessi." },
  { q: "Posso provare il servizio senza impegno?", a: "Assolutamente sì. Basta contattarci e inviarci i documenti della prima pratica. Nessun contratto vincolante, nessun minimo d'ordine. Paghi solo le pratiche effettivamente gestite." },
  { q: "Devo avere competenze tecniche per usare la piattaforma?", a: "No, nessuna competenza tecnica richiesta. La nostra piattaforma è progettata per essere semplicissima: inserisci il numero del cliente e al resto pensiamo noi. Non devi compilare moduli, scaricare software o imparare procedure complesse." },
  { q: "I dati dei miei clienti sono al sicuro?", a: "Assolutamente sì. Trattiamo i dati dei tuoi clienti con la massima riservatezza e nel pieno rispetto del GDPR. Utilizziamo sistemi criptati e procedure certificate per garantire la sicurezza di tutte le informazioni. I dati vengono utilizzati esclusivamente per la gestione della pratica ENEA." },
];

export function FAQSection() {
  return (
    <Section light id="faq">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6 bg-green-50 border border-green-100" style={{ color: PR_GREEN }}>
            <HelpCircle className="w-3.5 h-3.5" /> DOMANDE FREQUENTI
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900">Tutto quello che devi sapere</h2>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-5 overflow-hidden" style={{ borderColor: `${PR_GREEN}25` }}>
              <AccordionTrigger className="text-left text-gray-900 font-semibold text-base hover:no-underline py-5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-gray-500 leading-relaxed pb-5">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
