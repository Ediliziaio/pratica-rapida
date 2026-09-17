import { describe, expect, it } from "vitest";
import { parseScreeningInvoiceText } from "./invoiceParser";

describe("parser fatture native: evidenza prodotto esplicita e fail-closed", () => {
  it("recupera una tenda cassonata singola con L/SP e il totale fiscale stampato", () => {
    const parsed = parseScreeningInvoiceText(`Cedente/prestatore (fornitore)
Denominazione: SIMA HOME S.R.L.S.
Cessionario/committente (cliente)
Codice fiscale: BNCGLC73R11H355N
Tipologia documento Art. 73 Numero documento Data documento Codice destinatario
TD01 (fattura) 113 01-07-2026
Causale
FATTURA N. 113
Cod. articolo Descrizione Quantità Prezzo unitario UM Sconto o %IVA Prezzo totale
1,00 2.279,00 10,00 2.279,00
Vostro dare per tenda cassonata modello Denver Arquati dimensioni L 350 x Sp 200
motorizzata con telecomando. Importo totale euro 2.506,90 compreso IVA 10%.
Primo acconto euro 1.253,45. Secondo acconto euro 1.002,76. Saldo euro 250,69.
RIEPILOGHI IVA E TOTALI
Totale imponibile Totale imposta
2.279,00 227,90
Importo bollo Bollo Virtuale Sconto/Maggiorazione Arr. Totale documento
Modalità pagamento Coordinate Bancarie Istituto Data scadenza Importo
2.506,90
2.506,90`, "fattura-sdi-narrativa.pdf");

    expect(parsed.result).toMatchObject({ documentNumber: "113", documentDate: "2026-07-01", total: 2506.9 });
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 3500, heightMm: 2000, gTot: null }),
    ]);
  });

  it("espande un elenco di misure soltanto quando coincide con la quantita esplicita", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 189 del 04-08-2026
FORNITURA E POSA TENDE DA SOLE
modello: AMALFI
misura:
- 400x225
- 300x225
Gtot 0,16 Classe 2
N 1.600,00
22
2,00 3.200,00
Totale
€ 4.270,00`, "fattura-elenco-misure.pdf");

    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 4000, heightMm: 2250, gTot: 0.16 }),
      expect.objectContaining({ widthMm: 3000, heightMm: 2250, gTot: 0.16 }),
    ]);
  });

  it("resta fail-closed se quantita ed elenco misure non coincidono", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 190 del 05-08-2026
FORNITURA E POSA TENDE DA SOLE
modello: AMALFI
misura:
- 400x225
Gtot 0,16 Classe 2
N 1.600,00
22
2,00 3.200,00
Totale
€ 4.270,00`, "fattura-elenco-misure-incompleto.pdf");

    expect(parsed.result.status).toBe("failed");
    expect(parsed.result.message).toMatch(/quantit.+misure|cardinalit/i);
    expect(parsed.items).toEqual([]);
  });

  it("legge una coppia LARGHEZZA/SPORGENZA con unita esplicita e gTot", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 20/2026 del 05/06/2026
FORNITURA TRASPORTO E INSTALLAZIONE DI:
SCHERMATURA SOLARE A BRACCI ESTENSIBILI
N.1 COME SOPRA REALIZZATA A MISURA LARGHEZZA MT. 3,20 X SPORGENZA MT. 2,25
€ 1.549,18
FATTORE G TOT: 0,14
SCADENZE
05/06/2026: € 1.890,00
Imponibile € 1.549,18
Totale IVA € 340,82
€ 1.890,00`, "fattura-misure-a-parole.pdf");

    expect(parsed.result).toMatchObject({ documentNumber: "20/2026", documentDate: "2026-06-05", total: 1890 });
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 3200, heightMm: 2250, gTot: 0.14 }),
    ]);
  });

  it("non promuove una coppia LARGHEZZA/SPORGENZA priva di famiglia prodotto", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 21/2026 del 05/06/2026
Misura vano LARGHEZZA MT. 3,20 X SPORGENZA MT. 2,25
FATTORE G TOT: 0,14
Totale documento 1.890,00`, "fattura-misura-vano.pdf");

    expect(parsed.items).toEqual([]);
  });
});
