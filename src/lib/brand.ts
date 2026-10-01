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
 * Marchio corrente. L'override via querystring serve in sviluppo e per le
 * anteprime: non cambia nulla in produzione, dove decide il dominio.
 */
export function currentBrand(): Brand {
  try {
    const forced = new URLSearchParams(window.location.search).get("brand");
    if (forced === "eneasubito") return "eneasubito";
    if (forced === "pratica-rapida") return "pratica-rapida";
  } catch {
    // querystring illeggibile: si decide dal dominio
  }
  return isEneaSubitoHost() ? "eneasubito" : "pratica-rapida";
}
