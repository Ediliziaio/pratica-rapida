/**
 * eneasubito.it — la pagina di atterraggio del secondo marchio.
 *
 * Perimetro: infissi, schermature solari, pompe di calore. Il cliente dà il
 * minimo, il preflight risponde subito se la pratica si può fare, e solo dopo
 * il pagamento gli si chiede il resto.
 *
 * Deve dare l'idea di semplicità e di discount, quindi la pagina è volutamente
 * corta: sei blocchi, poche righe ciascuno, il prezzo nel titolo e il
 * confronto con quanto costa un tecnico. Ogni volta che si aggiunge un
 * paragrafo qui, se ne toglie un altro.
 *
 * Lo stile sta tutto sotto .es-root (vedi eneasubito/stile.ts) e non tocca le
 * variabili globali: il vestito di EneaSubito non può cambiare una virgola di
 * Pratica Rapida.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/work-sans";

import { Fulmine, Spunta } from "./eneasubito/Guscio";
import { STILE } from "./eneasubito/stile";

// Aliquote 2026: 50% sull'abitazione principale, su un esempio di 10.000 €.
// ⚠️ Dal 1° gennaio 2027 l'aliquota scende al 36%: qui diventano 3.600 €.
const DETRAZIONE_PRIMA_CASA = "5.000 €";

const PASSI: [string, string][] = [
  ["Rispondi a 4 domande", "Che lavoro hai fatto, quando è finito, la foto della fattura. Due minuti."],
  ["Ti diciamo se si può fare", "Subito, gratis, senza carta di credito e senza parlare con nessuno."],
  ["Paghi 99 €", "Solo se la risposta è sì. Carta o Apple Pay."],
  ["Ricevi la pratica", "La trasmettiamo all'ENEA e ti mandiamo la ricevuta col codice CPID."],
];

const FAMIGLIE: [string, string][] = [
  ["Infissi", "Finestre, portefinestre, porte d'ingresso. Anche zanzariere e tapparelle sulla stessa fattura."],
  ["Schermature solari", "Tende da sole, pergotende, pergole con telo tecnico."],
  ["Pompe di calore", "Riscaldamento con pompa di calore, anche al posto della vecchia caldaia."],
];

const INCLUSO = [
  "Controllo dei documenti",
  "Compilazione della pratica",
  "Trasmissione all'ENEA",
  "Ricevuta col codice CPID",
];

const DOMANDE: [string, string][] = [
  ["Perché costa così poco?", "Perché non c'è uno studio dietro: c'è un sistema. Niente ufficio, niente segretaria, niente telefono."],
  ["Entro quando devo farla?", "Entro 90 giorni dalla fine dei lavori. Se sei fuori termine non è detto che sia finita: provaci lo stesso, è gratis."],
  ["Serve lo SPID?", "No. Trasmettiamo dal nostro accesso professionale, la ricevuta porta il tuo nome."],
  ["Mi garantite la detrazione?", "No, e diffida di chi te lo promette. Noi facciamo la comunicazione all'ENEA, che è uno degli adempimenti."],
  ["Quanto ci mettete?", "48 ore lavorative da quando abbiamo tutto."],
  ["Come mi arriva?", "Via e-mail, in PDF, già pronta per la dichiarazione: la stampi e la firmi."],
  ["E se sbaglio un dato?", "Lo confrontiamo con la fattura e te lo chiediamo. Correggerlo dopo costa 10 €."],
  ["Posso chiamarvi?", "No, solo e-mail: rispondiamo entro 24 ore. È uno dei motivi per cui costa 99 € e non trecento."],
];

export default function EneaSubito() {
  return (
    <div className="es-root">
      <Helmet>
        <html lang="it" />
        <title>EneaSubito — la pratica ENEA a 99 €</title>
        <meta
          name="description"
          content="Pratica ENEA per infissi, schermature solari e pompe di calore a 99 €. Quattro domande e la foto della fattura: ti diciamo subito, gratis, se si può fare."
        />
        <link rel="canonical" href="https://www.eneasubito.it/" />
        <meta property="og:title" content="EneaSubito — la pratica ENEA a 99 €" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.eneasubito.it/" />
        <style>{STILE}</style>
      </Helmet>

      <header className="es-nav">
        <div className="es-wrap es-nav-in">
          <a className="es-logo es-serif" href="#top">
            <Fulmine />
            EneaSubito
          </a>
          <nav className="es-nav-links">
            <Link to="/infissi">Infissi</Link>
            <Link to="/schermature-solari">Schermature</Link>
            <Link to="/pompe-di-calore">Pompe di calore</Link>
          </nav>
          <Link className="es-bottone es-bottone-pieno es-bottone-piccolo" to="/verifica">Verifica gratis</Link>
        </div>
      </header>

      {/* 1. Apertura: il prezzo nel titolo, il confronto subito sotto. */}
      <section id="top" className="es-wrap es-hero">
        <div className="es-hero-testo">
          <h1 className="es-serif">La pratica ENEA a 99 €.</h1>
          <p>
            Un tecnico ne chiede da 150 a 300. Noi 99, tutto online — e prima ti diciamo{" "}
            <strong style={{ fontWeight: 600, color: "var(--es-inchiostro)" }}>gratis</strong> se la tua
            pratica si può fare.
          </p>
          <div className="es-azioni">
            <Link className="es-bottone es-bottone-pieno" to="/verifica">Verifica gratis — 2 minuti</Link>
          </div>
          <p className="es-micro">Niente telefono, niente appuntamenti, niente carta per la verifica.</p>
        </div>

        {/* Il verdetto che riceverà davvero: è la prova, non un disegno. */}
        <div className="es-anteprima">
          <div className="es-anteprima-testa">
            <span className="es-etichetta">Esito della verifica</span>
            <span className="es-pastiglia es-pastiglia-ok">Si può fare</span>
          </div>
          <ul className="es-esiti">
            <li><span className="es-ok"><Spunta /></span>Sostituzione infissi — <b>ammissibile</b></li>
            <li><span className="es-ok"><Spunta /></span>Sei nei termini, <b>mancano 34 giorni</b></li>
            <li><span className="es-ok"><Spunta /></span>Fattura letta: 9.840,00 € · 6 pezzi</li>
          </ul>
          <p className="es-nota">Risposta in pochi secondi. Paghi solo se è sì.</p>
        </div>
      </section>

      {/* 2. I tre numeri, una riga sola. */}
      <div className="es-wrap">
        <section className="es-striscia">
          <div><b className="es-serif">90 giorni</b><span>per farla, dalla fine dei lavori</span></div>
          <div><b className="es-serif">{DETRAZIONE_PRIMA_CASA}</b><span>di detrazione su 10.000 € di infissi</span></div>
          <div><b className="es-serif">99 €</b><span>la pratica, pagata dopo la risposta</span></div>
        </section>
      </div>

      {/* 3. Come funziona. */}
      <section id="come-funziona" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Come funziona</h2>
        <div className="es-griglia es-griglia-4">
          {PASSI.map(([titolo, testo], i) => (
            <article key={titolo} className="es-scheda">
              <span className="es-numero">{i + 1}</span>
              <h3>{titolo}</h3>
              <p>{testo}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4. Cosa copriamo. */}
      <section id="cosa-copriamo" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Cosa facciamo</h2>
        <div className="es-griglia es-griglia-3">
          {FAMIGLIE.map(([nome, testo]) => (
            <article key={nome} className="es-scheda es-scheda-grande">
              <Fulmine size={28} />
              <h3>{nome}</h3>
              <p>{testo}</p>
            </article>
          ))}
        </div>
        <p className="es-guida" style={{ marginTop: 18, fontSize: 16, color: "var(--es-inchiostro-debole)" }}>
          Niente altro: cappotto, fotovoltaico, caldaie, pellet e Conto Termico non li trattiamo.
        </p>
      </section>

      {/* 5. Prezzo. */}
      <div className="es-wrap">
        <section id="prezzo" className="es-prezzo">
          <div className="es-prezzo-testo">
            <h2 className="es-titolo es-serif">99 €, e li paghi alla fine</h2>
            <ul className="es-elenco">
              {INCLUSO.map((voce) => (
                <li key={voce}><span style={{ color: "var(--es-verde)" }}><Spunta /></span>{voce}</li>
              ))}
            </ul>
          </div>
          <div className="es-cartellino">
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <b className="es-serif">99 €</b>
              <span style={{ fontSize: 16, color: "#A8B6AE" }}>tutto compreso</span>
            </div>
            <p>Se non si può fare, non paghi niente.</p>
            <Link className="es-bottone es-bottone-chiaro" to="/verifica">Verifica gratis</Link>
            <span className="es-firma">Pagamento sicuro con Stripe</span>
          </div>
        </section>
      </div>

      {/* 6. Domande. */}
      <section id="domande" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Domande</h2>
        <div className="es-domande">
          {DOMANDE.map(([domanda, risposta]) => (
            <div key={domanda} className="es-domanda">
              <h3>{domanda}</h3>
              <p>{risposta}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="es-wrap">
        <footer className="es-pie">
          <div className="es-pie-marchio">
            <span className="es-serif" style={{ fontSize: 18, fontWeight: 600 }}>EneaSubito</span>
            <span>Servizio privato di assistenza alle pratiche ENEA.</span>
          </div>
          <nav>
            <Link to="/infissi">Infissi</Link>
            <Link to="/schermature-solari">Schermature solari</Link>
            <Link to="/pompe-di-calore">Pompe di calore</Link>
          </nav>
          <nav>
            <Link to="/es/privacy">Privacy</Link>
            <Link to="/es/termini">Termini di servizio</Link>
            <Link to="/es/cookie">Cookie</Link>
          </nav>
          <nav>
            <span style={{ fontWeight: 600, color: "var(--es-inchiostro)" }}>Assistenza</span>
            <a href="mailto:assistenza@eneasubito.it">assistenza@eneasubito.it</a>
            <span>Risposta entro 24 ore</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}
