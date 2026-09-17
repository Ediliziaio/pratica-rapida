import { describe, expect, it } from "vitest";
import { readInfissiCertificateMeasures, totalInfissiCertificateSurfaceM2 } from "./infissiCertificateMeasures";

/**
 * I campioni sono estratti dai certificati reali delle pratiche del lotto del
 * 13/09/2026, e i numeri attesi sono quelli confermati dal titolare quella
 * sera, una riga per pezzo.
 */
const RIVIERA = `Dichiarazione di prestazione (DoP) N° 74081-26 - ORDINE 49
Pos. 1 Q.tà 1 [01] Cod.Identif.Prodotto tipo: Portafinestra a due ante con ribalta e fisso later [02] N. di lotto serie: 74081 - 1
da 2170 x 2353 mm.
[09] Prestazioni dichiarate Valori Classi Livelli
1499 x 2311
Pos. 2 Q.tà 1 [01] Cod.Identif.Prodotto tipo: Portafinestra a 2 ante con apertura a ribalta. [02] N. di lotto serie: 74081 - 2
da 1270 x 2353 mm.
1162 x 2311
Pos. 3 Q.tà 1 [01] Cod.Identif.Prodotto tipo: Finestra a 2 ante con apertura a ribalta. [02] N. di lotto serie: 74081 - 3
da 1270 x 1353 mm.
Luce passaggio: 1499 x 2311
Luce passaggio: 1162 x 2311`;

const CALVACCHI = `DICHIARAZIONE DI CERTIFICAZIONE ENERGETICA DI PRODOTTO
Riga Qtà Modello - Misure Vetro Coefficiente
1 1 Portafinestra 2 ante serie Omnia+
, in Abete
Lamellare da 1030 x 2269 x 101
Misure comprensive di coprifili
2343 x 1048 Mq. 2.46
2 1 Portafinestra 1 anta serie Omnia+
, in Abete
Lamellare da 915 x 2269 x 101
Misure comprensive di coprifili
2343 x 933 Mq. 2.19
3 1 Finestra 1 anta serie Omnia+
, in Abete
Lamellare da 650 x 1384 x 101
Misure comprensive di coprifili
1458 x 668 Mq. 0.97`;

/** La stessa pagina passata piu' volte sotto OCR, con un refuso in una copia. */
const BUOSI = `DICHIARAZIONE DI PRESTAZIONE
WEB/26/0103175 - 001
Quantità: 1
* 1625 x 780
‡ 680 x 684
WEB/26/0103175 - 001
* 1625 x 780
‡ 680 x 684
WEB/26/0103175 - 002
629 x 2100
WEB/26/0103175 - 002
629 x 2100
WEB/26/0103175 - 003
529 x 669
WEB/26/0103175 - 003
529 x 669
WEB/26/0103175 - 003
529 x 609
WEB/26/0103175 - 004
629 x 2100
WEB/26/0103175 - 004
629 x 2100`;

const CAPPELLO = `DICHIARAZIONE DEL PRODUTTORE
Pos. Quantitá Descrizione Valore Uw (calcolato)
100 1,00 Pezzi SALOTTO SX:
KF310 1-anta
Largh. 1.177 Alt. 1.497
Largh.: 1177, Alt.: 1497,
110 1,00 Pezzi CAMERA EMANUELE:
KF310 1-anta
Largh.: 1177, Alt.: 1497,
120 1,00 Pezzi SALOTTO SX:
KF310 porta 1-anta con soglia rib.
Largh.: 803, Alt.: 2333,
210 1,00 Pezzi LAVANDERIA:
Largh.: 993, Alt.: 895,`;

describe("misure degli infissi lette dai certificati, una riga per pezzo", () => {
  it("Riviera: DoP a posizioni, e la Luce passaggio non e' la misura del serramento", () => {
    const reading = readInfissiCertificateMeasures(RIVIERA)!;
    expect(reading.format).toBe("dop_pos_quantita");
    expect(reading.pieces.map((piece) => piece.surfaceM2)).toEqual([5.11, 2.99, 1.72]);
    expect(reading.pieces[0]).toMatchObject({ position: "1", widthMm: 2170, heightMm: 2353, quantity: 1 });
    // 1499 x 2311 e 1162 x 2311 sono luce di passaggio: non devono comparire.
    expect(reading.pieces.some((piece) => piece.widthMm === 1499 || piece.widthMm === 1162)).toBe(false);
  });

  it("Calvacchi: tabella con misura nuda e misura coi coprifili, si prende la nuda", () => {
    const reading = readInfissiCertificateMeasures(CALVACCHI)!;
    expect(reading.format).toBe("tabella_riga_qta_misure");
    expect(reading.pieces.map((piece) => piece.surfaceM2)).toEqual([2.34, 2.08, 0.9]);
    expect(reading.pieces[0]).toMatchObject({ widthMm: 1030, heightMm: 2269 });
  });

  it("Buosi: quattro posizioni, la prima e' una finestra sola in due parti", () => {
    const reading = readInfissiCertificateMeasures(BUOSI)!;
    expect(reading.format).toBe("dop_ordine_web");
    expect(reading.pieces.map((piece) => piece.surfaceM2)).toEqual([1.73, 1.32, 0.35, 1.32]);
    expect(reading.pieces[0]).toMatchObject({ position: "001", description: "Serramento in 2 parti" });
  });

  it("Buosi: una misura letta male in una sola copia OCR non diventa un secondo pezzo", () => {
    const reading = readInfissiCertificateMeasures(BUOSI)!;
    // 529 x 669 compare due volte, 529 x 609 una sola: vale 0,35 e non 0,68.
    expect(reading.pieces.find((piece) => piece.position === "003")).toMatchObject({ surfaceM2: 0.35, widthMm: 529, heightMm: 669 });
  });

  it("Buosi: se il documento e' scansionato una volta sola, nessuna misura viene scartata", () => {
    const reading = readInfissiCertificateMeasures("WEB/26/0103175 - 001\n1625 x 780\n680 x 684")!;
    expect(reading.pieces).toHaveLength(1);
    expect(reading.pieces[0].surfaceM2).toBe(1.73);
  });

  it("Cappello: quote etichettate Largh./Alt., il formato che avevo dichiarato privo di misure", () => {
    const reading = readInfissiCertificateMeasures(CAPPELLO)!;
    expect(reading.format).toBe("dichiarazione_largh_alt");
    expect(reading.pieces.map((piece) => piece.surfaceM2)).toEqual([1.76, 1.76, 1.87, 0.89]);
    expect(reading.pieces[0]).toMatchObject({ position: "100", description: "SALOTTO SX", widthMm: 1177, heightMm: 1497 });
  });

  it("una fattura senza certificato non produce misure inventate", () => {
    expect(readInfissiCertificateMeasures("FORNITURA DI N. 3 SERRAMENTI IN PVC\nTOTALE DOCUMENTO 4.500,00")).toBeNull();
    expect(readInfissiCertificateMeasures("")).toBeNull();
  });

  it("il totale serve solo al controllo: i pezzi restano distinti", () => {
    const reading = readInfissiCertificateMeasures(RIVIERA)!;
    expect(totalInfissiCertificateSurfaceM2(reading)).toBe(9.82);
    expect(reading.pieces).toHaveLength(3);
  });
});
