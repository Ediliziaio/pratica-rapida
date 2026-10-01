/**
 * Guscio comune delle pagine di EneaSubito: intestazione, piè di pagina,
 * caratteri e foglia di stile. Le pagine ci mettono dentro solo il contenuto.
 *
 * Nessun collegamento verso Pratica Rapida, da nessuna parte: i due marchi non
 * si devono toccare. Anche le pagine legali sono le proprie (vedi rotte in
 * App.tsx), non quelle condivise con l'altro sito.
 */
import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { STILE } from "./stile";

export function Fulmine({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--es-verde)" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

export function Spunta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

interface GuscioProps {
  titolo: string;
  descrizione: string;
  /** Percorso canonico, con la barra iniziale: "/" per la home. */
  percorso: string;
  children: ReactNode;
}

export function Guscio({ titolo, descrizione, percorso, children }: GuscioProps) {
  const canonico = `https://www.eneasubito.it${percorso}`;
  return (
    <div className="es-root">
      <Helmet>
        <html lang="it" />
        <title>{titolo}</title>
        <meta name="description" content={descrizione} />
        <link rel="canonical" href={canonico} />
        <meta property="og:title" content={titolo} />
        <meta property="og:description" content={descrizione} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonico} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&display=swap"
        />
        <style>{STILE}</style>
      </Helmet>

      <header className="es-nav">
        <div className="es-wrap es-nav-in">
          <Link className="es-logo es-serif" to="/">
            <Fulmine />
            EneaSubito
          </Link>
          <nav className="es-nav-links">
            <Link to="/infissi">Infissi</Link>
            <Link to="/schermature-solari">Schermature solari</Link>
            <Link to="/pompe-di-calore">Pompe di calore</Link>
          </nav>
          {/* TODO(punto 3): porterà al modulo di verifica quando esisterà. */}
          <a className="es-bottone es-bottone-pieno es-bottone-piccolo" href="/#inizia">Verifica gratis</a>
        </div>
      </header>

      {children}

      <div className="es-wrap">
        <footer className="es-pie">
          <div className="es-pie-marchio">
            <span className="es-serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--es-inchiostro)" }}>EneaSubito</span>
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
