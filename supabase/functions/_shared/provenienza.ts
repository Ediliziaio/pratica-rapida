/**
 * Ripulitura della provenienza prima di scriverla in banca dati.
 *
 * Quella roba arriva dall'indirizzo del browser, cioe' da chiunque passi: un
 * indirizzo con dentro mezzo megabyte di spazzatura, o con campi che non
 * abbiamo mai previsto, non deve poter finire sulla pratica.
 *
 * Per questo l'elenco dei campi e' **chiuso** e non un filtro generico, e ogni
 * valore ha una lunghezza massima. Sta in _shared e non dentro la funzione
 * perche' e' un confine di sicurezza, e un confine di sicurezza va provato:
 * i test stanno in src/lib/eneasubito-provenienza-pulita.test.ts.
 */

/** I soli campi che si conservano. Tutto il resto si butta. */
export const CAMPI_PROVENIENZA = [
  "sorgente",
  "mezzo",
  "campagna",
  "parola",
  "variante",
  "gclid",
  "rinvio",
  "pagina",
  "quando",
] as const;

/** Oltre questa lunghezza si taglia: nessun parametro onesto e' piu' lungo. */
export const LUNGHEZZA_MASSIMA = 120;

export function provenienzaPulita(grezza: unknown): Record<string, string> | null {
  if (!grezza || typeof grezza !== "object" || Array.isArray(grezza)) return null;
  const dentro = grezza as Record<string, unknown>;
  const pulita: Record<string, string> = {};
  for (const campo of CAMPI_PROVENIENZA) {
    const valore = dentro[campo];
    if (typeof valore !== "string") continue;
    const ripulito = valore
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LUNGHEZZA_MASSIMA);
    if (ripulito) pulita[campo] = ripulito;
  }
  return Object.keys(pulita).length > 0 ? pulita : null;
}
