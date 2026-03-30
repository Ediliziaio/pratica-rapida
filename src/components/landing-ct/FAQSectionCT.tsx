import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  { q: "Quanto costa il servizio per il Conto Termico?", a: "250€ a pratica completata, IVA esclusa. Nessun canone mensile, nessun costo di attivazione, nessun vincolo contrattuale. Paghi solo quando la pratica è stata trasmessa al GSE e accettata." },
  { q: "Cos'è il Conto Termico e chi può accedervi?", a: "Il Conto Termico (DM 16/02/2016) è un incentivo statale gestito dal GSE che eroga un contributo diretto in denaro per interventi di efficienza energetica termica. Possono accedervi i privati che hanno installato caldaie a condensazione, pompe di calore, solare termico e altri impianti ammessi." },
  { q: "Quali impianti sono ammessi al Conto Termico?", a: "Caldaie a condensazione, pompe di calore (aria-acqua, aria-aria, geotermiche), collettori solari termici, sistemi ibridi, generatori a biomassa, sistemi di building automation (BACS) e isolamento dell'involucro edilizio negli edifici delle PA." },
  { q: "Entro quanto tempo va inviata la pratica al GSE?", a: "La pratica deve essere trasmessa al GSE entro 90 giorni dalla fine dei lavori. Gestiamo l'invio entro 72 ore dalla raccolta completa della documentazione, garantendo sempre il rispetto della scadenza." },
  { q: "Cosa succede se la pratica viene respinta dal GSE?", a: "Con il nostro servizio non accade: la documentazione viene preparata secondo ogni requisito tecnico del GSE. In ogni caso, ogni pratica è coperta da assicurazione RC professionale e, se ci fosse un errore, lo correggiamo immediatamente e gratuitamente." },
  { q: "Come viene pagato il contributo al mio cliente?", a: "Il GSE eroga il contributo direttamente al beneficiario (il tuo cliente) tramite bonifico bancario, suddiviso in rate annuali per un periodo di 2-5 anni a seconda del tipo di intervento e dell'importo." },
  { q: "Quanto vale il contributo del Conto Termico?", a: "Il valore dipende dal tipo di impianto, dalla potenza installata e dalla zona climatica. In media si va da poche centinaia a qualche migliaio di euro per impianto. Ti inviamo una stima indicativa prima di procedere con la pratica." },
  { q: "Devo fornire io la documentazione tecnica?", a: "No. Chiamiamo il tuo cliente a nome della tua azienda e raccogliamo noi tutta la documentazione tecnica necessaria: schede tecniche del prodotto, fatture, verbali di collaudo, dati catastali e tutto il resto." },
  { q: "Posso provare con una sola pratica?", a: "Assolutamente sì. Non c'è nessun obbligo di volume. Registrati, inserisci i dati del tuo primo cliente e lascia fare a noi." },
  { q: "Come posso iniziare?", a: "Registrati gratuitamente, inserisci i dati dell'impianto e del cliente e lascia fare a noi. In pochi minuti sei operativo." },
];

export default function FAQSectionCT() {
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
                  <AccordionTrigger className="text-left font-semibold text-base">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ))}
        </motion.div>

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
