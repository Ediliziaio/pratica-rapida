/**
 * Foglia di stile condivisa dalle pagine di EneaSubito.
 *
 * Tutto sta sotto `.es-root`: nessuna regola esce da lì, quindi il vestito di
 * EneaSubito non può toccare una virgola di Pratica Rapida.
 */
export const STILE = `
.es-root {
  --es-carta: #F5F2EC;
  --es-superficie: #FFFFFF;
  --es-inchiostro: #14201A;
  --es-inchiostro-tenue: #3F5049;
  --es-inchiostro-debole: #5A6A62;
  --es-bordo: #DFD9CE;
  --es-verde: #0E5A48;
  --es-verde-scuro: #0A4335;
  --es-verde-chiaro: #E7EDE8;
  --es-menta: #6FD3B0;
  --es-sabbia: #EFEADF;
  --es-scuro: #14201A;
  --es-scuro-2: #1D2B24;

  background: var(--es-carta);
  color: var(--es-inchiostro);
  font-family: "Work Sans", system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}
.es-root *, .es-root *::before, .es-root *::after { box-sizing: border-box; }
.es-root a { color: var(--es-verde); }
.es-root a:hover { color: var(--es-verde-scuro); }
.es-serif { font-family: Fraunces, Georgia, "Times New Roman", serif; }

.es-wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* Barra */
.es-nav { border-bottom: 1px solid var(--es-bordo); }
.es-nav-in { display: flex; align-items: center; gap: 32px; height: 76px; }
.es-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--es-inchiostro); font-size: 22px; font-weight: 600; letter-spacing: -0.2px; }
.es-nav-links { flex-grow: 1; display: flex; align-items: center; gap: 26px; }
.es-nav-links a { font-size: 15px; color: var(--es-inchiostro-tenue); text-decoration: none; }

.es-bottone { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 52px; padding: 0 26px; border-radius: 10px; font-size: 16px; font-weight: 600; text-decoration: none; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
.es-bottone-pieno { background: var(--es-verde); color: #FFFFFF; }
.es-bottone-pieno:hover { background: var(--es-verde-scuro); color: #FFFFFF; }
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
.es-numero { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: var(--es-verde); color: #FFFFFF; border-radius: 999px; font-size: 16px; font-weight: 600; }
.es-scheda-grande h3 { font-size: 24px; font-family: Fraunces, Georgia, serif; }
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
`;
