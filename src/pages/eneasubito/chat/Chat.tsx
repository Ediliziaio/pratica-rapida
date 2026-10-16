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
import { mandaMessaggio } from "./invio";

type Stato = "chiusa" | "aperta";

export function Chat() {
  const [stato, setStato] = useState<Stato>("chiusa");
  const [aperta, setAperta] = useState<Domanda | null>(null);
  const [scritto, setScritto] = useState("");
  const [email, setEmail] = useState("");
  const [invio, setInvio] = useState<"fermo" | "in_corso" | "fatto" | "errore">("fermo");
  const pannello = useRef<HTMLDivElement>(null);

  // Chi apre la chat si aspetta che Esc la chiuda.
  useEffect(() => {
    if (stato !== "aperta") return;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStato("chiusa");
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [stato]);

  const proposte = cerca(scritto);
  const scrittoAbbastanza = scritto.trim().length >= 10;
  // Si offre di prendere il messaggio solo quando non abbiamo niente da
  // proporre: se la risposta ce l'abbiamo, farlo scrivere e' tempo perso.
  const daGirare = scrittoAbbastanza && proposte.length === 0;
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
        {/* Operatore con cuffia e microfono: si capisce in un colpo d'occhio
            che di la' c'e' qualcuno, molto piu' di un fumetto generico. */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" />
          <path d="M4 12.5v-1a8 8 0 0 1 16 0v1" />
          <path d="M4 12h1.6v4H4a1.6 1.6 0 0 1-1.6-1.6v-.8A1.6 1.6 0 0 1 4 12z" fill="currentColor" />
          <path d="M20 12h-1.6v4H20a1.6 1.6 0 0 0 1.6-1.6v-.8A1.6 1.6 0 0 0 20 12z" fill="currentColor" />
        </svg>
        <span>
          Assistenza
          <b>
            <i className="es-chat-pallino" aria-hidden="true" />
            online
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
          </>
        ) : (
          <>
            <p className="es-chat-intro">
              Rispondiamo subito alle domande qui sotto. Per tutto il resto scrivici: ti rispondiamo
              per mail entro poche ore.
            </p>
            {(scrittoAbbastanza ? proposte : IN_VETRINA).map((d) => (
              <button key={d.id} type="button" className="es-chat-voce" onClick={() => setAperta(d)}>
                {d.domanda}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="es-chat-piede">
        {invio === "fatto" ? (
          <p className="es-chat-esito">
            Ricevuto. Ti rispondiamo per mail entro poche ore.
          </p>
        ) : (
          <>
            <textarea
              rows={2}
              placeholder="Scrivi la tua domanda…"
              value={scritto}
              onChange={(e) => {
                setScritto(e.target.value);
                setAperta(null);
                if (invio === "errore") setInvio("fermo");
              }}
              aria-label="Scrivi la tua domanda"
            />
            {daGirare && (
              <>
                <p className="es-chat-coda">
                  Questa la giriamo a un tecnico. Lasciaci la tua e-mail per la risposta.
                </p>
                <input
                  type="email"
                  placeholder="la tua e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="La tua e-mail"
                />
                <button
                  type="button"
                  className="es-chat-manda"
                  disabled={!emailBuona || invio === "in_corso"}
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
