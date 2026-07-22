import { useEffect, useState } from "react";
import { FilePlus, BookOpen, Download, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { HIGHLIGHT_TUTORIAL_EVENT } from "@/components/AppSidebar";

/**
 * Bump this version when the guides change to re-show the dialog to everyone.
 */
const GUIDE_POPUP_VERSION = "1";

/**
 * Data di attivazione: il pop-up NON compare prima di questo giorno (mezzanotte
 * ora locale). Permette di rilasciare la modifica in anticipo e farla comparire
 * da sola nel giorno stabilito, senza un secondo deploy.
 * Formato: anno, mese (0 = gennaio), giorno. Qui: lunedì 27 luglio 2026.
 */
const GO_LIVE_DATE = new Date(2026, 6, 27, 0, 0, 0);

const guides = [
  {
    icon: FilePlus,
    title: "Inserire una pratica ENEA",
    description: "Come compilare e inviare una nuova pratica passo dopo passo.",
    href: "/guida-inserire-pratica-enea.pdf",
  },
  {
    icon: BookOpen,
    title: "Come funziona il portale",
    description: "Panoramica delle funzioni e delle sezioni principali.",
    href: "/guida-come-funziona-portale.pdf",
  },
  {
    icon: Download,
    title: "Documenti da scaricare",
    description: "Quali documenti servono e dove trovarli.",
    href: "/guida-documenti-da-scaricare.pdf",
  },
];

export function GuideWelcomeDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Chiave per-utente: il pop-up è "visto" una volta per cliente.
  const storageKey = user
    ? `guide-popup-seen:v${GUIDE_POPUP_VERSION}:${user.id}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    // Cancello sulla data: prima del giorno di go-live non si mostra a nessuno.
    if (new Date() < GO_LIVE_DATE) return;
    try {
      const dismissedForever = localStorage.getItem(storageKey);
      const dismissedThisSession = sessionStorage.getItem(storageKey);
      if (!dismissedForever && !dismissedThisSession) {
        setOpen(true);
      }
    } catch {
      // storage non disponibile: mostriamo comunque il popup
      setOpen(true);
    }
  }, [storageKey]);

  // `permanent` true → non riappare più (localStorage). false → solo per questa
  // sessione: riappare al prossimo accesso (usato da chiusura con X / "Mostrami
  // dove sono"). Il bottone "Non mostrare più" chiama dismiss(true).
  const dismiss = (permanent: boolean) => {
    if (storageKey) {
      try {
        if (permanent) localStorage.setItem(storageKey, "1");
        else sessionStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    // Apri ed evidenzia la voce "Come usare il portale" nella sidebar, così
    // il cliente sa dove ritrovare le guide. Ritardato: su mobile la sidebar è
    // un Dialog Radix come questo pop-up — aprirlo nello stesso istante in cui
    // questo si chiude fa scavalcare i due overlay e il drawer non compare.
    window.setTimeout(() => {
      window.dispatchEvent(new Event(HIGHLIGHT_TUTORIAL_EVENT));
    }, 280);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novità: guide su come usare il portale</DialogTitle>
          <DialogDescription>
            Abbiamo aggiunto tre guide per aiutarti a usare al meglio il
            portale. Le trovi sempre nel menu laterale sotto
            {" "}
            <strong>Come usare il portale</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {guides.map((g) => {
            const Icon = g.icon;
            return (
              <a
                key={g.href}
                href={g.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[1.1rem] w-[1.1rem]" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {g.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {g.description}
                  </span>
                </span>
                <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </a>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Chiudendo questa finestra ti mostreremo dove trovarle nel menu a
          sinistra.
        </p>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => dismiss(true)}
            className="w-full sm:w-auto text-muted-foreground"
          >
            Non mostrare più
          </Button>
          <Button onClick={() => dismiss(false)} className="w-full sm:w-auto">
            Mostrami dove sono
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
