import { motion } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  { q: "Quanto costa il servizio?", a: "65€ a pratica completata, IVA esclusa. Nessun canone mensile, nessun costo di attivazione, nessun vincolo contrattuale. Paghi solo quando la pratica è stata effettivamente completata e consegnata." },
  { q: "Come funziona il contatto con il mio cliente?", a: "Chiamiamo il tuo cliente presentandoci come parte del tuo team / ufficio tecnico. Il cliente non saprà mai che siamo un servizio esterno. Raccogliamo tutti i documenti necessari direttamente da lui." },
  { q: "Quanto tempo ci vuole per completare una pratica?", a: "Entro 24 ore lavorative dalla raccolta completa dei documenti, la pratica ENEA viene compilata, inviata e consegnata a te e al tuo cliente." },
  { q: "Cosa succede se c'è un errore nella pratica?", a: "Ogni pratica è coperta da assicurazione RC professionale. In caso di errore, lo correggiamo immediatamente e gratuitamente. La responsabilità è nostra." },
  { q: "Devo firmare un contratto vincolante?", a: "No. Puoi attivare e disattivare il servizio quando vuoi. Non c'è nessun minimo di pratiche mensili e nessuna penale di uscita." },
  { q: "Per quali tipi di intervento posso fare la pratica ENEA?", a: "Serramenti, infissi, tende da sole, pergole, schermature solari, caldaie, pompe di calore, fotovoltaico, vetrate panoramiche. Tutti gli interventi che prevedono la comunicazione ENEA per detrazioni fiscali." },
  { q: "Come ricevo la pratica completata?", a: "Tramite la tua area riservata nel portale Pratica Rapida e via email. Sia tu che il tuo cliente ricevete la pratica in formato digitale." },
  { q: "Posso provare il servizio con una sola pratica?", a: "Assolutamente sì. Non c'è nessun obbligo di volume. Puoi provare con una pratica e decidere se continuare." },
  { q: "Il servizio è disponibile in tutta Italia?", a: "Sì, operiamo su tutto il territorio nazionale. Essendo un servizio digitale, non ci sono limitazioni geografiche." },
  { q: "Come posso iniziare?", a: "Registrati gratuitamente, inserisci il numero di telefono del tuo primo cliente e lascia fare a noi. In 2 minuti sei operativo." },
];

export default function FAQSection() {
  const { ref, isVisible } = useScrollAnimation();
  const half = Math.ceil(faqs.length / 2);

  return (
    <section ref={ref} id="faq" className="py-20 lg:py-28 bg-card">
      <div className="max-w-5xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-14"
        >
          <h2 className="font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            Domande Frequenti.
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>Risposte Chiare.</span>
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="grid lg:grid-cols-2 gap-x-8 max-w-5xl mx-auto"
        >
          {[faqs.slice(0, half), faqs.slice(half)].map((col, ci) => (
            <Accordion key={ci} type="multiple" defaultValue={ci === 0 ? ["0-0", "0-1", "0-2"] : []}>
              {col.map((faq, i) => (
                <AccordionItem key={i} value={`${ci}-${i}`}>
                  <AccordionTrigger className="text-left font-semibold text-base">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.5 }}
          className="mt-10 text-center"
        >
          <a
            href="mailto:modulistica@praticarapida.it"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle size={16} style={{ color: "hsl(var(--pr-green))" }} />
            Non trovi la risposta? Contattaci →
          </a>
        </motion.div>
      </div>
    </section>
  );
}
