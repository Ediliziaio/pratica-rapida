/**
 * Foglia di stile condivisa dalle pagine di EneaSubito.
 *
 * Tutto sta sotto .es-root: nessuna regola esce da lì, quindi il vestito di
 * EneaSubito non può toccare una virgola di Pratica Rapida.
 */
export const STILE = `
/* Questa applicazione non carica index.css (sarebbe il foglio dell'altro
   marchio): le poche basi che servivano stanno qui. */
html, body { margin: 0; padding: 0; }
body { background: #F5F2EC; }

.es-root {
  --es-carta: #F5F2EC;
  --es-superficie: #FFFFFF;
  --es-inchiostro: #14201A;
  --es-inchiostro-tenue: #3F5049;
  --es-inchiostro-debole: #5A6A62;
  --es-bordo: #DFD9CE;
  --es-verde: #0E5A48;
  --es-azione: #0C8842;
  --es-azione-scuro: #0A6F36;
  --es-verde-scuro: #0A4335;
  --es-verde-chiaro: #E7EDE8;
  --es-menta: #6FD3B0;
  --es-sabbia: #EFEADF;
  --es-scuro: #14201A;
  --es-scuro-2: #1D2B24;

  background: var(--es-carta);
  color: var(--es-inchiostro);
  font-family: "Work Sans Variable", "Work Sans", system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}
.es-root *, .es-root *::before, .es-root *::after { box-sizing: border-box; }
.es-root a { color: var(--es-verde); }
.es-root a:hover { color: var(--es-verde-scuro); }
.es-serif { font-family: "Fraunces Variable", Fraunces, Georgia, "Times New Roman", serif; }

.es-wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* Barra */
.es-nav { border-bottom: 1px solid var(--es-bordo); }
.es-nav-in { display: flex; align-items: center; gap: 32px; height: 76px; }
.es-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--es-inchiostro); font-size: 22px; font-weight: 600; letter-spacing: -0.2px; }
.es-nav-links { flex-grow: 1; display: flex; align-items: center; gap: 26px; }
.es-nav-links a { font-size: 15px; color: var(--es-inchiostro-tenue); text-decoration: none; }

.es-bottone { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 52px; padding: 0 26px; border-radius: 10px; font-size: 16px; font-weight: 600; text-decoration: none; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
.es-bottone-pieno { background: var(--es-azione); color: #FFFFFF; box-shadow: 0 2px 0 var(--es-azione-scuro); }
.es-bottone-pieno:hover { background: var(--es-azione-scuro); color: #FFFFFF; }
.es-bottone-vuoto { background: transparent; color: var(--es-inchiostro); border-color: #C9C2B5; }
.es-bottone-chiaro { background: var(--es-carta); color: var(--es-inchiostro); }
.es-bottone-piccolo { height: 46px; padding: 0 20px; font-size: 15px; }

/* I pulsanti sono <a>: senza questa specificità vince la regola dei link
   .es-root a e il testo bianco diventa verde su verde, cioè invisibile. */
.es-root a.es-bottone-pieno, .es-root a.es-bottone-pieno:hover { color: #FFFFFF; }
.es-root a.es-bottone-vuoto, .es-root a.es-bottone-vuoto:hover { color: var(--es-inchiostro); }
.es-root a.es-bottone-chiaro, .es-root a.es-bottone-chiaro:hover { color: var(--es-inchiostro); }

/* Blocchi */
.es-sezione { padding: 72px 0 0; }
.es-titolo { margin: 0; font-size: clamp(30px, 3.4vw, 40px); font-weight: 600; letter-spacing: -0.6px; line-height: 1.12; }
.es-occhiello { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; background: var(--es-verde-chiaro); border-radius: 999px; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; color: var(--es-verde); text-transform: uppercase; align-self: flex-start; }
.es-guida { margin: 0; max-width: 760px; font-size: 18px; line-height: 1.55; color: var(--es-inchiostro-tenue); }

.es-hero { display: flex; gap: 56px; align-items: flex-start; padding: 64px 0 56px; }
.es-hero-testo { flex: 1 1 560px; display: flex; flex-direction: column; gap: 22px; }
.es-hero h1 { margin: 0; font-size: clamp(36px, 4.6vw, 58px); line-height: 1.05; font-weight: 600; letter-spacing: -1.2px; }
.es-hero p { margin: 0; font-size: 19px; line-height: 1.55; color: var(--es-inchiostro-tenue); }
.es-azioni { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 6px; }
.es-micro { font-size: 15px; color: var(--es-inchiostro-debole); }

/* Scheda anteprima */
.es-anteprima { flex: 0 1 452px; background: var(--es-superficie); border: 1px solid var(--es-bordo); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.es-anteprima-testa { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.es-etichetta { font-size: 14px; font-weight: 600; letter-spacing: 0.4px; color: var(--es-inchiostro-debole); text-transform: uppercase; }
.es-pastiglia { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; background: #F3E8D6; border-radius: 999px; font-size: 12px; font-weight: 600; color: #7A5F1E; }
.es-riga { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.es-riga dt { font-size: 14px; color: var(--es-inchiostro-debole); }
.es-riga dd { margin: 0; font-size: 15px; font-weight: 500; text-align: right; }
.es-coperto { display: inline-flex; align-items: center; gap: 8px; }
.es-barra-coperta { width: 96px; height: 12px; background: #DDD7CB; border-radius: 3px; display: inline-block; }
.es-divisore { height: 1px; background: #E7E2D8; }
.es-pastiglia-ok { background: #DDF0E4; color: #14603F; }
.es-esiti { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.es-esiti li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.45; color: var(--es-inchiostro-tenue); }
.es-esiti b { color: var(--es-inchiostro); font-weight: 600; }
.es-ok { color: var(--es-verde); flex-shrink: 0; }
.es-nota { background: #F7F5F0; border-radius: 10px; padding: 14px; margin: 0; font-size: 13px; line-height: 1.5; color: var(--es-inchiostro-debole); }

/* Fascia scura */
.es-rischio { background: var(--es-scuro); border-radius: 20px; padding: 40px 44px; display: flex; gap: 48px; align-items: center; margin-top: 56px; }
.es-rischio-testo { flex: 1 1 560px; display: flex; flex-direction: column; gap: 14px; }
.es-rischio h2 { margin: 0; font-size: clamp(28px, 3.2vw, 38px); line-height: 1.12; font-weight: 600; color: var(--es-carta); letter-spacing: -0.7px; }
.es-rischio p { margin: 0; font-size: 17px; line-height: 1.6; color: #C3CFC8; }
.es-rischio strong { color: var(--es-carta); font-weight: 600; }
.es-cifre { flex: 1 1 340px; display: flex; flex-direction: column; gap: 12px; }
.es-cifra { background: var(--es-scuro-2); border: 1px solid #2E4036; border-radius: 12px; padding: 16px 20px; display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.es-cifra b { font-size: 28px; font-weight: 600; color: var(--es-carta); }
.es-cifra span { font-size: 14px; color: #A8B6AE; text-align: right; }

/* Griglie */
.es-griglia { display: grid; gap: 20px; margin-top: 28px; }
.es-griglia-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.es-griglia-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.es-griglia-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.es-scheda { background: var(--es-superficie); border: 1px solid var(--es-bordo); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.es-scheda h3 { margin: 0; font-size: 18px; font-weight: 600; }
.es-scheda p { margin: 0; font-size: 15px; line-height: 1.55; color: var(--es-inchiostro-tenue); }
.es-numero { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: var(--es-azione); color: #FFFFFF; border-radius: 999px; font-size: 16px; font-weight: 600; }
.es-scheda-grande h3 { font-size: 24px; font-family: "Fraunces Variable", Fraunces, Georgia, serif; }
.es-scheda-grande p { font-size: 16px; }

.es-voce { background: var(--es-superficie); border: 1px solid var(--es-bordo); border-radius: 12px; padding: 20px; display: flex; gap: 12px; align-items: flex-start; }
.es-voce-dopo { background: transparent; border-style: dashed; }
.es-voce b { display: block; font-size: 16px; font-weight: 600; }
.es-voce span { font-size: 15px; line-height: 1.45; color: var(--es-inchiostro-debole); }

/* Prezzo */
.es-prezzo { background: var(--es-superficie); border: 1px solid var(--es-bordo); border-radius: 20px; padding: 44px; display: flex; gap: 48px; align-items: center; margin-top: 72px; }
.es-prezzo-testo { flex: 1 1 520px; display: flex; flex-direction: column; gap: 16px; }
.es-elenco { display: flex; flex-direction: column; gap: 12px; margin: 4px 0 0; padding: 0; list-style: none; }
.es-elenco li { display: flex; gap: 12px; align-items: flex-start; font-size: 16px; line-height: 1.5; color: var(--es-inchiostro-tenue); }
.es-elenco li.es-escluso { color: #6B7B73; }
.es-cartellino { flex: 1 1 320px; background: var(--es-scuro); border-radius: 16px; padding: 30px; display: flex; flex-direction: column; gap: 16px; }
.es-cartellino b { font-size: 54px; font-weight: 600; color: var(--es-carta); letter-spacing: -1.4px; line-height: 1; }
.es-cartellino p { margin: 0; font-size: 16px; line-height: 1.55; color: #C3CFC8; }
.es-cartellino .es-firma { text-align: center; font-size: 14px; color: #93A399; }

/* Domande */
.es-domande { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 40px; margin-top: 28px; }
.es-domanda h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
.es-domanda p { margin: 0; font-size: 16px; line-height: 1.55; color: var(--es-inchiostro-tenue); }

/* Chiedi prima */
.es-chiedi { background: var(--es-sabbia); border: 1px solid var(--es-bordo); border-radius: 20px; padding: 40px 44px; display: flex; gap: 48px; align-items: flex-start; margin-top: 72px; }
.es-chiedi-testo { flex: 1 1 480px; display: flex; flex-direction: column; gap: 12px; }
.es-chiedi h2 { margin: 0; font-size: clamp(26px, 3vw, 34px); line-height: 1.15; font-weight: 600; letter-spacing: -0.5px; }
.es-chiedi p { margin: 0; font-size: 17px; line-height: 1.55; color: #4A4028; }
.es-chiedi .es-chiedi-min { font-size: 15px; color: #6B6551; }
.es-modulo { flex: 1 1 380px; display: flex; flex-direction: column; gap: 14px; }
.es-campo { display: flex; flex-direction: column; gap: 6px; }
.es-campo label { font-size: 14px; font-weight: 600; color: #4A4028; }
.es-campo input, .es-campo textarea { padding: 12px 14px; background: var(--es-superficie); border: 1px solid #D5CEC0; border-radius: 8px; font-family: inherit; font-size: 16px; line-height: 1.5; color: var(--es-inchiostro); }
.es-campo input { height: 48px; padding-top: 0; padding-bottom: 0; }
.es-campo textarea { resize: vertical; }

/* Chiusura e piè di pagina */
.es-chiusura { padding: 72px 0; display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }
.es-chiusura h2 { margin: 0; max-width: 780px; font-size: clamp(30px, 3.6vw, 42px); line-height: 1.12; font-weight: 600; letter-spacing: -0.8px; }
.es-chiusura p { margin: 0; max-width: 660px; font-size: 18px; line-height: 1.55; color: var(--es-inchiostro-tenue); }
.es-pie { border-top: 1px solid var(--es-bordo); padding: 32px 0; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 40px; }
.es-pie nav { display: flex; flex-direction: column; gap: 8px; }
.es-pie a, .es-pie span { font-size: 14px; color: var(--es-inchiostro-tenue); text-decoration: none; }
.es-pie .es-pie-marchio { flex-grow: 1; display: flex; flex-direction: column; gap: 8px; }

@media (max-width: 960px) {
  .es-hero, .es-rischio, .es-prezzo, .es-chiedi { flex-direction: column; align-items: stretch; gap: 32px; }
  .es-griglia-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .es-nav-links { display: none; }
}
@media (max-width: 640px) {
  .es-wrap { padding: 0 16px; }
  .es-griglia-4, .es-griglia-3, .es-griglia-2, .es-domande { grid-template-columns: minmax(0, 1fr); }
  .es-rischio, .es-prezzo, .es-chiedi { padding: 28px 22px; }
  .es-sezione { padding-top: 56px; }
  .es-bottone { width: 100%; }
}

/* Pagine d'intervento */
.es-intro { display: flex; flex-direction: column; gap: 20px; padding: 56px 0 0; max-width: 820px; }
.es-intro h1 { margin: 0; font-size: clamp(32px, 4vw, 50px); line-height: 1.08; font-weight: 600; letter-spacing: -1px; }
.es-intro p { margin: 0; font-size: 19px; line-height: 1.55; color: var(--es-inchiostro-tenue); }
.es-corpo { display: flex; flex-direction: column; gap: 16px; padding-top: 56px; max-width: 820px; }
.es-corpo h2 { margin: 0; font-size: clamp(24px, 2.8vw, 32px); font-weight: 600; letter-spacing: -0.4px; }
.es-corpo p { margin: 0; font-size: 17px; line-height: 1.65; color: var(--es-inchiostro-tenue); }
.es-corpo ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.es-corpo ul li { display: flex; gap: 10px; align-items: flex-start; font-size: 17px; line-height: 1.55; color: var(--es-inchiostro-tenue); }
.es-richiamo { background: var(--es-sabbia); border: 1px solid var(--es-bordo); border-radius: 16px; padding: 28px 32px; display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: space-between; margin-top: 56px; }
.es-richiamo div { flex: 1 1 420px; display: flex; flex-direction: column; gap: 8px; }
.es-richiamo b { font-size: 22px; font-weight: 600; }
.es-richiamo span { font-size: 16px; line-height: 1.55; color: #4A4028; }
/* La chat: sta sopra tutto, in basso a destra, e non copre i pulsanti del
   modulo perche' su schermo stretto si restringe. */
/* Arancione e non verde, di proposito: il verde e' il colore del sito e il
   bottone ci si confonde dentro. Qui serve che si veda — e' il rimedio alla
   diffidenza di chi non ci conosce, non un accessorio. */
.es-chat-bolla { position: fixed; right: 20px; bottom: 20px; z-index: 60; display: flex; align-items: center;
  gap: 11px; height: 62px; padding: 0 24px 0 20px; border: 0; border-radius: 999px; cursor: pointer;
  background: #E8590C; color: #fff; font-family: inherit; text-align: left; line-height: 1.15;
  box-shadow: 0 10px 28px rgba(232,89,12,.42); transition: transform .15s ease, box-shadow .15s ease;
  /* Saltella tre volte all'arrivo, poi sta ferma: attirare l'attenzione una
     volta funziona, farlo per sempre infastidisce e sembra una pubblicita'. */
  animation: es-salta 1.1s ease-in-out .9s 3; }
.es-chat-bolla:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(232,89,12,.5); }
/* L'onda che si allarga dal bottone: continua, ma lenta e trasparente. */
.es-chat-bolla::before { content: ""; position: absolute; inset: 0; border-radius: 999px;
  border: 2px solid #E8590C; animation: es-onda 2.6s ease-out infinite; pointer-events: none; }
@keyframes es-salta {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-10px); }
  55% { transform: translateY(0); }
  70% { transform: translateY(-4px); }
}
@keyframes es-onda {
  0% { transform: scale(1); opacity: .55; }
  70% { transform: scale(1.35); opacity: 0; }
  100% { opacity: 0; }
}
.es-chat-bolla > span { display: block; font-size: 15px; font-weight: 600; }
.es-chat-bolla b { display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 500; opacity: .92; }
/* Il puntino che pulsa: dice «c'e' qualcuno» senza scriverlo. Con due anelli
   che si allargano, come la spia di una linea aperta. */
.es-chat-pallino { position: relative; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: #7CE2B0; flex-shrink: 0; }
.es-chat-pallino::after { content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: #7CE2B0; animation: es-pulsa 2s ease-out infinite; }
@keyframes es-pulsa { 0% { transform: scale(1); opacity: .7; } 70% { transform: scale(2.6); opacity: 0; } 100% { opacity: 0; } }
/* Chi ha chiesto meno animazioni nel sistema operativo non le subisce. */
@media (prefers-reduced-motion: reduce) {
  .es-chat-pallino::after, .es-chat-bolla, .es-chat-bolla::before { animation: none; }
  .es-chat-bolla { transition: none; }
}

/* Il richiamo dentro la pagina: sta sotto il pulsante principale, dove il
   dubbio viene davvero. Un bottone in un angolo lo si ignora; questo sta
   nella riga di lettura. */
.es-chat-richiamo { display: flex; align-items: center; gap: 14px; width: 100%; margin-top: 18px;
  padding: 14px 18px; border: 1.5px solid #F3C4A4; border-radius: 14px; background: #FFF4EC;
  font-family: inherit; text-align: left; cursor: pointer; color: var(--es-inchiostro);
  transition: border-color .15s ease, background .15s ease; }
.es-chat-richiamo:hover { border-color: #E8590C; background: #FFEADC; }
.es-chat-richiamo-icona { display: flex; align-items: center; justify-content: center; width: 42px;
  height: 42px; flex-shrink: 0; border-radius: 50%; background: #E8590C; color: #fff; }
.es-chat-richiamo b { display: block; font-size: 15px; font-weight: 600; }
.es-chat-richiamo i { display: block; font-style: normal; font-size: 13.5px; color: var(--es-inchiostro-debole); }
.es-chat-richiamo-azione { margin-left: auto; flex-shrink: 0; font-size: 14px; font-weight: 600; color: #E8590C; }
/* Su telefono il bottone galleggiante stava **sopra** il pulsante «Continua»
   e sopra il testo del modulo: un aiuto che copre la strada e' un ostacolo,
   non un aiuto. Si rimpicciolisce, si abbassa, e soprattutto la pagina si
   tiene libero in fondo lo spazio che occupa, cosi' non copre mai niente. */
@media (max-width: 560px) {
  .es-chat-richiamo-azione { display: none; }
  .es-chat-bolla { height: 52px; right: 14px; bottom: 14px; padding: 0 16px 0 14px; gap: 9px; }
  .es-chat-bolla > span { font-size: 14px; }
  .es-chat-bolla b { font-size: 11.5px; }
  /* Lo spazio che la bolla si prende, piu' un margine di sicurezza. */
  .es-passo { padding-bottom: 104px; }
}
.es-chat { position: fixed; right: 20px; bottom: 20px; z-index: 60; width: min(380px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 40px)); display: flex; flex-direction: column; overflow: hidden;
  background: #fff; border: 1px solid var(--es-bordo); border-radius: 16px;
  box-shadow: 0 18px 50px rgba(20,32,26,.22); }
.es-chat-testa { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 16px; background: var(--es-verde); color: #fff; }
.es-chat-testa b { display: block; font-size: 15px; }
.es-chat-testa span { display: block; font-size: 13px; opacity: .85; }
.es-chat-testa button { background: none; border: 0; color: #fff; cursor: pointer; padding: 4px; line-height: 0; }
.es-chat-corpo { flex: 1 1 auto; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.es-chat-intro { margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: var(--es-inchiostro-debole); }
.es-chat-voce { text-align: left; padding: 10px 12px; border: 1px solid var(--es-bordo); border-radius: 10px;
  background: #fff; font: inherit; font-size: 14px; line-height: 1.4; cursor: pointer; color: var(--es-inchiostro); }
.es-chat-voce:hover { border-color: var(--es-verde); }
.es-chat-torna { align-self: flex-start; background: none; border: 0; padding: 0 0 4px; font: inherit;
  font-size: 13px; color: var(--es-verde); cursor: pointer; }
.es-chat-domanda { margin: 0; font-size: 15px; font-weight: 600; }
.es-chat-risposta { margin: 0; font-size: 14px; line-height: 1.6; }
.es-chat-coda { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--es-inchiostro-debole); }
.es-chat-esito { margin: 0; font-size: 14px; line-height: 1.5; color: var(--es-verde); font-weight: 600; }
.es-chat-piede { border-top: 1px solid var(--es-bordo); padding: 12px 16px; display: flex;
  flex-direction: column; gap: 8px; }
.es-chat-piede textarea, .es-chat-piede input { width: 100%; padding: 9px 11px; border: 1px solid var(--es-bordo);
  border-radius: 9px; font: inherit; font-size: 14px; resize: vertical; }
.es-chat-manda { height: 40px; border: 0; border-radius: 9px; background: var(--es-verde); color: #fff;
  font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.es-chat-manda:disabled { opacity: .45; cursor: default; }

/* Modulo di verifica */
.es-passo { max-width: 680px; margin: 0 auto; padding: 48px 0 72px; display: flex; flex-direction: column; gap: 24px; }
.es-avanzamento { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--es-inchiostro-debole); }
.es-barra { flex-grow: 1; height: 6px; background: #E4DFD4; border-radius: 999px; overflow: hidden; }
.es-barra i { display: block; height: 100%; background: var(--es-verde); border-radius: 999px; transition: width .25s ease; }
.es-domandona { margin: 0; font-size: clamp(26px, 3.4vw, 34px); line-height: 1.15; font-weight: 600; letter-spacing: -0.5px; }
/* Il «torna indietro» del secondo passo: e' un pulsante perche' non porta a
   un altro indirizzo, ma deve avere l'aspetto di un collegamento. */
.es-collegamento { background: none; border: 0; padding: 0; font: inherit; color: var(--es-verde); text-decoration: underline; cursor: pointer; }
.es-aiuto { margin: 0; font-size: 16px; line-height: 1.55; color: var(--es-inchiostro-debole); }
.es-scelte { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.es-scelta { text-align: left; background: var(--es-superficie); border: 1px solid var(--es-bordo); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; font-family: inherit; color: inherit; }
.es-scelta:hover { border-color: var(--es-verde); }
.es-scelta[aria-pressed="true"] { border-color: var(--es-verde); box-shadow: inset 0 0 0 1px var(--es-verde); }
.es-scelta b { font-size: 17px; font-weight: 600; }
.es-scelta span { font-size: 14px; line-height: 1.45; color: var(--es-inchiostro-debole); }
.es-campone { display: flex; flex-direction: column; gap: 8px; }
.es-campone label { font-size: 15px; font-weight: 600; }
.es-campone input { height: 56px; padding: 0 16px; background: var(--es-superficie); border: 1px solid #D5CEC0; border-radius: 10px; font-family: inherit; font-size: 17px; color: var(--es-inchiostro); }
.es-campone input:focus { outline: 2px solid var(--es-verde); outline-offset: 1px; }
.es-riscontro { font-size: 15px; line-height: 1.5; padding: 12px 14px; border-radius: 10px; background: #E7EDE8; color: #14603F; }
.es-riscontro.es-attenzione { background: #F3E8D6; color: #7A5F1E; }
.es-riscontro.es-brutto { background: #F6E3E0; color: #7A2E20; }
.es-carica { display: flex; flex-wrap: wrap; gap: 12px; }
.es-carica label { flex: 1 1 200px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 64px; border: 1px dashed #C9C2B5; border-radius: 12px; background: var(--es-superficie); font-size: 16px; font-weight: 600; cursor: pointer; }
.es-carica label:hover { border-color: var(--es-verde); color: var(--es-verde); }
.es-carica input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.es-navigazione { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
.es-indietro { background: none; border: none; font-family: inherit; font-size: 15px; color: var(--es-inchiostro-debole); cursor: pointer; text-decoration: underline; padding: 8px 0; }

/* Verdetto */
.es-verdetto { max-width: 680px; margin: 0 auto; padding: 48px 0 72px; display: flex; flex-direction: column; gap: 20px; }
.es-verdetto-testa { display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 16px; border: 1px solid var(--es-bordo); background: var(--es-superficie); }
.es-verdetto-si .es-verdetto-testa { background: #14201A; border-color: #14201A; }
.es-verdetto-si .es-verdetto-testa h1, .es-verdetto-si .es-verdetto-testa p { color: #F5F2EC; }
.es-verdetto-testa h1 { margin: 0; font-size: clamp(26px, 3.4vw, 34px); line-height: 1.15; font-weight: 600; letter-spacing: -0.5px; }
.es-verdetto-testa p { margin: 0; font-size: 17px; line-height: 1.6; color: var(--es-inchiostro-tenue); }
.es-motivi { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.es-motivi li { display: flex; gap: 10px; align-items: flex-start; font-size: 16px; line-height: 1.5; color: var(--es-inchiostro-tenue); }
.es-segno { flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
.es-segno-ok { background: #DDF0E4; color: #14603F; }
.es-segno-no { background: #F6E3E0; color: #7A2E20; }
.es-segno-forse { background: #F3E8D6; color: #7A5F1E; }

@media (max-width: 640px) {
  .es-scelte { grid-template-columns: minmax(0, 1fr); }
  .es-passo, .es-verdetto { padding: 32px 0 56px; }
}
.es-dettaglio { border: 1px solid var(--es-bordo); border-radius: 10px; background: var(--es-superficie); padding: 0 16px; }
.es-dettaglio summary { cursor: pointer; padding: 14px 0; font-size: 15px; font-weight: 600; color: var(--es-verde); }
.es-dettaglio p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: var(--es-inchiostro-tenue); }

.es-striscia { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-top: 8px;
  background: var(--es-bordo); border: 1px solid var(--es-bordo); border-radius: 14px; overflow: hidden; }
.es-striscia div { background: var(--es-superficie); padding: 20px 22px; display: flex; flex-direction: column; gap: 4px; }
.es-striscia b { font-size: 28px; font-weight: 600; letter-spacing: -0.5px; }
.es-striscia span { font-size: 14px; line-height: 1.45; color: var(--es-inchiostro-debole); }
@media (max-width: 640px) { .es-striscia { grid-template-columns: minmax(0, 1fr); } }


.es-bottone-grande { height: 62px; padding: 0 34px; font-size: 18px; }
.es-scheda .es-bottone { margin-top: auto; }
.es-velo { position: fixed; inset: 0; background: rgba(20, 32, 26, .55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.es-finestra { background: var(--es-superficie); border-radius: 16px; padding: 28px; max-width: 540px; width: 100%; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(20,32,26,.3); }
.es-finestra h2 { margin: 0; font-family: "Fraunces Variable", Georgia, serif; font-size: 24px; font-weight: 600; letter-spacing: -0.3px; }
.es-finestra p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--es-inchiostro-tenue); }


/* L'imbuto: una barra per passo, lunga quanto la quota di chi ci arriva. */
.es-imbuto { width: 100%; border-collapse: collapse; }
.es-imbuto td { padding: 11px 8px; border-bottom: 1px solid var(--es-bordo); vertical-align: middle; }
.es-imbuto-nome { white-space: nowrap; font-size: 15px; }
.es-imbuto-barra { width: 100%; }
.es-imbuto-barra i { display: block; height: 12px; border-radius: 999px;
  background: var(--es-verde); min-width: 2px; transition: width .4s ease; }
.es-imbuto-num { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.es-imbuto-quota { text-align: right; width: 58px; opacity: .6; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .es-imbuto-nome { white-space: normal; font-size: 14px; }
}

/* L'elenco delle fatture caricate: una riga per documento, col modo di
   toglierne una senza ricominciare. */
.es-elenco-file { list-style: none; margin: 12px 0 0; padding: 0; display: flex;
  flex-direction: column; gap: 8px; }
.es-elenco-file li { display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border: 1px solid var(--es-bordo); border-radius: 12px; background: #fff; font-size: 14.5px; }
.es-elenco-file li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;