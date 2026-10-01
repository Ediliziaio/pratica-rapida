/**
 * /modulo-fine-lavori — il foglio da far compilare e firmare all'impresa.
 *
 * Serve a chi arriva fuori dai 90 giorni: il termine decorre da quando i
 * lavori sono stati effettivamente ultimati, e quella data la attesta chi i
 * lavori li ha fatti. Esce **in bianco** di proposito — quando lo offriamo non
 * sappiamo ancora chi sia l'impresa.
 *
 * Il testo è quello del facsimile che il Titolare usa da anni (DICHIARAZIONE
 * FINE LAVORI.docx), non una versione inventata qui. La variante infissi è la
 * sua parola per parola; per schermature e pompe di calore la struttura è la
 * stessa ma l'attestazione tecnica resta [DA SCRIVERE]: va messa la frase
 * giusta per quelle famiglie, e la sa lui.
 *
 * È una pagina e non un allegato PDF per due motivi: dal browser si salva in
 * PDF con un tocco, e i testi si correggono qui senza rigenerare niente.
 */
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";

type Famiglia = "infissi" | "schermature" | "pompe";

interface Variante {
  intervento: string;
  attestazioni: string[];
}

const VARIANTI: Record<Famiglia, Variante> = {
  infissi: {
    intervento: "sostituzione di serramenti comprensivi di infissi",
    attestazioni: [
      "Si dichiara che i prodotti installati rispettano i requisiti di trasmittanza termica previsti dalla normativa vigente ai fini delle detrazioni fiscali.",
      "Si dichiara inoltre che l'intervento consiste in sostituzione di elementi esistenti e che rispetta i requisiti tecnici richiesti per l'accesso alle detrazioni fiscali.",
    ],
  },
  schermature: {
    intervento: "installazione di schermature solari",
    attestazioni: [
      "[DA SCRIVERE: l'attestazione tecnica per le schermature — presumibilmente il valore Gtot e la conformità ai requisiti di legge. Metterla com'è giusta, non come la immagino io.]",
    ],
  },
  pompe: {
    intervento: "installazione di impianto di climatizzazione invernale con pompa di calore",
    attestazioni: [
      "[DA SCRIVERE: l'attestazione tecnica per le pompe di calore — i requisiti dell'apparecchio installato. Metterla com'è giusta, non come la immagino io.]",
    ],
  },
};

const ETICHETTE: Record<Famiglia, string> = {
  infissi: "Infissi",
  schermature: "Schermature solari",
  pompe: "Pompa di calore",
};

const STAMPA = `
.mfl { --inchiostro: #14201A; --tenue: #5A6A62; --bordo: #BFB9AC;
  background: #F5F2EC; color: var(--inchiostro); min-height: 100vh;
  font-family: "Work Sans Variable", system-ui, sans-serif; padding: 32px 16px; }
.mfl-barra { max-width: 760px; margin: 0 auto 20px; display: flex; flex-wrap: wrap; gap: 16px;
  align-items: center; justify-content: space-between; }
.mfl-barra p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--tenue); max-width: 440px; }
.mfl-scelte { display: flex; flex-wrap: wrap; gap: 8px; max-width: 760px; margin: 0 auto 20px; }
.mfl-scelte a { font-size: 14px; padding: 8px 14px; border: 1px solid var(--bordo); border-radius: 999px;
  text-decoration: none; color: var(--tenue); background: #fff; }
.mfl-scelte a[aria-current="page"] { border-color: #0E5A48; color: #0E5A48; font-weight: 600; }
.mfl-stampa { height: 48px; padding: 0 22px; border: none; border-radius: 10px; background: #0E5A48;
  color: #fff; font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
.mfl-foglio { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid var(--bordo);
  border-radius: 8px; padding: 56px 56px 64px; }
.mfl-foglio h1 { margin: 0 0 4px; font-family: "Fraunces Variable", Georgia, serif; font-size: 25px;
  font-weight: 600; letter-spacing: -0.3px; }
.mfl-foglio h2 { margin: 0 0 32px; font-size: 14px; font-weight: 500; color: var(--tenue); }
.mfl-foglio p { margin: 0 0 16px; font-size: 15px; line-height: 2.05; }
.mfl-dichiara { margin: 24px 0 16px; font-size: 15px; font-weight: 700; letter-spacing: 1px; }
.mfl-vuoto { display: inline-block; min-width: 150px; border-bottom: 1px solid var(--inchiostro); }
.mfl-lungo { min-width: 280px; }
.mfl-corto { min-width: 80px; }
.mfl-firme { margin-top: 44px; display: flex; gap: 48px; }
.mfl-firme div { flex: 1 1 0; font-size: 14px; color: var(--tenue); }
.mfl-firme span { display: block; border-bottom: 1px solid var(--inchiostro); height: 46px; margin-bottom: 6px; }
.mfl-nota { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--bordo);
  font-size: 13px; line-height: 1.6; color: var(--tenue); }

@media print {
  .mfl { background: #fff; padding: 0; }
  .mfl-barra, .mfl-scelte { display: none; }
  .mfl-foglio { max-width: none; border: none; border-radius: 0; padding: 0; }
  @page { size: A4; margin: 18mm; }
}
`;

export default function ModuloFineLavori() {
  const [parametri] = useSearchParams();
  const richiesta = parametri.get("intervento") as Famiglia | null;
  const famiglia: Famiglia = richiesta && richiesta in VARIANTI ? richiesta : "infissi";
  const variante = VARIANTI[famiglia];

  return (
    <div className="mfl">
      <Helmet>
        <html lang="it" />
        <title>Dichiarazione di fine lavori — modulo da far firmare</title>
        <meta
          name="description"
          content="Modulo di dichiarazione di fine lavori da far compilare e firmare all'impresa che ha eseguito i lavori."
        />
        <meta name="robots" content="noindex, follow" />
        <style>{STAMPA}</style>
      </Helmet>

      <div className="mfl-barra">
        <p>
          Stampalo o salvalo in PDF e consegnalo all'impresa che ha fatto i lavori: deve compilarlo e
          firmarlo lei. Poi rimandacelo e pensiamo a tutto noi.
        </p>
        <button type="button" className="mfl-stampa" onClick={() => window.print()}>
          Stampa o salva in PDF
        </button>
      </div>

      <nav className="mfl-scelte" aria-label="Tipo di intervento">
        {(Object.keys(VARIANTI) as Famiglia[]).map((f) => (
          <a
            key={f}
            href={`/modulo-fine-lavori?intervento=${f}`}
            aria-current={f === famiglia ? "page" : undefined}
          >
            {ETICHETTE[f]}
          </a>
        ))}
      </nav>

      <div className="mfl-foglio">
        <h1>Dichiarazione di fine lavori</h1>
        <h2>ai fini delle detrazioni fiscali</h2>

        <p>
          La società <span className="mfl-vuoto mfl-lungo" />, con sede in{" "}
          <span className="mfl-vuoto mfl-lungo" />, partita IVA <span className="mfl-vuoto" />, in qualità
          di ☐ fornitore/installatore ☐ tecnico incaricato,
        </p>

        <p>
          dichiara sotto la propria responsabilità che presso l'immobile sito in{" "}
          <span className="mfl-vuoto mfl-lungo" />, nel Comune di <span className="mfl-vuoto" /> (
          <span className="mfl-vuoto mfl-corto" />), immobile detenuto dal Sig./Sig.ra{" "}
          <span className="mfl-vuoto mfl-lungo" />, codice fiscale <span className="mfl-vuoto" />,
        </p>

        <p>è stato eseguito il seguente intervento:</p>

        <p className="mfl-dichiara">
          {variante.intervento}, concluso in data <span className="mfl-vuoto mfl-corto" />.
        </p>

        {variante.attestazioni.map((frase) => (
          <p key={frase}>{frase}</p>
        ))}

        <p>Si allegano, ove disponibili, schede tecniche e documentazione del produttore.</p>

        <div className="mfl-firme">
          <div>
            <span />
            Data
          </div>
          <div>
            <span />
            Timbro e firma
          </div>
        </div>

        <p className="mfl-nota">
          La data di ultimazione dei lavori è quella da cui decorrono i 90 giorni per la trasmissione
          della comunicazione all'ENEA, e va indicata dall'impresa che ha eseguito i lavori.
        </p>
      </div>
    </div>
  );
}
