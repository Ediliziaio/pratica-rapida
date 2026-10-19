/**
 * La chat di EneaSubito.
 *
 * **Perche' esiste.** Non per reggere il volume — con venti visite al giorno
 * le conversazioni sono una o due — ma per far vedere che dall'altra parte
 * c'e' una struttura. Un servizio senza telefono e' gia' anomalo; la sola
 * e-mail sembra uno che lavora dal tavolo di cucina. Ed e' la domanda numero
 * uno dei clienti: nell'esportazione WhatsApp dell'altro marchio «mi potete
 * chiamare?» e' la piu' frequente in assoluto.
 *
 * **Risponde sempre, subito**, con le risposte scritte a mano (domande.ts) e
 * non generate da nessun modello: su un argomento dove sbagliare vale
 * migliaia di euro di detrazione al cliente, prevedibile batte brillante.
 *
 * **E dal 19/10/2026 e' una chat vera.** Prima prometteva una chat e
 * consegnava una mail; il Titolare l'ha detto con precisione: «non posso
 * scrivere sulla chat e ricevere una risposta sulla mail». Ora chi scrive
 * apre una conversazione, e la risposta dell'operatore compare qui dentro,
 * dove l'ha chiesta. L'indirizzo e-mail resta facoltativo e serve a una cosa
 * sola: riprendere chi se ne va prima che qualcuno risponda.
 *
 * Mai una telefonata: il Titolare ha deciso il 16/10/2026 che telefonate non
 * se ne fanno.
 *
 * Nessun servizio esterno: con un account condiviso Crisp o Tawk i due marchi
 * risulterebbero collegati, e la pagina privacy che dice «l'unico servizio
 * esterno e' Stripe» diventerebbe falsa.
 */
import { useEffect, useRef, useState } from "react";

import { cerca, IN_VETRINA, type Domanda } from "./domande";
import { APERTURA, inOrario, quandoRispondiamo, statoBreve } from "./orari";
import { apri, chiaveSalvata, leggi, scrivi, type MessaggioChat } from "./conversazione";

/**
 * Il nome dell'evento con cui la si apre da fuori.
 *
 * Serve perche' la chat non vive solo nel suo bottone in basso a destra: c'e'
 * anche un richiamo dentro la pagina, sotto il pulsante principale, che e' il
 * punto in cui il dubbio viene davvero. Un evento del browser invece di uno
 * stato condiviso: due righe, nessuna libreria, e chiunque puo' chiamarla.
 */
export const APRI_CHAT = "eneasubito:apri-chat";

/** Il richiamo dentro la pagina. Apre la stessa chat del bottone. */
export function RichiamoChat() {
  return (
    <button
      type="button"
      className="es-chat-richiamo"
      onClick={() => window.dispatchEvent(new CustomEvent(APRI_CHAT))}
    >
      <span className="es-chat-richiamo-icona">
        <OperatoreIcona size={24} />
      </span>
      <span>
        <b>Un dubbio prima di partire?</b>
        <i>Rispondiamo subito, anche adesso</i>
      </span>
      <span className="es-chat-richiamo-azione">Scrivici →</span>
    </button>
  );
}

/** Operatore con cuffia e microfono. */
function OperatoreIcona({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" />
      <path d="M4 12.5v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 12h1.6v4H4a1.6 1.6 0 0 1-1.6-1.6v-.8A1.6 1.6 0 0 1 4 12z" fill="currentColor" />
      <path d="M20 12h-1.6v4H20a1.6 1.6 0 0 0 1.6-1.6v-.8A1.6 1.6 0 0 0 20 12z" fill="currentColor" />
    </svg>
  );
}

type Stato = "chiusa" | "aperta";

export function Chat() {
  const [stato, setStato] = useState<Stato>("chiusa");
  const [aperta, setAperta] = useState<Domanda | null>(null);
  const [scritto, setScritto] = useState("");
  const [email, setEmail] = useState("");
  const [intoppo, setIntoppo] = useState(false);
  const [inviando, setInviando] = useState(false);

  // La conversazione vera: finche' e' nulla, la chat e' solo l'elenco delle
  // risposte pronte. Appena la persona scrive, nasce e resta.
  const [chiave, setChiave] = useState<string | null>(() => chiaveSalvata());
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);

  const rifTesto = useRef<HTMLTextAreaElement>(null);
  const rifFondo = useRef<HTMLDivElement>(null);
  const [vuoleScrivere, setVuoleScrivere] = useState(false);

  // La apre anche il richiamo dentro la pagina.
  useEffect(() => {
    const apriPannello = () => setStato("aperta");
    window.addEventListener(APRI_CHAT, apriPannello);
    return () => window.removeEventListener(APRI_CHAT, apriPannello);
  }, []);

  // Chi apre la chat si aspetta che Esc la chiuda.
  useEffect(() => {
    if (stato !== "aperta") return;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStato("chiusa");
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [stato]);

  /**
   * Si ricontrolla ogni tre secondi, ma solo a pannello aperto.
   *
   * Non e' la via piu' elegante — esiste di meglio — ma e' quella che non
   * costringe ad aprire le tabelle al browser anonimo. Con una o due
   * conversazioni al giorno, tre secondi di attesa non li nota nessuno e il
   * costo e' zero.
   */
  useEffect(() => {
    if (stato !== "aperta" || !chiave) return;
    let vivo = true;
    async function aggiorna() {
      const d = await leggi(chiave!);
      if (vivo && d) setMessaggi(d.messaggi);
    }
    void aggiorna();
    const orologio = setInterval(aggiorna, 3000);
    return () => {
      vivo = false;
      clearInterval(orologio);
    };
  }, [stato, chiave]);

  // Ogni messaggio nuovo porta la conversazione in fondo, dove si legge.
  useEffect(() => {
    rifFondo.current?.scrollIntoView({ block: "end" });
  }, [messaggi.length, aperta]);

  const proposte = cerca(scritto);
  const scrittoAbbastanza = scritto.trim().length >= 10;
  const conversazioneViva = !!chiave && messaggi.length > 0;
  const emailBuona = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  /**
   * Manda il messaggio, aprendo la conversazione se non c'e' ancora.
   *
   * La risposta arriva **qui dentro**, non per mail: e' la ragione per cui
   * questa chat e' stata rifatta. L'indirizzo resta facoltativo, e serve solo
   * a riprendere chi se ne va prima che rispondiamo.
   */
  async function manda() {
    const testo = scritto.trim();
    if (testo.length < 1 || inviando) return;
    setInviando(true);
    setIntoppo(false);

    const pagina = typeof window === "undefined" ? "" : window.location.pathname;
    let suo = chiave;
    if (!suo) {
      suo = await apri(pagina);
      if (!suo) {
        setInviando(false);
        setIntoppo(true);
        return;
      }
      setChiave(suo);
    }

    const andata = await scrivi(suo, testo, emailBuona ? email.trim() : undefined, pagina);
    setInviando(false);
    if (!andata) {
      setIntoppo(true);
      return;
    }
    setScritto("");
    setAperta(null);
    setVuoleScrivere(true);
    const d = await leggi(suo);
    if (d) setMessaggi(d.messaggi);
  }

  if (stato === "chiusa") {
    return (
      <button
        type="button"
        className="es-chat-bolla"
        onClick={() => setStato("aperta")}
        aria-label="Apri l'assistenza online"
      >
        <OperatoreIcona size={28} />
        <span>
          Assistenza
          <b>
            {/* Il pallino verde acceso a mezzanotte e' una bugia piccola che
                costa cara: chi scrive alle 23 aspetta una risposta subito,
                non la riceve, e la mattina dopo non e' piu' un cliente. */}
            {inOrario() && <i className="es-chat-pallino" aria-hidden="true" />}
            {statoBreve()}
          </b>
        </span>
      </button>
    );
  }

  return (
    <div className="es-chat" role="dialog" aria-label="Assistenza EneaSubito">
      <div className="es-chat-testa">
        <div>
          <strong>Assistenza</strong>
          <span>{inOrario() ? "Rispondiamo subito" : `Rispondiamo dalle ${APERTURA}`}</span>
        </div>
        <button type="button" onClick={() => setStato("chiusa")} aria-label="Chiudi">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="es-chat-corpo">
        {conversazioneViva ? (
          <>
            {messaggi.map((m) => (
              <div
                key={m.id}
                className={m.da === "cliente" ? "es-chat-mio" : "es-chat-suo"}
              >
                {m.da !== "cliente" && <b>Assistenza</b>}
                <p>{m.testo}</p>
              </div>
            ))}
            {/* Senza questo, chi scrive fuori orario resta a fissare la
                conversazione aspettando una risposta che arriva domani. */}
            <p className="es-chat-coda">{quandoRispondiamo()}</p>
          </>
        ) : aperta ? (
          <>
            <button type="button" className="es-chat-torna" onClick={() => setAperta(null)}>
              ← Tutte le domande
            </button>
            <h3 className="es-chat-domanda">{aperta.domanda}</h3>
            {aperta.risposta.split("\n\n").map((paragrafo) => (
              <p key={paragrafo} className="es-chat-risposta">{paragrafo}</p>
            ))}
            <button
              type="button"
              className="es-chat-scrivici"
              onClick={() => {
                setVuoleScrivere(true);
                rifTesto.current?.focus();
              }}
            >
              Non è questo che chiedevo: scrivici
            </button>
          </>
        ) : (
          <>
            <p className="es-chat-intro">
              Rispondiamo subito alle domande qui sotto. Per tutto il resto scrivici: la risposta
              arriva qui, in questa finestra.
            </p>
            {(scrittoAbbastanza ? proposte : IN_VETRINA).map((d) => (
              <button key={d.id} type="button" className="es-chat-voce" onClick={() => setAperta(d)}>
                {d.domanda}
              </button>
            ))}
            <button
              type="button"
              className="es-chat-scrivici"
              onClick={() => {
                setVuoleScrivere(true);
                rifTesto.current?.focus();
              }}
            >
              Nessuna di queste? Scrivici direttamente
            </button>
          </>
        )}
        <div ref={rifFondo} />
      </div>

      <div className="es-chat-piede">
        <textarea
          ref={rifTesto}
          rows={2}
          placeholder={conversazioneViva ? "Scrivi un messaggio…" : "Scrivi la tua domanda…"}
          value={scritto}
          onChange={(e) => {
            setScritto(e.target.value);
            if (!conversazioneViva) setAperta(null);
            setIntoppo(false);
          }}
          onKeyDown={(e) => {
            // Invio manda, come in qualunque chat. Chi vuole andare a capo
            // tiene premuto shift.
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            void manda();
          }}
          aria-label="Scrivi il tuo messaggio"
        />

        {/* L'indirizzo e' facoltativo e si chiede una volta sola: la risposta
            arriva qui dentro, serve solo a riprendere chi se ne va prima. */}
        {(vuoleScrivere || conversazioneViva) && (
          <input
            type="email"
            placeholder="la tua e-mail (facoltativa, per avvisarti)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="La tua e-mail, facoltativa"
          />
        )}

        <button
          type="button"
          className="es-chat-manda"
          disabled={scritto.trim().length < 1 || inviando}
          onClick={() => void manda()}
        >
          {inviando ? "Un momento…" : "Manda"}
        </button>

        {intoppo && (
          <p className="es-chat-coda">
            Non siamo riusciti a inviarlo. Scrivici a{" "}
            <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>.
          </p>
        )}
      </div>
    </div>
  );
}
