/**
 * /verifica — il modulo di EneaSubito, in due schermate.
 *
 * Nessun esito da leggere, nessun «ti facciamo sapere»: quel passaggio e'
 * stato eliminato dal Titolare l'11/10/2026 perche' offriva a un potenziale
 * cliente l'occasione di andarsene.
 *
 * Tutto il resto — catastali, certificati, bonifico, date — si chiede DOPO il
 * pagamento, con il modulo che Pratica Rapida usa gia' tutti i giorni. La
 * misura sulle bozze del CRM dice che documenti e catastali si mangiano il 64%
 * degli abbandoni: davanti alla cassa non ci devono stare.
 *
 * **Perche' due schermate e non una (15/10/2026).** Prima stava tutto insieme
 * e non si salvava niente finche' non erano pronte tutte e quattro le cose,
 * fattura compresa. Chi cercava «pratica enea infissi» dall'ufficio la fattura
 * non ce l'aveva addosso: compilava, si bloccava, se ne andava — e per noi non
 * era mai esistito. Il primo giorno di pubblicita' sono arrivate 25 persone e
 * nessuna ha lasciato un contatto.
 *
 * Ora la pratica nasce **alla fine del primo passo**, con nome e indirizzo. Da
 * li' quella persona esiste, si conta e la si puo' richiamare. La fattura
 * resta obbligatoria per pagare: quello che cambia e' che chi non ce l'ha non
 * svanisce piu'.
 *
 * Il nome che si chiede qui e' quello del BENEFICIARIO, cioe' l'intestatario
 * della fattura: e' lui che porta la spesa in detrazione, e se sbagliamo
 * persona la pratica e' da rifare.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Guscio } from "../Guscio";
import { preparaDocumento } from "./immagine";
import { apriPagamento, caricaFattura, salvaPratica } from "./pratica";
import { completa, datiCompleti, giorniRimasti, type Famiglia, type Richiesta } from "./logica";

const MEMORIA = "eneasubito-verifica";
/**
 * Il token vive nella scheda del browser, non oltre.
 *
 * In `localStorage` restava da una visita all'altra e chi tornava continuava a
 * parlare della pratica vecchia: se quella era gia' pagata, Stripe rifiutava e
 * il pulsante non apriva piu' niente. Tenerlo solo nello stato di React pero'
 * non basta piu': ora la pratica nasce al primo passo, e un semplice
 * ricaricamento della pagina ne farebbe nascere una seconda per la stessa
 * persona. `sessionStorage` e' la misura giusta — regge il ricaricamento,
 * muore con la scheda.
 */
const TOKEN = "eneasubito-token";

const FAMIGLIE: { id: Famiglia; nome: string; esempi: string }[] = [
  { id: "infissi", nome: "Infissi", esempi: "Finestre, portefinestre, porte d'ingresso" },
  { id: "schermature", nome: "Schermature solari", esempi: "Tende da sole, pergotende, pergole" },
  { id: "pompe_di_calore", nome: "Pompa di calore", esempi: "Riscaldamento con pompa di calore" },
];

const AMMESSE = FAMIGLIE.map((f) => f.id) as string[];

function vuota(): Richiesta {
  return { famiglia: null, nome: "", email: "", fineLavori: "" };
}

function leggiMemoria(): Richiesta {
  try {
    const salvato = localStorage.getItem(MEMORIA);
    return salvato ? { ...vuota(), ...JSON.parse(salvato) } : vuota();
  } catch {
    return vuota();
  }
}

function leggiToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN);
  } catch {
    return null;
  }
}

export default function Verifica() {
  const [parametri] = useSearchParams();
  const [richiesta, setRichiesta] = useState<Richiesta>(() => {
    const salvata = leggiMemoria();
    // I pulsanti delle schede in home arrivano qui con l'intervento gia'
    // indicato: sarebbe scortese richiederlo.
    const scelto = parametri.get("intervento");
    return scelto && AMMESSE.includes(scelto)
      ? { ...salvata, famiglia: scelto as Famiglia }
      : salvata;
  });
  const [token, setToken] = useState<string | null>(() => leggiToken());
  // Chi ricarica la pagina a meta' strada riprende da dove era, invece di
  // ricominciare: la pratica esiste gia' e il token ce l'abbiamo.
  const [passo, setPasso] = useState<1 | 2>(() => (leggiToken() ? 2 : 1));
  const [file, setFile] = useState<File | null>(null);
  const [nomeFile, setNomeFile] = useState<string | null>(null);
  const [preparazione, setPreparazione] = useState<string | null>(null);
  const [attesa, setAttesa] = useState<string | null>(null);
  const [intoppo, setIntoppo] = useState<string | null>(null);

  // Si salva a ogni modifica: chi chiude la pagina e torna non ricomincia.
  // Il documento no: quello resta sul dispositivo da cui l'ha scelto.
  useEffect(() => {
    try {
      localStorage.setItem(MEMORIA, JSON.stringify(richiesta));
    } catch {
      // Spazio esaurito o navigazione privata: il modulo funziona lo stesso.
    }
  }, [richiesta]);

  function ricordaToken(nuovo: string | null): string | null {
    if (!nuovo) return null;
    setToken(nuovo);
    try {
      sessionStorage.setItem(TOKEN, nuovo);
    } catch {
      // Navigazione privata: si prosegue con il token tenuto in memoria.
    }
    return nuovo;
  }

  function aggiorna(parziale: Partial<Richiesta>) {
    setRichiesta((r) => ({ ...r, ...parziale }));
  }

  async function scegliFile(scelto: File | undefined) {
    if (!scelto) return;
    setPreparazione("Preparo il documento…");
    const pronto = await preparaDocumento(scelto);
    setFile(pronto.file);
    setNomeFile(pronto.file.name);
    setPreparazione(
      pronto.rimpicciolita
        ? `Foto alleggerita da ${Math.round((pronto.byteIniziali / 1024 / 1024) * 10) / 10} MB a ${Math.round((pronto.byteFinali / 1024 / 1024) * 10) / 10} MB.`
        : null,
    );
  }

  /**
   * Fine del primo passo: qui nasce la pratica.
   *
   * Se il salvataggio fallisce non si prosegue, e si dice perche': senza
   * pratica non c'e' niente da pagare, e mandare una persona verso una cassa
   * che non esiste e' il modo peggiore di perderla.
   */
  async function avanza() {
    setIntoppo(null);
    setAttesa("Un momento…");

    const salvato = ricordaToken(
      await salvaPratica({
        token,
        nome: richiesta.nome.trim(),
        email: richiesta.email.trim(),
        famiglia: richiesta.famiglia,
        fineLavori: richiesta.fineLavori || undefined,
      }),
    );
    setAttesa(null);

    if (!salvato && !token) {
      setIntoppo(
        "Non riusciamo a registrare la richiesta in questo momento. Scrivici e la apriamo noi:",
      );
      return;
    }
    setPasso(2);
  }

  /**
   * Secondo passo: la fattura sale e si apre il pagamento.
   *
   * Se la fattura non sale non ci si ferma: il cliente va a pagare lo stesso e
   * il documento si richiede dopo.
   */
  async function versoLaCassa() {
    const buono = token ?? leggiToken();
    if (!buono) {
      setIntoppo("La richiesta non risulta aperta. Ricontrolla i tuoi dati, oppure scrivici:");
      setPasso(1);
      return;
    }

    setIntoppo(null);
    if (file) {
      setAttesa("Carico la fattura…");
      await caricaFattura(buono, file);
    }

    setAttesa("Apro il pagamento…");
    const esito = await apriPagamento(buono);
    if ("url" in esito) {
      window.location.href = esito.url;
      return;
    }
    setAttesa(null);
    // Mai un pulsante che non fa niente senza spiegare perche', e mai una
    // frase generica al posto del motivo vero.
    setIntoppo(`${esito.errore} Se ricapita scrivici e lo sistemiamo subito:`);
  }

  // Quanti giorni restano: null se la data manca o non e' leggibile.
  const restano = richiesta.fineLavori ? giorniRimasti(richiesta.fineLavori) : null;
  const primoPronto = datiCompleti(richiesta);
  const pronto = completa(richiesta, file !== null);

  return (
    <Guscio
      titolo="Fai partire la tua pratica ENEA — EneaSubito"
      descrizione="Chi sei, dove scriverti, la foto della fattura. Poi 99 € e la pratica parte."
      percorso="/verifica"
    >
      <div className="es-wrap">
        <div className="es-passo">
          <p className="es-etichetta">Passo {passo} di 2</p>

          {passo === 1 ? (
            <>
              <h1 className="es-domandona es-serif">Fai partire la tua pratica</h1>
              <p className="es-aiuto">
                Cominciamo da due cose. La fattura te la chiediamo dopo: se non ce l'hai sottomano,
                riprendi con calma quando ce l'hai.
              </p>

              <div className="es-campone">
                <label htmlFor="intervento">Che lavoro hai fatto</label>
                <div className="es-scelte" id="intervento">
                  {FAMIGLIE.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="es-scelta"
                      aria-pressed={richiesta.famiglia === f.id}
                      onClick={() => aggiorna({ famiglia: f.id })}
                    >
                      <b>{f.nome}</b>
                      <span>{f.esempi}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="es-campone">
                <label htmlFor="nome">Nome e cognome di chi è in fattura</label>
                <input
                  id="nome"
                  type="text"
                  autoComplete="name"
                  placeholder="Mario Rossi"
                  value={richiesta.nome}
                  onChange={(e) => aggiorna({ nome: e.target.value })}
                />
                <p className="es-aiuto">
                  Dev'essere l'intestatario della fattura: è lui il beneficiario, cioè chi porta la
                  spesa in detrazione.
                </p>
              </div>

              <div className="es-campone">
                <label htmlFor="email">La tua e-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={richiesta.email}
                  onChange={(e) => aggiorna({ email: e.target.value })}
                />
                <p className="es-aiuto">
                  È qui che ti mandiamo la ricevuta del pagamento e la pratica finita.
                </p>
              </div>

              {/* La data e' facoltativa e sta qui per due motivi: dice alla
                  persona quanto tempo le resta — ed e' l'unica urgenza vera
                  che abbiamo, perche' il termine corre davvero da li' — e
                  rende personale il messaggio di ripresa, che invece di
                  «entro 90 giorni» puo' dire «ti restano 23 giorni».
                  Facoltativa perche' il contatto vale piu' della data: chi
                  non la sa deve poter proseguire lo stesso. */}
              <div className="es-campone">
                <label htmlFor="fine-lavori">Quando sono finiti i lavori</label>
                <input
                  id="fine-lavori"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={richiesta.fineLavori}
                  onChange={(e) => aggiorna({ fineLavori: e.target.value })}
                />
                {restano === null && (
                  <p className="es-aiuto">
                    Facoltativa. Il termine per l'ENEA corre da quel giorno: sapendola ti diciamo
                    subito quanto tempo ti resta. Se la data esatta ti sfugge, prosegui pure.
                  </p>
                )}
                {restano !== null && restano > 0 && (
                  <p className="es-riscontro">
                    Ti restano <b>{restano} giorni</b> per trasmettere la pratica.
                  </p>
                )}
                {restano === 0 && (
                  <p className="es-riscontro es-attenzione">Oggi è l'ultimo giorno utile.</p>
                )}
                {restano !== null && restano < 0 && (
                  <p className="es-riscontro es-attenzione">
                    Dalla fine dei lavori sono passati più di 90 giorni. Il termine corre dalla data
                    che attesta l'impresa: se può confermartene una più recente, il{" "}
                    <a href="/modulo-fine-lavori">modulo di fine lavori</a> è pronto da far firmare.
                    Intanto prosegui, poi ne parliamo.
                  </p>
                )}
              </div>

              <div className="es-navigazione">
                <button
                  type="button"
                  className="es-bottone es-bottone-pieno es-bottone-grande"
                  disabled={!primoPronto || attesa !== null}
                  style={{ opacity: primoPronto && !attesa ? 1 : 0.5 }}
                  onClick={avanza}
                >
                  {attesa ?? "Continua"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="es-domandona es-serif">Ci siamo quasi</h1>
              <p className="es-aiuto">
                Resta la fattura del tuo fornitore. Una foto va benissimo.
              </p>

              <div className="es-campone">
                <label htmlFor="scatta">La fattura dell'installatore</label>
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
              </div>

              <div className="es-navigazione">
                <button
                  type="button"
                  className="es-bottone es-bottone-pieno es-bottone-grande"
                  disabled={!pronto || attesa !== null}
                  style={{ opacity: pronto && !attesa ? 1 : 0.5 }}
                  onClick={versoLaCassa}
                >
                  {attesa ?? "Vai al pagamento"}
                </button>
              </div>

              <p className="es-micro">
                <button
                  type="button"
                  className="es-collegamento"
                  onClick={() => {
                    setIntoppo(null);
                    setPasso(1);
                  }}
                >
                  Torna indietro e correggi i tuoi dati
                </button>
              </p>
            </>
          )}

          {/* Il recapito sta qui, non solo nel pie' di pagina: e' il punto in cui
              il cliente decide se tirare fuori 99 euro, ed e' li' che vuole
              sapere che dall'altra parte c'e' qualcuno. Prima compariva
              soltanto in caso di errore, cioe' quando ormai era tardi. */}
          <p className="es-micro">
            Pagamento sicuro con Stripe. Hai un dubbio? Scrivici a{" "}
            <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>
          </p>

          {intoppo && (
            <p className="es-riscontro es-attenzione">
              {intoppo} <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>
            </p>
          )}
        </div>
      </div>
    </Guscio>
  );
}
