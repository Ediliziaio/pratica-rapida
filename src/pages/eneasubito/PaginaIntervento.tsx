/**
 * Una pagina d'intervento di EneaSubito (/infissi, /schermature-solari,
 * /pompe-di-calore). Il contenuto arriva da `interventi.ts`: qui c'è solo
 * l'impaginazione, uguale per tutte e tre.
 */
import { useParams } from "react-router-dom";

import { Guscio, Spunta } from "./Guscio";
import { trovaIntervento, type Intervento } from "./interventi";
import NonTrovata from "./NonTrovata";

export function PaginaIntervento({ slug }: { slug?: string }) {
  const params = useParams();
  const intervento = trovaIntervento(slug ?? params.slug);
  if (!intervento) return <NonTrovata />;
  return <Contenuto intervento={intervento} />;
}

function Contenuto({ intervento }: { intervento: Intervento }) {
  return (
    <Guscio
      titolo={intervento.titoloSeo}
      descrizione={intervento.descrizione}
      percorso={`/${intervento.slug}`}
    >
      <section className="es-wrap es-intro">
        <span className="es-occhiello">{intervento.occhiello}</span>
        <h1 className="es-serif">{intervento.h1}</h1>
        <p>{intervento.intro}</p>
      </section>

      {intervento.sezioni.map((sezione) => (
        <section key={sezione.titolo} className="es-wrap es-corpo">
          <h2 className="es-serif">{sezione.titolo}</h2>
          {sezione.paragrafi?.map((testo) => (
            <p key={testo}>{testo}</p>
          ))}
          {sezione.elenco && (
            <ul>
              {sezione.elenco.map((voce) => (
                <li key={voce}>
                  <span style={{ color: "var(--es-verde)" }}><Spunta /></span>
                  {voce}
                </li>
              ))}
            </ul>
          )}
          {sezione.note?.map((testo) => (
            <p key={testo}>{testo}</p>
          ))}
        </section>
      ))}

      <div className="es-wrap">
        <section className="es-richiamo">
          <div>
            <b className="es-serif">Fai partire la tua pratica ENEA</b>
            <span>
              Il nome di chi è in fattura, la tua e-mail, la foto della fattura. Due minuti e 99 €,
              e in 48 ore lavorative la pratica è pronta.
            </span>
          </div>
          <a className="es-bottone es-bottone-pieno" href="/verifica">Fai partire la pratica</a>
        </section>
      </div>
    </Guscio>
  );
}

export default PaginaIntervento;
