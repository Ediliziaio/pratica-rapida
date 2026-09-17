import { describe, expect, it } from "vitest";
import { readLabelledValueBelow, readPrintedDocumentTotal } from "./printedDocumentTotal";

/** Blocco totali della fattura Muzzi, cosi' come esce dall'estrazione testo. */
const MUZZI = `TOTALE MERCE
TOTALE IMPOSTA
ACCONTO
SPESE TRASPORTO SC.% MERCE 2.121,00 1.293,81
466,62
IMPORTO SCONTO
TOTALE IMPONIBILE
SPESE IMBALLO TOTALE ORDINE
2.121,00
SPESE VARIE
2.587,62
ANNOTAZIONI
TIMBRO E FIRMA PER ACCETTAZIONE`;

/** Fattura Codognato: il valore arriva molto piu' sotto dell'etichetta. */
const CODOGNATO = `TOTALE MERCE SC.% MERCE IMPORTO SCONTO TOTALE NETTO C.IVA 1.097,00 IMPONIBILE 1.097,00
TOTALE IMPONIBILE TOTALE IVA TOTALE ESENTE
TOTALE FATTURA
SCADENZE

5.485,00
548,50
-4.388,00
-965,36
1.097,00 -416,86 EUR 680,14 SCADENZE
19-06-26 Bon VF 680,14
EUR 680,14`;

const GIRELLI = `Imponibile
IVA 10% su 1.139,86 €
Totale fattura
1.139,86 €
113,99 €
1.253,85 €
Totale dovuto 1.253,85 €`;

describe("totale stampato, letto e mai ricalcolato", () => {
  it("Muzzi: etichetta alla riga 8, valore alla riga 11, in mezzo un'altra etichetta", () => {
    const total = readPrintedDocumentTotal(MUZZI)!;
    expect(total).toMatchObject({ printed: "2.587,62", amount: 2587.62, layout: "colonna" });
    expect(total.valueLine).toBe(11);
  });

  it("Muzzi: non prende l'imponibile, che pure e' li' sopra", () => {
    expect(readPrintedDocumentTotal(MUZZI)!.printed).not.toBe("2.121,00");
  });

  it("Codognato: il valore sta cinquanta righe piu' giu' e viene comunque trovato", () => {
    expect(readPrintedDocumentTotal(CODOGNATO)).toMatchObject({ printed: "680,14", layout: "colonna" });
  });

  it("Codognato: gli importi parziali e gli acconti negativi non vengono scambiati per il totale", () => {
    const total = readPrintedDocumentTotal(CODOGNATO)!;
    expect(["5.485,00", "548,50", "1.097,00"]).not.toContain(total.printed);
  });

  it("Girelli: quando etichetta e importo stanno sulla stessa riga, vince quella lettura", () => {
    expect(readPrintedDocumentTotal(GIRELLI)).toMatchObject({ printed: "1.253,85", layout: "stessa_riga" });
  });

  it("senza etichetta di totale non inventa un importo", () => {
    expect(readPrintedDocumentTotal("Imponibile € 2.272,73\nTotale IVA € 227,27\n€ 2.500,00")).toBeNull();
    expect(readPrintedDocumentTotal("nessun importo qui")).toBeNull();
    expect(readPrintedDocumentTotal("")).toBeNull();
  });

  it("un'etichetta senza alcun importo dopo di se' resta senza risposta", () => {
    expect(readPrintedDocumentTotal("TOTALE FATTURA\nSCADENZE\nTIMBRO")).toBeNull();
  });

  it("il codice fiscale sotto la sua etichetta viene letto come il totale sotto la sua", () => {
    const form = "Codice fiscale\nLMRSLV87C70E882M\nEmail";
    expect(readLabelledValueBelow(form, /codice\s+fiscale/i, /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/))
      .toMatchObject({ value: "LMRSLV87C70E882M", labelLine: 1, valueLine: 2 });
  });

  it("se il valore e' gia' accanto all'etichetta non si va a cercarlo sotto", () => {
    expect(readLabelledValueBelow("Cod. Fisc. LMRSLV87C70E882M", /cod\.?\s*fisc/i, /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/))
      .toMatchObject({ value: "LMRSLV87C70E882M", labelLine: 1, valueLine: 1 });
  });
});
