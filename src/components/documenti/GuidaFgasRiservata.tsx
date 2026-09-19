import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ExternalLink, FileText } from "lucide-react";

/**
 * Guida F-Gas per l'area riservata (rivenditori registrati e staff), impaginata
 * come le altre righe di «Documenti utili»: icona, titolo, descrizione, uso,
 * azione a destra. Contenuto volutamente NON pubblico (decisione del titolare,
 * 19/09/2026); lo stesso testo alimenta la newsletter.
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

function GuidaRow({ title, description, useCase, children, link }: {
  title: string; description: string; useCase: string; children: React.ReactNode; link?: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
              <p className="text-xs text-muted-foreground mt-2">{useCase}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {link && (
              <Button variant="outline" size="sm" asChild>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" />{link.label}
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <ChevronDown className={`h-4 w-4 mr-1.5 transition-transform ${open ? "rotate-180" : ""}`} />{open ? "Chiudi" : "Leggi"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

export default function GuidaFgasRiservata() {
  return (
    <>
      <GuidaRow
        title="F-Gas: cosa serve per comunicare un'installazione"
        description="Checklist di ciò che ci serve per la comunicazione F-Gas di una pompa di calore."
        useCase="Il codice fiscale del tecnico e i dati tecnici (circuiti, refrigerante) non te li chiediamo: i tuoi dati sono già registrati e il resto lo ricaviamo dalla targhetta."
      >
        <ul className="space-y-2">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-6"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={3} /> {item}</li>
          ))}
        </ul>
        <p className="mt-4 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
          L'impresa installatrice resta responsabile dell'intervento tecnico e della correttezza dei dati forniti. PraticaRapida cura il servizio amministrativo di comunicazione.
        </p>
      </GuidaRow>
      <GuidaRow
        title="Come abilitarci sul portale F-Gas"
        description="Attivazione una tantum: da quel momento comunichiamo noi gli interventi a tuo nome."
        useCase="Da fare una sola volta dal legale rappresentante, con SPID o firma digitale. La pratica di abilitazione è gratuita."
        link={{ href: "https://scrivania.fgas.it/Home/", label: "Scrivania F-Gas" }}
      >
        <ol className="space-y-3">
          {ABILITAZIONE.map((item, index) => (
            <li key={item} className="grid grid-cols-[28px_1fr] gap-2 text-sm leading-6">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      </GuidaRow>
    </>
  );
}
