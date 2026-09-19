import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ExternalLink, LockKeyhole, UploadCloud } from "lucide-react";

/**
 * Guida F-Gas per l'area riservata (rivenditori registrati e staff).
 * Contenuto volutamente NON pubblico: la pagina /servizi/enea-fgas dice solo
 * cosa facciamo e cosa chiediamo (targhetta e fattura). Qui stanno la
 * checklist completa e i passi per abilitarci sul portale F-Gas.
 * Decisione del titolare, 19/09/2026. Lo stesso testo alimenta la newsletter.
 */
const CHECKLIST = [
  "Dati del cliente/operatore e indirizzo di installazione",
  "Numero e data della fattura o dello scontrino, se disponibili",
  "Foto nitida della targhetta con marca, modello, matricola e dati del refrigerante",
  "Data dell'intervento e tipologia di apparecchiatura",
  "Tipo e quantità di gas presente, recuperato o aggiunto (se lo sai; altrimenti lo ricaviamo noi)",
];

const ABILITAZIONE = [
  "Il legale rappresentante entra nella Scrivania telematica su fgas.it con SPID o firma digitale.",
  "Seleziona «Richiesta abilitazioni per comunicazione interventi».",
  "In «Abilitazione del personale» sceglie «Aggiungi personale».",
  "Inserisce nome, cognome, codice fiscale ed e-mail del referente PraticaRapida che comunicheremo all'attivazione.",
  "Abilita almeno Inserimento e Comunicazione; consigliamo anche Consultazione e Storno per gestire eventuali correzioni.",
  "Controlla, firma digitalmente e trasmette la richiesta. La pratica di abilitazione è gratuita.",
];

export default function GuidaFgasRiservata() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UploadCloud className="h-4 w-4 text-primary" /> F-Gas: cosa serve per comunicare un'installazione</CardTitle>
          <CardDescription>Il codice fiscale del tecnico e i dati tecnici (circuiti, refrigerante) non te li chiediamo: i tuoi dati sono già registrati e il resto lo leggiamo dalla targhetta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-6"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={3} /> {item}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
            L'impresa installatrice resta responsabile dell'intervento tecnico e della correttezza dei dati forniti. PraticaRapida cura il servizio amministrativo di comunicazione.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-4 w-4 text-primary" /> Come abilitarci sul portale F-Gas (una tantum)</CardTitle>
          <CardDescription>Serve una sola volta: da quel momento comunichiamo noi gli interventi a tuo nome.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {ABILITAZIONE.map((item, index) => (
              <li key={item} className="grid grid-cols-[28px_1fr] gap-2 text-sm leading-6">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
          <a href="https://scrivania.fgas.it/Home/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Apri la Scrivania telematica F-Gas <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
