/**
 * Marchi serviti dallo stesso deploy.
 *
 * Pratica Rapida (praticarapida.it) e EneaSubito (eneasubito.it) girano sulla
 * stessa applicazione e sullo stesso Supabase: cambiano home, colori e testi,
 * non la macchina sotto. Il marchio si riconosce dal dominio, come già si fa
 * per il sottodominio `app.` in App.tsx.
 *
 * In sviluppo il dominio è sempre localhost: per vedere EneaSubito si usa la
 * rotta esplicita /eneasubito, oppure `?brand=eneasubito` su qualunque pagina.
 */

export type Brand = "pratica-rapida" | "eneasubito";

export const BRANDS = {
  "pratica-rapida": {
    nome: "Pratica Rapida",
    dominio: "https://www.praticarapida.it",
  },
  eneasubito: {
    nome: "EneaSubito",
    dominio: "https://www.eneasubito.it",
  },
} as const;

/** True se l'host servito è quello di EneaSubito (con o senza www). */
export function isEneaSubitoHost(hostname = window.location.hostname): boolean {
  return /(^|\.)eneasubito\.(it|com)$/i.test(hostname);
}

/**
 * Vero solo sulle macchine di sviluppo e sulle anteprime di Cloudflare, mai
 * sui domini veri. Serve a limitare l'interruttore qui sotto.
 */
function ambienteDiProva(hostname = window.location.hostname): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".pages.dev")
  );
}

/**
 * Marchio corrente: in produzione decide il dominio e basta.
 *
 * L'interruttore `?brand=` vale **solo** in sviluppo e sulle anteprime. In
 * produzione dev'essere inerte: altrimenti chiunque aggiungesse
 * `?brand=eneasubito` all'indirizzo di praticarapida.it si ritroverebbe
 * EneaSubito sul sito dell'altro marchio, che è esattamente la cosa che i due
 * marchi non devono poter fare.
 */
export function currentBrand(): Brand {
  try {
    if (ambienteDiProva()) {
      const forced = new URLSearchParams(window.location.search).get("brand");
      if (forced === "eneasubito") return "eneasubito";
      if (forced === "pratica-rapida") return "pratica-rapida";
    }
  } catch {
    // querystring illeggibile: si decide dal dominio
  }
  return isEneaSubitoHost() ? "eneasubito" : "pratica-rapida";
}
