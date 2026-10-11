/**
 * /verifica — il modulo di EneaSubito.
 *
 * Una schermata sola, tre cose, e poi la cassa. Nessun esito da leggere,
 * nessun «ti facciamo sapere»: quel passaggio e' stato eliminato dal Titolare
 * l'11/10/2026 perche' offriva a un potenziale cliente l'occasione di andarsene.
 *
 * Tutto il resto — catastali, certificati, bonifico, date — si chiede DOPO il
 * pagamento, con il modulo che Pratica Rapida usa gia' tutti i giorni. La
 * misura sulle bozze del CRM dice che documenti e catastali si mangiano il 64%
 * degli abbandoni: davanti alla cassa non ci devono stare.
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
import { completa, type Famiglia, type Richiesta } from "./logica";

const MEMORIA = "eneasubito-verifica";
const MEMORIA_TOKEN = "eneasubito-pratica";

const FAMIGLIE: { id: Famiglia; nome: string; esempi: string }[] = [
  { id: "infissi", nome: "Infissi", esempi: "Finestre, portefinestre, porte d'ingresso" },
  { id: "schermature", nome: "Schermature solari", esempi: "Tende da sole, pergotende, pergole" },
  { id: "pompe_di_calore", nome: "Pompa di calore", esempi: "Riscaldamento con pompa di calore" },
];

const AMMESSE = FAMIGLIE.map((f) => f.id) as string[];

function vuota(): Richiesta {
  return { famiglia: null, nome: "", email: "" };
}

function leggiMemoria(): Richiesta {
  try {
    const salvato = localStorage.getItem(MEMORIA);
    return salvato ? { ...vuota(), ...JSON.parse(salvato) } : vuota();
  } catch {
    return vuota();
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
  const [file, setFile] = useState<File | null>(null);
  const [nomeFile, setNomeFile] = useState<string | null>(null);
  const [preparazione, setPreparazione] = useState<string | null>(null);
  const [attesa, setAttesa] = useState<string | null>(null);
  const [intoppo, setIntoppo] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MEMORIA_TOKEN);
    } catch {
      return null;
    }
  });

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
      localStorage.setItem(MEMORIA_TOKEN, nuovo);
    } catch {
      // Pazienza: il token resta comunque in memoria per questa visita.
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
   * Dal modulo alla cassa, senza fermate.
   *
   * L'ordine conta: prima nasce la pratica (serve il token per tutto il
   * resto), poi sale la fattura, infine si apre il pagamento. Se la fattura
   * non sale non ci si ferma: il cliente va a pagare lo stesso e il documento
   * si richiede dopo. Se non nasce la pratica, invece, non c'e' niente da
   * pagare e glielo si dice in chiaro.
   */
  async function versoLaCassa() {
    setIntoppo(null);
    setAttesa("Un momento…");

    const salvato = ricordaToken(
      await salvaPratica({
        token,
        nome: richiesta.nome.trim(),
        email: richiesta.email.trim(),
        famiglia: richiesta.famiglia,
      }),
    );
    const buono = salvato ?? token;
    if (!buono) {
      setAttesa(null);
      setIntoppo("Non riusciamo a registrare la richiesta in questo momento. Scrivici e la apriamo noi:");
      return;
    }

    if (file) {
      setAttesa("Carico la fattura…");
      await caricaFattura(buono, file);
    }

    setAttesa("Apro il pagamento…");
    const url = await apriPagamento(buono);
    if (url) {
      window.location.href = url;
      return;
    }
    setAttesa(null);
    // Mai un pulsante che non fa niente senza spiegare perche'.
    setIntoppo("Il pagamento non si apre in questo momento. Scrivici e lo sistemiamo subito:");
  }

  const pronto = completa(richiesta, file !== null);

  return (
    <Guscio
      titolo="Fai partire la tua pratica ENEA — EneaSubito"
      descrizione="Chi sei, dove scriverti, la foto della fattura. Poi 99 € e la pratica parte."
      percorso="/verifica"
    >
      <div className="es-wrap">
        <div className="es-passo">
          <h1 className="es-domandona es-serif">Fai partire la tua pratica</h1>
          <p className="es-aiuto">
            Tre cose e hai finito. Il resto dei dati te li chiediamo dopo, con calma, quando la pratica
            è già tua.
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
              Dev'essere l'intestatario della fattura: è lui il beneficiario, cioè chi porta la spesa in
              detrazione.
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
            <p className="es-aiuto">È qui che ti mandiamo la ricevuta del pagamento e la pratica finita.</p>
          </div>

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
              {attesa ?? "Paga 99 € e falla partire"}
            </button>
          </div>

          <p className="es-micro">
            Pagamento sicuro con Stripe. Se la tua pratica non si può fare, ti restituiamo tutto.
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
