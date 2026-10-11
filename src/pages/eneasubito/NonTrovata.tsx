/**
 * Pagina non trovata di EneaSubito. Esiste perché quella dell'altro marchio
 * tirerebbe dentro il suo codice e i suoi testi.
 */
import { Link } from "react-router-dom";

import { Guscio } from "./Guscio";

export default function NonTrovata() {
  return (
    <Guscio
      titolo="Pagina non trovata — EneaSubito"
      descrizione="La pagina che cercavi non esiste."
      percorso="/404"
    >
      <section className="es-wrap es-intro">
        <h1 className="es-serif">Questa pagina non c'è.</h1>
        <p>Può darsi che l'indirizzo sia cambiato, o che ci sia un refuso.</p>
        <div className="es-azioni">
          <Link className="es-bottone es-bottone-pieno" to="/verifica">Verifica la tua pratica</Link>
          <Link className="es-bottone es-bottone-vuoto" to="/">Torna all'inizio</Link>
        </div>
      </section>
      <div style={{ height: 96 }} />
    </Guscio>
  );
}
