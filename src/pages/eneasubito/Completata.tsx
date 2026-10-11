/**
 * /completa/:token — dove atterra chi ha appena pagato.
 *
 * Non e' una pagina di cortesia: e' il momento in cui il cliente ha dato dei
 * soldi a un sito che non conosceva mezz'ora fa, e deve sapere esattamente
 * cosa succede adesso e quando. Niente «grazie!» e via.
 *
 * I dati che mancano (catastali, certificati, bonifico) glieli chiediamo
 * dopo, per e-mail: e' la parte noiosa, e chi ha pagato la fa. Finche' non
 * esiste il modulo lungo di questo marchio, quella richiesta parte a mano.
 */
import { useParams } from "react-router-dom";

import { Guscio, Spunta } from "./Guscio";

const PASSAGGI = [
  "Ti abbiamo mandato la fattura per e-mail: è già nella tua posta.",
  "Entro poche ore ti scriviamo per i dati che mancano — catastali, certificati, ricevuta del bonifico.",
  "Compiliamo e trasmettiamo all'ENEA entro 48 ore lavorative da quando abbiamo tutto.",
  "Ti arriva la ricevuta ufficiale in PDF, con il codice CPID: la stampi, la firmi e la conservi con la fattura.",
];

export default function Completata() {
  const { token } = useParams();
  return (
    <Guscio
      titolo="Pagamento ricevuto — EneaSubito"
      descrizione="Il pagamento è andato a buon fine: ecco cosa succede adesso."
      percorso="/completa"
    >
      <div className="es-wrap">
        <div className="es-verdetto es-verdetto-si">
          <div className="es-verdetto-testa">
            <h1 className="es-serif">Pagamento ricevuto.</h1>
            <p>La tua pratica è in lavorazione. Non devi fare altro adesso: ti scriviamo noi.</p>
          </div>

          <ul className="es-motivi">
            {PASSAGGI.map((p) => (
              <li key={p}>
                <span className="es-segno es-segno-ok">✓</span>
                {p}
              </li>
            ))}
          </ul>

          <p className="es-nota">
            Riferimento della tua pratica: <strong>{token?.slice(0, 8) ?? "—"}</strong>. Serve solo se ci
            scrivi: tienilo a portata, ma non devi farne niente.
          </p>

          <div className="es-navigazione">
            <a className="es-bottone es-bottone-pieno" href="mailto:assistenza@eneasubito.it">
              Scrivici
            </a>
            <span className="es-aiuto">Rispondiamo entro 24 ore.</span>
          </div>
        </div>
      </div>
      <div style={{ height: 72 }} />
    </Guscio>
  );
}
