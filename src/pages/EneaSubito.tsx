/**
 * eneasubito.it — pagina di atterraggio del secondo marchio (clienti privati).
 *
 * Perimetro: infissi, schermature solari, pompe di calore. Il cliente dà i
 * pochi dati essenziali (intervento, data di fine lavori, fattura), il
 * preflight risponde subito «si può fare / non si può fare / ci risponde un
 * operatore entro 24 ore», e solo dopo il pagamento gli viene chiesto il
 * resto. Prima del pagamento non si lavora la pratica: si giudica soltanto.
 *
 * La pagina è volutamente autonoma nello stile: usa una foglia di stile con
 * ambito `.es-root` e non tocca le variabili globali di index.css, così il
 * vestito di EneaSubito non può cambiare una virgola di Pratica Rapida.
 *
 * TODO(punto 3): i pulsanti di verifica puntano a #inizia finché non esiste
 * la rotta del modulo pubblico EneaSubito. Cambiare lì, una volta sola.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { STILE } from "./eneasubito/stile";

// Cifre della fascia «quello che rischi». Aliquote 2026: 50% sull'abitazione
// principale, 36% sugli altri immobili, su un esempio di 10.000 € di lavori.
//
// ⚠️ SCADENZA NOTA: dal 1° gennaio 2027 le aliquote scendono a 36% e 30%.
// A quel punto questi due valori diventano 3.600 € e 3.000 €. Si cambiano qui,
// in un punto solo, e si propagano ovunque compaiano nella pagina.
const LAVORI_ESEMPIO = "10.000 €";
const DETRAZIONE_PRIMA_CASA = "5.000 €";
const DETRAZIONE_ALTRI = "3.600 €";



function Spunta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Fulmine({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--es-verde)" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

export default function EneaSubito() {
  return (
    <div className="es-root">
      <Helmet>
        <html lang="it" />
        <title>EneaSubito — scopri gratis se la tua pratica ENEA si può fare</title>
        <meta
          name="description"
          content="Pratica ENEA per infissi, schermature solari e pompe di calore. Cinque domande e la foto della fattura: ti diciamo subito se si può fare. Paghi 99 € solo se la risposta è sì."
        />
        <link rel="canonical" href="https://www.eneasubito.it/" />
        <meta property="og:title" content="EneaSubito — scopri gratis se la tua pratica ENEA si può fare" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.eneasubito.it/" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&display=swap"
        />
        <style>{STILE}</style>
      </Helmet>

      {/* ── Barra ─────────────────────────────────────────────────────── */}
      <header className="es-nav">
        <div className="es-wrap es-nav-in">
          <a className="es-logo es-serif" href="#top">
            <Fulmine />
            EneaSubito
          </a>
          <nav className="es-nav-links">
            <a href="#come-funziona">Come funziona</a>
            <Link to="/infissi">Infissi</Link>
            <Link to="/schermature-solari">Schermature</Link>
            <a href="#prezzo">Prezzo</a>
            <a href="#domande">Domande</a>
          </nav>
          <a className="es-bottone es-bottone-pieno es-bottone-piccolo" href="#inizia">Verifica gratis</a>
        </div>
      </header>

      {/* ── Apertura ──────────────────────────────────────────────────── */}
      <section id="top" className="es-wrap es-hero">
        <div className="es-hero-testo">
          <span className="es-occhiello">Pratiche ENEA per privati</span>
          <h1 className="es-serif">Scopri gratis se la tua pratica si può fare. Poi decidi.</h1>
          <p>
            Cinque domande e la foto della fattura. Ti diciamo subito se il tuo intervento rientra e
            se sei nei termini. Se si può fare paghi <strong style={{ fontWeight: 600, color: "var(--es-inchiostro)" }}>99 €</strong>,
            e la pratica la facciamo noi. Se non si può fare te lo diciamo e non paghi niente.
          </p>
          <div className="es-azioni">
            <a className="es-bottone es-bottone-pieno" href="#inizia">Verifica la tua pratica — è gratis</a>
            <a className="es-bottone es-bottone-vuoto" href="#come-funziona">Come funziona</a>
          </div>
          <p className="es-micro">Nessuna carta di credito per la verifica. Risposta in pochi secondi.</p>
        </div>

        <div className="es-anteprima">
          <div className="es-anteprima-testa">
            <span className="es-etichetta">Esito della verifica</span>
            <span className="es-pastiglia es-pastiglia-ok">Si può fare</span>
          </div>
          <ul className="es-esiti">
            <li><span className="es-ok"><Spunta /></span>Sostituzione infissi — <b>intervento ammissibile</b></li>
            <li><span className="es-ok"><Spunta /></span>Lavori finiti il 14 luglio — <b>sei nei termini, mancano 34 giorni</b></li>
            <li><span className="es-ok"><Spunta /></span>Fattura letta: 9.840,00 € · 6 pezzi · 14/07</li>
            <li><span className="es-ok"><Spunta /></span>Il resto dei dati te lo chiediamo dopo</li>
          </ul>
          <p className="es-nota">
            <strong style={{ fontWeight: 600, color: "var(--es-inchiostro-tenue)" }}>Non abbiamo ancora trasmesso niente.</strong>{" "}
            Se paghi, la pratica parte e ricevi la ricevuta ENEA. Se i documenti non confermano quello
            che ci hai detto, ti restituiamo tutto.
          </p>
          <a className="es-bottone es-bottone-pieno" href="#prezzo">Paga 99 € e falla partire</a>
        </div>
      </section>

      {/* ── Quanto rischi ─────────────────────────────────────────────── */}
      <div className="es-wrap">
        <section className="es-rischio">
          <div className="es-rischio-testo">
            <h2 className="es-serif">Quello che rischi non sono 99 €.</h2>
            <p>
              Su un lavoro di infissi da {LAVORI_ESEMPIO} la detrazione vale{" "}
              <strong>{DETRAZIONE_PRIMA_CASA}</strong> sull'abitazione principale, {DETRAZIONE_ALTRI} sugli
              altri immobili, recuperati in dieci anni. Se la comunicazione all'ENEA non parte entro 90
              giorni dalla fine dei lavori, quei soldi non li recuperi — e dopo non c'è modo di rimediare.
            </p>
          </div>
          <div className="es-cifre">
            <div className="es-cifra"><b className="es-serif">90 giorni</b><span>dalla fine dei lavori</span></div>
            <div className="es-cifra"><b className="es-serif">{DETRAZIONE_PRIMA_CASA}</b><span>di detrazione in gioco<br />sulla prima casa</span></div>
            <div className="es-cifra"><b className="es-serif" style={{ color: "var(--es-menta)" }}>99 €</b><span>la pratica, pagata dopo</span></div>
          </div>
        </section>
      </div>

      {/* ── Come funziona ─────────────────────────────────────────────── */}
      <section id="come-funziona" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Prima la risposta, poi i soldi</h2>
        <p className="es-guida" style={{ marginTop: 10 }}>
          Nessuna telefonata, nessun appuntamento, nessuno SPID da fare. E soprattutto: sai se la tua
          pratica si può fare <em>prima</em> di tirare fuori un euro.
        </p>
        <div className="es-griglia es-griglia-4">
          <article className="es-scheda">
            <span className="es-numero">1</span>
            <h3>Cinque domande</h3>
            <p>Che lavoro hai fatto, quando è finito, la foto della fattura. Due minuti, senza pagare niente e senza cercare documenti nei cassetti.</p>
          </article>
          <article className="es-scheda">
            <span className="es-numero">2</span>
            <h3>Rispondiamo subito</h3>
            <p>Leggiamo la fattura e controlliamo termini e requisiti. Se qualcosa non si legge te lo chiediamo lì per lì, una cosa alla volta.</p>
          </article>
          <article className="es-scheda">
            <span className="es-numero">3</span>
            <h3>Paghi solo se si può fare</h3>
            <p>99 € con carta o Apple Pay. Se la risposta è no, non paghi niente e ti spieghiamo perché.</p>
          </article>
          <article className="es-scheda">
            <span className="es-numero">4</span>
            <h3>Completi e la facciamo</h3>
            <p>Dopo il pagamento ti chiediamo il resto dei dati. Compiliamo, trasmettiamo all'ENEA e ti mandiamo la ricevuta con il codice CPID.</p>
          </article>
        </div>
      </section>

      {/* ── Cosa copriamo ─────────────────────────────────────────────── */}
      <section id="cosa-copriamo" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Tre interventi, niente altro</h2>
        <p className="es-guida" style={{ marginTop: 10 }}>
          Facciamo poche cose e le facciamo tutti i giorni. Se il tuo lavoro rientra qui, sei nel posto giusto.
        </p>
        <div className="es-griglia es-griglia-3">
          <article className="es-scheda es-scheda-grande">
            <Fulmine size={28} />
            <h3>Infissi e serramenti</h3>
            <p>Finestre, portefinestre e porte d'ingresso sostituite. Comprese zanzariere e tapparelle, se sono sulla stessa fattura.</p>
          </article>
          <article className="es-scheda es-scheda-grande">
            <Fulmine size={28} />
            <h3>Schermature solari</h3>
            <p>Tende da sole, pergotende e pergole con telo tecnico, montate su finestre o terrazzi esposti.</p>
          </article>
          <article className="es-scheda es-scheda-grande">
            <Fulmine size={28} />
            <h3>Pompe di calore</h3>
            <p>Climatizzazione invernale con pompa di calore, anche in sostituzione della vecchia caldaia.</p>
          </article>
        </div>
        <p className="es-guida" style={{ marginTop: 20, fontSize: 16, color: "var(--es-inchiostro-debole)" }}>
          Non trattiamo cappotto termico, fotovoltaico, caldaie a condensazione, stufe a pellet, Conto Termico
          e F-Gas. Se il tuo caso è uno di questi te lo diciamo subito, prima di metterci al lavoro.
        </p>
      </section>

      {/* ── Cosa ti serve ─────────────────────────────────────────────── */}
      <section className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Per la verifica bastano due cose</h2>
        <p className="es-guida" style={{ marginTop: 10 }}>
          Niente cassetti da aprire adesso: il resto te lo chiediamo dopo, e solo se decidi di andare avanti.
        </p>
        <div className="es-griglia es-griglia-2">
          <div className="es-voce">
            <span style={{ color: "var(--es-verde)" }}><Spunta /></span>
            <div><b>La fattura dell'installatore</b><span>Anche solo fotografata col telefono. Se non si legge te lo diciamo subito.</span></div>
          </div>
          <div className="es-voce">
            <span style={{ color: "var(--es-verde)" }}><Spunta /></span>
            <div><b>Quando sono finiti i lavori</b><span>La data di fine posa o di collaudo. Serve per i 90 giorni.</span></div>
          </div>
          <div className="es-voce es-voce-dopo">
            <span style={{ color: "#9AA7A0" }}><Spunta /></span>
            <div><b>Dopo: bonifico e certificati</b><span>Te li chiediamo a pagamento fatto, uno alla volta.</span></div>
          </div>
          <div className="es-voce es-voce-dopo">
            <span style={{ color: "#9AA7A0" }}><Spunta /></span>
            <div><b>Dopo: dati catastali</b><span>Se non li hai li recuperiamo noi, con un supplemento.</span></div>
          </div>
        </div>
      </section>

      {/* ── Prezzo ────────────────────────────────────────────────────── */}
      <div className="es-wrap">
        <section id="prezzo" className="es-prezzo">
          <div className="es-prezzo-testo">
            <h2 className="es-titolo es-serif">99 €, e li paghi alla fine</h2>
            <p className="es-guida">
              Nessun anticipo, nessun preventivo da chiedere, nessun supplemento se la pratica è più
              complicata del previsto. Un prezzo solo, e lo paghi quando sai già che la tua pratica si può fare.
            </p>
            <ul className="es-elenco">
              <li><span style={{ color: "var(--es-verde)" }}><Spunta /></span>Controllo di fattura, bonifico e documenti</li>
              <li><span style={{ color: "var(--es-verde)" }}><Spunta /></span>Compilazione completa della pratica</li>
              <li><span style={{ color: "var(--es-verde)" }}><Spunta /></span>Trasmissione al portale ENEA e ricevuta con codice CPID</li>
              <li><span style={{ color: "var(--es-verde)" }}><Spunta /></span>Assistenza via e-mail fino alla consegna</li>
              <li className="es-escluso">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9AA7A0" strokeWidth="2.2"
                     strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true"><path d="M5 12h14" /></svg>
                Non include consulenza fiscale né la tua dichiarazione dei redditi
              </li>
            </ul>
          </div>
          <div className="es-cartellino">
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <b className="es-serif">99 €</b>
              <span style={{ fontSize: 16, color: "#A8B6AE" }}>tutto compreso</span>
            </div>
            <p>
              Si paga dopo la risposta, non prima. Se la pratica non si può fare non paghi niente — e se
              i documenti non confermano quello che ci hai detto, ti restituiamo tutto.
            </p>
            <a className="es-bottone es-bottone-chiaro" href="#inizia">Verifica la tua pratica</a>
            <span className="es-firma">Pagamento sicuro con Stripe</span>
          </div>
        </section>
      </div>

      {/* ── Domande ───────────────────────────────────────────────────── */}
      <section id="domande" className="es-wrap es-sezione">
        <h2 className="es-titolo es-serif">Domande che ci fanno tutti</h2>
        <div className="es-domande">
          <div className="es-domanda">
            <h3>Cosa vuol dire «si può fare»?</h3>
            <p>Tre cose: il tuo intervento rientra fra quelli ammessi, sei dentro i 90 giorni, e la fattura contiene quello che serve. Non vuol dire che ti garantiamo la detrazione — quella dipende dalla tua dichiarazione.</p>
          </div>
          <div className="es-domanda">
            <h3>E se poi si scopre che non si poteva fare?</h3>
            <p>Ti restituiamo i 99 €, interi. La risposta te la diamo su quello che ci hai dato tu: se i documenti la smentiscono, il problema è nostro, non tuo.</p>
          </div>
          <div className="es-domanda">
            <h3>Perché mi chiedete il resto solo dopo?</h3>
            <p>Perché dati catastali e certificati sono la parte noiosa, e non servono per dirti se la pratica si può fare. Prima la risposta, poi la fatica — e solo se hai deciso di andare avanti.</p>
          </div>
          <div className="es-domanda">
            <h3>Entro quando devo trasmettere?</h3>
            <p>Entro 90 giorni dalla fine dei lavori — di norma la data di collaudo o di fine posa indicata dall'installatore. Se sei fuori termine scrivici: in qualche caso si rimedia, in altri no.</p>
          </div>
          <div className="es-domanda">
            <h3>Serve lo SPID?</h3>
            <p>No. Trasmettiamo dal nostro accesso professionale al portale ENEA; la ricevuta che ricevi riporta il tuo nome e i dati del tuo immobile.</p>
          </div>
          <div className="es-domanda">
            <h3>Come mi arriva la pratica?</h3>
            <p>Via e-mail, in PDF, con la ricevuta ufficiale e il codice CPID. È già pronta per la dichiarazione dei redditi: non devi fare altro che stamparla, firmarla e conservarla con la fattura.</p>
          </div>
          <div className="es-domanda">
            <h3>Quanto ci mettete?</h3>
            <p>48 ore lavorative da quando abbiamo tutto, salvo blocchi temporanei del portale ENEA. Se sei vicino alla scadenza dei 90 giorni te lo diciamo subito, prima di partire.</p>
          </div>
          <div className="es-domanda">
            <h3>E se sbaglio a scrivere un dato?</h3>
            <p>Quello che scrivi lo confrontiamo con la fattura, e se qualcosa non torna te lo chiediamo. Sui dati personali e su quelli dell'immobile il confronto non possiamo farlo: controllali quando ricevi la pratica. Correggerli dopo costa 10 €.</p>
          </div>
          <div className="es-domanda">
            <h3>Il pagamento è sicuro?</h3>
            <p>Si paga con Stripe, lo stesso sistema usato da migliaia di siti. I dati della tua carta non passano da noi e non li vediamo mai.</p>
          </div>
          <div className="es-domanda">
            <h3>Mi garantite la detrazione?</h3>
            <p>No, e diffida di chi te lo promette. Noi facciamo la comunicazione all'ENEA, che è uno degli adempimenti richiesti. La detrazione la porti in dichiarazione tu o il tuo commercialista.</p>
          </div>
        </div>
      </section>

      {/* ── Chiedi prima ──────────────────────────────────────────────── */}
      <div className="es-wrap">
        <section id="inizia" className="es-chiedi">
          <div className="es-chiedi-testo">
            <h2 className="es-serif">Non sei sicuro che il tuo caso rientri?</h2>
            <p>Scrivici prima di cominciare. <strong style={{ fontWeight: 600 }}>Rispondiamo entro 24 ore</strong>, per iscritto.</p>
            <p className="es-chiedi-min">
              Niente telefono: lavoriamo solo per iscritto, ed è uno dei motivi per cui costa 99 € e non trecento.
            </p>
          </div>
          <form className="es-modulo" onSubmit={(e) => e.preventDefault()}>
            <div className="es-campo">
              <label htmlFor="es-email">La tua e-mail</label>
              <input id="es-email" type="email" name="email" placeholder="nome@esempio.it" autoComplete="email" />
            </div>
            <div className="es-campo">
              <label htmlFor="es-domanda">La tua domanda</label>
              <textarea id="es-domanda" name="domanda" rows={3} placeholder="Ho montato una pergotenda a giugno, rientra?" />
            </div>
            <button type="submit" className="es-bottone es-bottone-pieno">Invia la domanda</button>
          </form>
        </section>
      </div>

      {/* ── Chiusura ──────────────────────────────────────────────────── */}
      <section className="es-wrap es-chiusura">
        <h2 className="es-serif">I 90 giorni passano in fretta.</h2>
        <p>
          Se i lavori sono finiti da poco sei in tempo. Comincia adesso: dieci minuti oggi, la pratica da
          controllare entro 48 ore, e paghi solo se ti convince.
        </p>
        <a className="es-bottone es-bottone-pieno" href="#inizia" style={{ marginTop: 6 }}>Verifica la tua pratica — è gratis</a>
      </section>

      {/* ── Piè di pagina ─────────────────────────────────────────────── */}
      <div className="es-wrap">
        <footer className="es-pie">
          <div className="es-pie-marchio">
            <span className="es-serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--es-inchiostro)" }}>EneaSubito</span>
            <span>Servizio privato di assistenza alle pratiche ENEA.</span>
          </div>
          <nav>
            <a href="#domande">Domande frequenti</a>
            <a href="#prezzo">Prezzo</a>
          </nav>
          <nav>
            <a href="/es/privacy">Privacy</a>
            <a href="/es/termini">Termini di servizio</a>
            <a href="/es/cookie">Cookie</a>
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
