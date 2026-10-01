/**
 * Le tre pagine legali di EneaSubito (/es/privacy, /es/termini, /es/cookie).
 * Il testo sta in `legali.ts`: qui c'è solo l'impaginazione.
 *
 * Non le legge quasi nessun cliente, ma le leggono Stripe quando verifica il
 * sito e chiunque apra una contestazione. Per questo sono scritte in italiano
 * comprensibile e non in burocratese.
 */
import { useParams } from "react-router-dom";

import { Guscio } from "./Guscio";
import { trovaDocumento, type Documento } from "./legali";
import NotFound from "@/pages/NotFound";

export function PaginaLegale({ slug }: { slug?: string }) {
  const params = useParams();
  const documento = trovaDocumento(slug ?? params.slug);
  if (!documento) return <NotFound />;
  return <Contenuto documento={documento} />;
}

function Contenuto({ documento }: { documento: Documento }) {
  return (
    <Guscio
      titolo={documento.titoloSeo}
      descrizione={documento.descrizione}
      percorso={`/es/${documento.slug}`}
    >
      <section className="es-wrap es-intro">
        <h1 className="es-serif">{documento.titolo}</h1>
        <p style={{ fontSize: 16, color: "var(--es-inchiostro-debole)" }}>
          Ultimo aggiornamento: {documento.aggiornato}
        </p>
      </section>

      {documento.sezioni.map((sezione) => (
        <section key={sezione.titolo} className="es-wrap es-corpo">
          <h2 className="es-serif" style={{ fontSize: 24 }}>{sezione.titolo}</h2>
          {sezione.elenco && (
            <ul>
              {sezione.elenco.map((voce) => (
                <li key={voce}>
                  <span style={{ color: "var(--es-verde)", flexShrink: 0 }}>·</span>
                  {voce}
                </li>
              ))}
            </ul>
          )}
          {sezione.paragrafi?.map((testo) => (
            <p key={testo}>{testo}</p>
          ))}
        </section>
      ))}

      <div style={{ height: 72 }} />
    </Guscio>
  );
}

export default PaginaLegale;
