export const PRINTED_DOCUMENT_TOTAL_VERSION = "apr-printed-document-total-v1" as const;

/**
 * Legge il totale stampato sui documenti impaginati a colonne.
 *
 * Regola del titolare, ripetuta molte volte: **si guarda solo il totale
 * stampato**, mai i calcoli interni, mai l'imponibile, mai l'IVA, e non lo si
 * ricalcola. Il problema non era la regola: era che su molti moduli
 * l'etichetta e il valore stanno su righe diverse. Quando il PDF impaginato a
 * colonne viene letto come testo, tutte le etichette scendono in fila e i
 * valori le seguono qualche riga piu' sotto. APR cercava "totale" e un numero
 * sulla stessa riga, non lo trovava, e dichiarava il totale non verificato.
 *
 * Casi reali del 13/09/2026: Muzzi (TOTALE ORDINE alla riga 180, valore alla
 * 183) e Codognato (TOTALE FATTURA alla riga 88, valore alla 146).
 */
export interface PrintedDocumentTotal {
  /** Importo esattamente come stampato, senza ricalcoli. */
  printed: string;
  /** Lo stesso importo in numero, per i soli confronti. */
  amount: number;
  /** Riga 1-based dell'etichetta e riga 1-based del valore. */
  labelLine: number;
  valueLine: number;
  /** Come e' stato trovato: accanto all'etichetta, o nella colonna sotto. */
  layout: "stessa_riga" | "colonna";
}

const TOTAL_LABEL = /(?:^|\s)(?:tot(?:ale)?\.?\s+(?:fattura|ordine|documento|dovuto|complessivo))/i;
const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
/** Una riga che contiene soltanto un importo, con o senza simbolo di valuta. */
const STANDALONE_AMOUNT = new RegExp(String.raw`^\s*(?:EUR|€)?\s*(${AMOUNT})\s*(?:EUR|€)?\s*$`, "i");
/** Etichetta e importo sulla stessa riga: e' la lettura piu' sicura. */
const INLINE_TOTAL = new RegExp(String.raw`tot(?:ale)?\.?\s+(?:fattura|ordine|documento|dovuto|complessivo)\s*:?\s*(?:EUR|€)?\s*(${AMOUNT})`, "i");

const toAmount = (printed: string) => Number(printed.replace(/\./g, "").replace(",", "."));

/**
 * Non somma, non sottrae, non deduce: restituisce un importo che sul
 * documento e' scritto cosi'. Se non lo trova restituisce null, e la domanda
 * all'operatore resta legittima.
 */
export function readPrintedDocumentTotal(text: string): PrintedDocumentTotal | null {
  const lines = text.split(/\r?\n/);

  // 1. Etichetta e importo sulla stessa riga. Se ce n'e' piu' d'una (le
  //    fatture elettroniche ripetono il blocco a ogni pagina) vale l'ultima,
  //    che e' il totale del documento e non di una sua sezione.
  let inline: PrintedDocumentTotal | null = null;
  for (const [index, line] of lines.entries()) {
    const match = line.match(INLINE_TOTAL);
    if (match) inline = { printed: match[1], amount: toAmount(match[1]), labelLine: index + 1, valueLine: index + 1, layout: "stessa_riga" };
  }
  if (inline) return inline;

  // 2. Impaginazione a colonne: l'etichetta e' sola sulla sua riga e il
  //    valore la segue piu' sotto, dopo altre etichette. L'ultimo importo che
  //    occupa una riga da solo e' il totale del documento: gli importi
  //    parziali (imponibile, imposta, acconti) lo precedono sempre.
  const labelLine = lines.findIndex((line) => TOTAL_LABEL.test(line));
  if (labelLine < 0) return null;
  for (let index = lines.length - 1; index > labelLine; index -= 1) {
    const match = lines[index].match(STANDALONE_AMOUNT);
    if (!match) continue;
    return { printed: match[1], amount: toAmount(match[1]), labelLine: labelLine + 1, valueLine: index + 1, layout: "colonna" };
  }
  return null;
}

/**
 * Stessa forma di guasto per i dati non monetari: l'etichetta su una riga e
 * il valore su quella dopo. Serve per i form dove "Codice fiscale" e il
 * codice stanno su righe distinte (Lomartire).
 */
export function readLabelledValueBelow(text: string, label: RegExp, value: RegExp): { value: string; labelLine: number; valueLine: number } | null {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!label.test(line)) continue;
    const inline = line.match(value);
    if (inline) return { value: inline[0], labelLine: index + 1, valueLine: index + 1 };
    for (let next = index + 1; next < Math.min(index + 4, lines.length); next += 1) {
      const candidate = lines[next].trim().match(value);
      if (candidate && lines[next].trim() === candidate[0]) return { value: candidate[0], labelLine: index + 1, valueLine: next + 1 };
    }
  }
  return null;
}
