/**
 * Il permesso di registrare, in forma anonima, come si usa il sito.
 *
 * Deciso dal Titolare il 27/10/2026: la domanda c'e' (l'annuncio e' molto
 * cliccato) ma il modulo non converte, e i conteggi dicono dove la gente se ne
 * va, non perche'. Microsoft Clarity mostra come si scorre e si tocca la
 * pagina dal telefono. Parte SOLO dopo «Va bene»: fino ad allora non si carica
 * niente. Quello che il visitatore scrive viene oscurato da Clarity stesso
 * (mascheramento «Equilibrato» del progetto).
 *
 * La scelta resta su questo dispositivo; si cambia cancellando i dati del
 * sito dal browser (lo dice la pagina Cookie).
 */
import { useEffect, useState } from "react";

const PROGETTO = "z4fliw7zi7";
const CHIAVE = "eneasubito-misure";

type Scelta = "si" | "no" | null;

function letta(): Scelta {
  try {
    const v = localStorage.getItem(CHIAVE);
    return v === "si" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

function salva(v: "si" | "no") {
  try {
    localStorage.setItem(CHIAVE, v);
  } catch {
    /* archiviazione bloccata: la domanda tornera' alla prossima visita */
  }
}

let caricato = false;

/** Carica Clarity e gli dice che il visitatore ha acconsentito. */
function accendiClarity() {
  if (caricato || typeof window === "undefined") return;
  caricato = true;
  const w = window as unknown as { clarity?: ((...a: unknown[]) => void) & { q?: unknown[] } };
  const c = function (...a: unknown[]) {
    (c.q = c.q || []).push(a);
  } as ((...a: unknown[]) => void) & { q?: unknown[] };
  w.clarity = w.clarity || c;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${PROGETTO}`;
  document.head.appendChild(s);
  w.clarity?.("consent");
}

export function ConsensoMisure() {
  const [scelta, setScelta] = useState<Scelta>(null);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    const s = letta();
    setScelta(s);
    setPronta(true);
    if (s === "si") accendiClarity();
  }, []);

  if (!pronta || scelta !== null) return null;

  return (
    <div className="es-consenso" role="dialog" aria-label="Misure anonime">
      <p>
        Per migliorare il sito registriamo in forma anonima come lo usi. Quello che scrivi non lo vediamo.{" "}
        <a href="/es/cookie">Dettagli</a>
      </p>
      <div className="es-consenso-bottoni">
        <button
          type="button"
          className="es-consenso-no"
          onClick={() => {
            salva("no");
            setScelta("no");
          }}
        >
          No, grazie
        </button>
        <button
          type="button"
          className="es-consenso-si"
          onClick={() => {
            salva("si");
            setScelta("si");
            accendiClarity();
          }}
        >
          Va bene
        </button>
      </div>
    </div>
  );
}
