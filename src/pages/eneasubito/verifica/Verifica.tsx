/**
 * /verifica — il modulo gratuito di EneaSubito.
 *
 * Quattro domande, non otto: qui si decide soltanto se la pratica si può fare.
 * Catastali, certificati e bonifico arrivano dopo il pagamento, quando c'è un
 * cliente che ha deciso di andare avanti. La misura sulle bozze del CRM dice
 * che proprio quei due passaggi — documenti e catastali — si mangiano il 64%
 * degli abbandoni: toglierli dalla parte gratuita è il motivo di questo taglio.
 *
 * L'ordine delle domande non è casuale. L'e-mail viene prima della fattura,
 * che è lo scalino più ripido: se si fermano lì, almeno sappiamo a chi
 * scrivere.
 *
 * TODO: tre agganci al resto della macchina, segnati nel codice.
 *   1. creare la pratica su Supabase appena c'è l'e-mail (bozza recuperabile);
 *   2. collegare il lettore delle fatture in `leggiFattura`;
 *   3. mandare al pagamento quando l'esito è «si può fare».
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Guscio } from "../Guscio";
import { preparaDocumento } from "./immagine";
import {
  giorniRimasti,
  valuta,
  type Famiglia,
  type LetturaFattura,
  type Risposte,
  type Verdetto,
} from "./logica";

const MEMORIA = "eneasubito-verifica";
const PASSI = 4;

const FAMIGLIE: { id: Famiglia; nome: string; esempi: string }[] = [
  { id: "infissi", nome: "Infissi", esempi: "Finestre, portefinestre, porte d'ingresso" },
  { id: "schermature", nome: "Schermature solari", esempi: "Tende da sole, pergotende, pergole" },
  { id: "pompe_di_calore", nome: "Pompa di calore", esempi: "Riscaldamento con pompa di calore" },
  { id: "altro", nome: "Altro", esempi: "Cappotto, fotovoltaico, caldaia, pellet…" },
];

function vuote(): Risposte {
  return { famiglia: null, fineLavori: "", email: "", fatturaCaricata: false };
}

function leggiMemoria(): Risposte {
  try {
    const salvato = localStorage.getItem(MEMORIA);
    if (!salvato) return vuote();
    // Il documento non si può riprendere: resta sul dispositivo precedente.
    return { ...vuote(), ...JSON.parse(salvato), fatturaCaricata: false };
  } catch {
    return vuote();
  }
}

/**
 * Il lettore delle fatture non è ancora collegato al sito: finché risponde
 * «non disponibile», nessuna pratica riceve un sì automatico e tutte passano
 * da un operatore. È voluto — meglio una risposta in 24 ore che un sì a caso.
 *
 * In sviluppo si possono vedere gli altri esiti con ?lettore=letta oppure
 * ?lettore=illeggibile.
 */
async function leggiFattura(_file: File | null, finta: string | null): Promise<LetturaFattura> {
  if (finta === "letta") return { stato: "letta", totale: "9.840,00 €", pezzi: "6 pezzi", data: "14/07/2026" };
  if (finta === "illeggibile") return { stato: "illeggibile" };
  return { stato: "non_disponibile" };
}

export default function Verifica() {
  const [parametri] = useSearchParams();
  const [risposte, setRisposte] = useState<Risposte>(leggiMemoria);
  const [passo, setPasso] = useState(0);
  const [nomeFile, setNomeFile] = useState<string | null>(null);
  const [fileScelto, setFileScelto] = useState<File | null>(null);
  const [preparazione, setPreparazione] = useState<string | null>(null);
  const [verdetto, setVerdetto] = useState<Verdetto | null>(null);
  const [inCorso, setInCorso] = useState(false);

  // Si salva a ogni modifica: chi chiude la pagina e torna non ricomincia.
  useEffect(() => {
    try {
      localStorage.setItem(MEMORIA, JSON.stringify({ ...risposte, fatturaCaricata: false }));
    } catch {
      // Spazio esaurito o navigazione privata: pazienza, il modulo funziona lo stesso.
    }
  }, [risposte]);

  function aggiorna(parziale: Partial<Risposte>) {
    setRisposte((r) => ({ ...r, ...parziale }));
  }

  async function scegliFile(file: File | undefined) {
    if (!file) return;
    setPreparazione("Preparo il documento…");
    const pronto = await preparaDocumento(file);
    setFileScelto(pronto.file);
    setNomeFile(pronto.file.name);
    aggiorna({ fatturaCaricata: true });
    setPreparazione(
      pronto.rimpicciolita
        ? `Foto alleggerita da ${Math.round(pronto.byteIniziali / 1024 / 1024 * 10) / 10} MB a ${Math.round(pronto.byteFinali / 1024 / 1024 * 10) / 10} MB.`
        : null,
    );
  }

  async function chiediVerdetto() {
    setInCorso(true);
    // TODO(2): qui chiamerà il lettore vero.
    const lettura = await leggiFattura(fileScelto, parametri.get("lettore"));
    setVerdetto(valuta(risposte, lettura));
    setInCorso(false);
  }

  if (verdetto) {
    return (
      <SchermataVerdetto
        verdetto={verdetto}
        ricomincia={() => {
          setVerdetto(null);
          setPasso(0);
        }}
      />
    );
  }

  const rimasti = giorniRimasti(risposte.fineLavori);
  const emailValida = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(risposte.email);
  const puoAvanzare = [
    risposte.famiglia !== null,
    rimasti !== null,
    emailValida,
    risposte.fatturaCaricata,
  ][passo];

  return (
    <Guscio
      titolo="Verifica la tua pratica ENEA — EneaSubito"
      descrizione="Quattro domande e la foto della fattura: ti diciamo subito se la tua pratica ENEA si può fare."
      percorso="/verifica"
    >
      <div className="es-wrap">
        <div className="es-passo">
          <div className="es-avanzamento">
            <span>Passo {passo + 1} di {PASSI}</span>
            <span className="es-barra"><i style={{ width: `${((passo + 1) / PASSI) * 100}%` }} /></span>
          </div>

          {passo === 0 && (
            <>
              <h1 className="es-domandona es-serif">Che lavoro hai fatto?</h1>
              <p className="es-aiuto">Quattro domande, due minuti. Puoi fermarti e riprendere da dove eri.</p>
              <div className="es-scelte">
                {FAMIGLIE.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="es-scelta"
                    aria-pressed={risposte.famiglia === f.id}
                    onClick={() => aggiorna({ famiglia: f.id })}
                  >
                    <b>{f.nome}</b>
                    <span>{f.esempi}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {passo === 1 && (
            <>
              <h1 className="es-domandona es-serif">Quando sono finiti i lavori?</h1>
              <p className="es-aiuto">
                La data di fine posa o di collaudo, quella che ti ha indicato l'installatore. Da lì partono
                i 90 giorni per trasmettere all'ENEA.
              </p>
              <div className="es-campone">
                <label htmlFor="fine-lavori">Data di fine lavori</label>
                <input
                  id="fine-lavori"
                  type="date"
                  value={risposte.fineLavori}
                  onChange={(e) => aggiorna({ fineLavori: e.target.value })}
                />
              </div>
              {rimasti !== null && (
                <p className={`es-riscontro ${rimasti < 0 ? "es-brutto" : rimasti <= 15 ? "es-attenzione" : ""}`}>
                  {rimasti < 0
                    ? `Il termine è scaduto da ${-rimasti} giorni. Vai avanti lo stesso: ti diciamo se è un caso recuperabile.`
                    : rimasti <= 15
                      ? `Mancano ${rimasti} giorni alla scadenza. Siamo ancora in tempo, ma non aspettare.`
                      : `Mancano ${rimasti} giorni alla scadenza dei 90.`}
                </p>
              )}
            </>
          )}

          {passo === 2 && (
            <>
              <h1 className="es-domandona es-serif">Dove ti mandiamo la risposta?</h1>
              <p className="es-aiuto">
                Serve anche a non farti perdere quello che hai compilato: se ti interrompi, ti mandiamo il
                link per riprendere.
              </p>
              <div className="es-campone">
                <label htmlFor="email">La tua e-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={risposte.email}
                  onChange={(e) => aggiorna({ email: e.target.value })}
                />
              </div>
              {/* TODO(1): appena l'e-mail è valida, creare la pratica e il
                  codice di ripresa, così la bozza vive anche sul server. */}
            </>
          )}

          {passo === 3 && (
            <>
              <h1 className="es-domandona es-serif">La fattura dell'installatore</h1>
              <p className="es-aiuto">
                Va bene anche solo fotografata: se non si legge te lo diciamo subito, mentre ce l'hai
                ancora in mano. Non serve che sia bella.
              </p>
              <div className="es-carica">
                <label htmlFor="scatta">
                  Scatta una foto
                  <input
                    id="scatta"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => scegliFile(e.target.files?.[0])}
                  />
                </label>
                <label htmlFor="scegli">
                  Scegli un file
                  <input
                    id="scegli"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => scegliFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              {nomeFile && <p className="es-riscontro">Caricato: {nomeFile}</p>}
              {preparazione && <p className="es-aiuto">{preparazione}</p>}
            </>
          )}

          <div className="es-navigazione">
            {passo === PASSI - 1 ? (
              <button
                type="button"
                className="es-bottone es-bottone-pieno"
                disabled={!puoAvanzare || inCorso}
                style={{ opacity: puoAvanzare && !inCorso ? 1 : 0.5 }}
                onClick={chiediVerdetto}
              >
                {inCorso ? "Sto guardando…" : "Dimmi se si può fare"}
              </button>
            ) : (
              <button
                type="button"
                className="es-bottone es-bottone-pieno"
                disabled={!puoAvanzare}
                style={{ opacity: puoAvanzare ? 1 : 0.5 }}
                onClick={() => setPasso((p) => p + 1)}
              >
                Avanti
              </button>
            )}
            {passo > 0 && (
              <button type="button" className="es-indietro" onClick={() => setPasso((p) => p - 1)}>
                Indietro
              </button>
            )}
          </div>
        </div>
      </div>
    </Guscio>
  );
}

function SchermataVerdetto({ verdetto, ricomincia }: { verdetto: Verdetto; ricomincia: () => void }) {
  const segni = { ok: "✓", no: "✕", forse: "!" } as const;
  return (
    <Guscio
      titolo="Esito della verifica — EneaSubito"
      descrizione="L'esito della verifica gratuita sulla tua pratica ENEA."
      percorso="/verifica"
    >
      <div className="es-wrap">
        <div className={`es-verdetto ${verdetto.esito === "si_puo_fare" ? "es-verdetto-si" : ""}`}>
          <div className="es-verdetto-testa">
            <h1 className="es-serif">{verdetto.titolo}</h1>
            <p>{verdetto.spiegazione}</p>
          </div>

          {verdetto.motivi.length > 0 && (
            <ul className="es-motivi">
              {verdetto.motivi.map((m) => (
                <li key={m.testo}>
                  <span className={`es-segno es-segno-${m.segno}`}>{segni[m.segno]}</span>
                  {m.testo}
                </li>
              ))}
            </ul>
          )}

          <div className="es-navigazione">
            {verdetto.esito === "si_puo_fare" && (
              /* TODO(3): qui si va al pagamento Stripe, non a un ancoraggio. */
              <a className="es-bottone es-bottone-pieno" href="/#prezzo">Paga 99 € e falla partire</a>
            )}
            {verdetto.esito === "non_si_puo_fare" && (
              <a className="es-bottone es-bottone-pieno" href="mailto:assistenza@eneasubito.it">
                Scrivici per sicurezza
              </a>
            )}
            {verdetto.esito === "serve_un_controllo" && (
              <span className="es-aiuto">
                Non devi fare altro: ti scriviamo entro 24 ore all'indirizzo che ci hai dato.
              </span>
            )}
            <button type="button" className="es-indietro" onClick={ricomincia}>
              Ricomincia
            </button>
          </div>
        </div>
      </div>
    </Guscio>
  );
}
