/**
 * eneasubito.it — la pagina di atterraggio del secondo marchio.
 *
 * Perimetro: infissi, schermature solari, pompe di calore. Il cliente dà il
 * minimo — chi è in fattura, dove scrivergli, la fattura — paga, e solo dopo
 * gli si chiede il resto.
 *
 * Qui c'era la promessa di una verifica gratuita prima del pagamento. Il
 * Titolare l'ha eliminata l'11/10/2026: il suo esito incerto diceva «aspetta
 * che ti facciamo sapere», cioè offriva al cliente l'occasione di andarsene.
 *
 * Il 14/10/2026 ha tolto anche la frase sul rimborso: una proposta
 * pubblicitaria non porta negazioni. La garanzia resta dov'è sempre stata,
 * nei Termini di servizio, art. 5.
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
  ["Prepari i tuoi dati", "E la fattura del tuo fornitore."],
  ["Compili il modulo", "Semplice e veloce, anche dal telefono."],
  ["Paghi comodamente online", "Carta o Apple Pay. La fattura ti arriva subito per e-mail."],
  ["Ricevi la tua pratica", "Pronta per essere inserita nella dichiarazione dei redditi."],
];

const FAMIGLIE: { nome: string; testo: string; azione: string; dove: string }[] = [
  {
    nome: "Infissi",
    testo: "Finestre, portefinestre, porte d'ingresso. Anche zanzariere e tapparelle sulla stessa fattura.",
    azione: "Richiedi la tua pratica ENEA per infissi",
    dove: "/verifica?intervento=infissi",
  },
  {
    nome: "Schermature solari",
    testo: "Tende da sole, pergotende, pergole con telo tecnico.",
    azione: "Richiedi la tua pratica ENEA per schermature solari",
    dove: "/verifica?intervento=schermature",
  },
  {
    nome: "Pompe di calore / climatizzatori",
    testo: "Riscaldamento con pompa di calore, anche al posto della vecchia caldaia.",
    azione: "Richiedi la tua pratica ENEA per pompe di calore",
    dove: "/verifica?intervento=pompe_di_calore",
  },
];

const INCLUSO = [
  "Controllo dei documenti",
  "Compilazione della pratica",
  "Trasmissione all'ENEA",
  "Ricevuta col codice CPID",
];

const DOMANDE: [string, string][] = [
  ["Serve lo SPID?", "No. Trasmettiamo dal nostro accesso professionale, la ricevuta porta il tuo nome."],
  ["Quanto ci mettete?", "48 ore lavorative da quando abbiamo tutto."],
  ["Come consegnate la pratica ENEA una volta pronta?", "Via e-mail, in PDF, già pronta per la dichiarazione: la stampi e la firmi."],
  ["E se sbaglio un dato?", "Lo confrontiamo con la fattura e te lo chiediamo. E anche dopo aver ricevuto la pratica puoi scrivere all'assistenza: ci si mette una mano sopra."],
  ["Come posso parlare con voi?", "Puoi contattare i nostri tecnici tramite la mail dedicata assistenza@eneasubito.it."],
];

export default function EneaSubito() {
  return (
    <div className="es-root">
      <Helmet>
        <html lang="it" />
        <title>EneaSubito — la pratica ENEA a 99 €</title>
        <meta
          name="description"
          content="Pratica ENEA per infissi, schermature solari e pompe di calore a 99 €. Chi è in fattura, la tua e-mail, la foto della fattura: in due minuti la pratica è partita."
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
          <Link className="es-bottone es-bottone-pieno es-bottone-piccolo" to="/verifica">Fai partire la pratica</Link>
        </div>
      </header>

      {/* 1. Apertura: il prezzo nel titolo, il confronto subito sotto. */}
      <section id="top" className="es-wrap es-hero">
        <div className="es-hero-testo">
          <h1 className="es-serif">
            Devi fare una pratica ENEA veloce, online, economica e curata da professionisti?
          </h1>
          <p>
            Prepari i tuoi dati e la fattura del tuo fornitore, compili il modulo{" "}
            <strong style={{ fontWeight: 600, color: "var(--es-inchiostro)" }}>anche dal telefono</strong>,
            e ricevi la tua pratica.
          </p>
          <div className="es-azioni">
            <Link className="es-bottone es-bottone-pieno es-bottone-grande" to="/verifica">
              Fai partire la tua pratica
            </Link>
          </div>
          <p className="es-micro">Due minuti. Niente telefono, niente appuntamenti, niente moduli lunghi.</p>
        </div>

        {/* Cosa gli chiederemo davvero, prima che lo scopra cliccando: tre
            righe, nessuna sorpresa. Prima qui stava un finto esito della
            verifica gratuita, che non esiste piu'. */}
        <div className="es-anteprima">
          <div className="es-anteprima-testa">
            <span className="es-etichetta">Cosa ti serve</span>
            <span className="es-pastiglia es-pastiglia-ok">Due minuti</span>
          </div>
          <ul className="es-esiti">
            <li><span className="es-ok"><Spunta /></span>Il <b>nome di chi è in fattura</b></li>
            <li><span className="es-ok"><Spunta /></span>La tua <b>e-mail</b></li>
            <li><span className="es-ok"><Spunta /></span>La <b>fattura del tuo fornitore</b></li>
          </ul>
          <p className="es-nota">Si compila in pochi minuti, anche dal telefono.</p>
        </div>
      </section>

      {/* 2. Come funziona. */}
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

      {/* 4. Quali pratiche lavoriamo. */}
      <section id="cosa-copriamo" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Quali pratiche lavoriamo</h2>
        <div className="es-griglia es-griglia-3">
          {FAMIGLIE.map((f) => (
            <article key={f.nome} className="es-scheda es-scheda-grande">
              <Fulmine size={28} />
              <h3>{f.nome}</h3>
              <p>{f.testo}</p>
              <Link className="es-bottone es-bottone-pieno" to={f.dove}>{f.azione}</Link>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Prezzo. */}
      <div className="es-wrap">
        <section id="prezzo" className="es-prezzo">
          <div className="es-prezzo-testo">
            <h2 className="es-titolo es-serif">99 €, tutto compreso</h2>
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
            <p>Pronta in 48 ore lavorative.</p>
            <Link className="es-bottone es-bottone-chiaro" to="/verifica">Fai partire la tua pratica</Link>
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
