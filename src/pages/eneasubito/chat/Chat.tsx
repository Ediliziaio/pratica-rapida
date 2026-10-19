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
 * **L'unica regola che conta: risponde sempre, subito.** Se uno scrive alle
 * undici di sera e legge «siamo offline», abbiamo ottenuto il contrario di
 * quello che volevamo. Per questo le risposte sono scritte (vedi domande.ts)
 * e non le genera nessun modello: su un argomento dove sbagliare vale
 * migliaia di euro di detrazione, prevedibile batte brillante.
 *
 * Promette **una risposta subito** e **una persona entro poche ore**. Mai una
 * persona in tempo reale, e mai una telefonata: il Titolare ha deciso il
 * 16/10/2026 che telefonate non se ne fanno.
 *
 * Nessun servizio esterno: con un account condiviso Crisp o Tawk i due marchi
 * risulterebbero collegati, e la pagina privacy che dice «l'unico servizio
 * esterno e' Stripe» diventerebbe falsa.
 */
import { useEffect, useRef, useState } from "react";

import { cerca, IN_VETRINA, type Domanda } from "./domande";
import { inOrario, quandoRispondiamo, statoBreve } from "./orari";
import { mandaMessaggio } from "./invio";

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
  const [invio, setInvio] = useState<"fermo" | "in_corso" | "fatto" | "errore">("fermo");
  const pannello = useRef<HTMLDivElement>(null);

  // La apre anche il richiamo dentro la pagina.
  useEffect(() => {
    const apri = () => setStato("aperta");
    window.addEventListener(APRI_CHAT, apri);
    return () => window.removeEventListener(APRI_CHAT, apri);
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

  const rifEmail = useRef<HTMLInputElement>(null);
  const rifTesto = useRef<HTMLTextAreaElement>(null);
  // Il pulsante «scrivici» e' sempre li', anche prima che la persona abbia
  // scritto qualcosa: la via per parlare con un umano non deve dipendere da
  // quello che la macchina crede di aver capito.
  const [vuoleScrivere, setVuoleScrivere] = useState(false);

  const proposte = cerca(scritto);
  const scrittoAbbastanza = scritto.trim().length >= 10;
  /**
   * Si puo' SEMPRE mandare la domanda, appena c'e' qualcosa di scritto.
   *
   * Prima il modo per scrivere a un umano compariva soltanto quando la
   * ricerca non trovava niente di somigliante. Sembrava sensato — se la
   * risposta ce l'abbiamo, perche' far scrivere? — ed era la trappola: chi
   * chiedeva «posso caricare piu' di una fattura?» si vedeva proporre
   * quattro domande che contenevano la parola «fattura» e nessuna che
   * rispondeva, e il modo per mandare la domanda spariva proprio perche' la
   * ricerca aveva trovato qualcosa. Piu' la ricerca «funzionava», piu' la
   * persona restava chiusa dentro.
   *
   * Un cliente vero ci ha scritto due volte — la seconda per dire «LA CHAT
   * NON FUNZIONA» — e aveva ragione. Una via d'uscita che si chiude da sola
   * e' peggio di nessuna via d'uscita, perche' intanto la persona ci ha
   * provato e se n'e' andata convinta che non rispondiamo.
   */
  const daGirare = scrittoAbbastanza || vuoleScrivere;
  const emailBuona = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  async function manda() {
    setInvio("in_corso");
    const esito = await mandaMessaggio({
      testo: scritto.trim(),
      email: email.trim(),
      pagina: typeof window === "undefined" ? "" : window.location.pathname,
    });
    setInvio(esito ? "fatto" : "errore");
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
    <div className="es-chat" ref={pannello} role="dialog" aria-label="Assistenza EneaSubito">
      <div className="es-chat-testa">
        <div>
          <b>Assistenza</b>
          <span>Rispondiamo subito</span>
        </div>
        <button type="button" onClick={() => setStato("chiusa")} aria-label="Chiudi">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="es-chat-corpo">
        {aperta ? (
          <>
            <button type="button" className="es-chat-torna" onClick={() => setAperta(null)}>
              ← Tutte le domande
            </button>
            <p className="es-chat-domanda">{aperta.domanda}</p>
            {aperta.risposta.split("\n\n").map((paragrafo) => (
              <p key={paragrafo} className="es-chat-risposta">{paragrafo}</p>
            ))}
            <p className="es-chat-coda">
              Ti serve altro? Scrivi qui sotto, oppure a{" "}
              <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>.
            </p>
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
              Rispondiamo subito alle domande qui sotto. Per tutto il resto scrivici per mail.{" "}
              {quandoRispondiamo()}
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
      </div>

      <div className="es-chat-piede">
        {invio === "fatto" ? (
          <p className="es-chat-esito">
            Ricevuto. {quandoRispondiamo()}
          </p>
        ) : (
          <>
            <textarea
              ref={rifTesto}
              rows={2}
              placeholder="Scrivi la tua domanda…"
              value={scritto}
              onChange={(e) => {
                setScritto(e.target.value);
                setAperta(null);
                if (invio === "errore") setInvio("fermo");
              }}
              onKeyDown={(e) => {
                // Invio manda, come in qualunque chat. Prima andava a capo e
                // basta: la persona premeva invio, non succedeva niente, e
                // concludeva che la chat era rotta. Chi vuole andare a capo
                // tiene premuto shift.
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (!scrittoAbbastanza) return;
                if (emailBuona) void manda();
                else rifEmail.current?.focus();
              }}
              aria-label="Scrivi la tua domanda"
            />
            {daGirare && (
              <>
                <p className="es-chat-coda">
                  {scritto.trim().length < 5
                    ? "Scrivi qui sopra la tua domanda e lasciaci la tua e-mail: ti rispondiamo noi."
                    : proposte.length > 0
                      ? "Nessuna di quelle qui sopra risponde? Lasciaci la tua e-mail e ti rispondiamo noi."
                      : "Questa la giriamo a un tecnico. Lasciaci la tua e-mail per la risposta."}
                </p>
                <input
                  ref={rifEmail}
                  type="email"
                  placeholder="la tua e-mail"
                  value={email}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && emailBuona && invio !== "in_corso") void manda();
                  }}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="La tua e-mail"
                />
                <button
                  type="button"
                  className="es-chat-manda"
                  disabled={!emailBuona || scritto.trim().length < 5 || invio === "in_corso"}
                  onClick={manda}
                >
                  {invio === "in_corso" ? "Un momento…" : "Manda"}
                </button>
              </>
            )}
            {invio === "errore" && (
              <p className="es-chat-coda">
                Non siamo riusciti a inviarlo. Scrivici a{" "}
                <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Chat;
