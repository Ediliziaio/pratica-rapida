import { describe, expect, it } from "vitest";
import { APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA, classifyAprInfissiTechnicalDocument } from "./infissiTechnicalDocumentClassifier";

describe("classificazione semantica dei documenti tecnici Infissi", () => {
  it("mantiene fattura una vera fonte fiscale anche se contiene un'appendice tecnica", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "invoice", text: `
FATTURA 91/2026
Cliente Mario Rossi - Totale documento € 1.220,00
Allegato: DICHIARAZIONE DI PRESTAZIONE serramenti EN 14351-1, Uw 1,20 W/m2K, fabbricante e firma.
` });
    expect(result).toMatchObject({ verifiedKind: "invoice", profile: "invoice_passthrough" });
  });

  it("declassa semanticamente una DoP archiviata nello slot fattura", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "invoice", text: `
DICHIARAZIONE DI PRESTAZIONE DEL SERRAMENTO
Fabbricante Esempio Srl - EN 14351-1:2016
Numero: DOP-01, Modello: FINESTRA UNO, dimensioni: 930 x 1350 mm
Trasmittanza termica Uw = 1,20 W/m2K
Numero: DOP-02, Modello: PORTA FINESTRA, dimensioni: 930 x 2350 mm
Trasmittanza termica Uw = 1,20 W/m2K - Timbro e firma del rappresentante legale
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "formal_declaration" });
  });

  it.each([
    ["documento identita", "CARTA D'IDENTITA REPUBBLICA ITALIANA Cognome Rossi Nome Mario"],
    ["ricevuta bancaria", "RICEVUTA DI BONIFICO per agevolazione fiscale TRN 123456"],
    ["visura catastale", "VISURA CATASTALE foglio 10 particella 20 subalterno 3"],
    ["rapporto di prova", "RAPPORTO DI PROVA N. 325261 Istituto di prova serramenti"],
  ])("declassa %s archiviato nello slot fattura", (_label, text) => {
    expect(classifyAprInfissiTechnicalDocument({ storageKind: "invoice", text })).toMatchObject({
      verifiedKind: "additional",
      profile: "misfiled_non_fiscal_support",
    });
  });

  it("non declassa per sola incertezza un allegato nello slot fattura", () => {
    expect(classifyAprInfissiTechnicalDocument({ storageKind: "invoice", text: "Documento fiscale 2026, totale finale euro 1.220,00" })).toMatchObject({
      verifiedKind: "invoice",
      profile: "invoice_passthrough",
    });
  });

  it("riconosce una vera dichiarazione tecnica di terza parte", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
DICHIARAZIONE DELLE PRESTAZIONI TERMICHE DEL SERRAMENTO
Il sottoscritto, rappresentante legale della ditta produttrice, DICHIARA:
Riferimento 2026-635 - 1 PORTA FINESTRA, Qt 1, LXH 1845 X 2310.
Trasmittanza termica Uw = 1,13 W/m2K, determinata secondo UNI EN ISO 10077-1:2017.
Timbro e firma
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "formal_declaration", certificateScope: "installed_windows" });
    expect(result.matchedCriteria).toEqual(APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA.profiles.formal_declaration);
  });

  it("mantiene additional un documento interno privo di autorita certificativa", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
Documento tecnico interno CRM. Appunti dell'operatore: infissi presenti, controllare misure con il cliente.
Non usare questo documento come certificazione e richiedere la fonte originaria.
` });
    expect(result).toMatchObject({ verifiedKind: "additional", profile: "none" });
  });

  it("non promuove un documento interno che menziona trasmittanza e numeri fuori da un certificato", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
NOTA INTERNA CRM - promemoria operatore
Il cliente ha detto a voce che la trasmittanza termica potrebbe essere Uw = 1,30 W/m2K.
Annotate anche dimensioni: 1200 x 1400, ma sono da verificare e non provengono dal produttore.
Non è una dichiarazione di prestazione, non è firmata e non costituisce certificato.
` });
    expect(result).toMatchObject({ verifiedKind: "additional", profile: "none" });
    expect(result.matchedCriteria).toContain("numeric_thermal_performance");
    expect(result.missingCriteria).toContain("declaring_party_or_signature");
  });

  it("riconosce una DoP strutturata senza titolo soltanto con almeno due blocchi completi", () => {
    const text = `
Numero: 1738/2026-01, Modello: FIN1 ELEGANT
FINESTRA AD UN'ANTA, dimensioni: 930 x 1350
Trasmittanza termica 1,07 W/m2K - EN 14351-1:2016
Numero: 1738/2026-02, Modello: PFIN1 ELEGANT
PORTA FINESTRA AD UN'ANTA, dimensioni: 930 x 2350
Trasmittanza termica 1,07 W/m2K - EN 14351-1:2016
`;
    expect(classifyAprInfissiTechnicalDocument({ storageKind: "additional", text })).toMatchObject({
      verifiedKind: "third_party_certificate",
      profile: "structured_product_dop",
    });
    expect(classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: text.split("Numero: 1738/2026-02")[0] })).toMatchObject({
      verifiedKind: "additional",
      profile: "none",
    });
  });

  it("riconosce il valore termico etichettato con Uw tra parentesi in una DoP formale", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
Dichiarazione di prestazione (DoP) N° 74618-26
Pos. 1 Q.tà 1 - Finestra ad 1 anta - da 720 x 670 mm.
Fabbricante: Gruppo Cosmet
Trasmittanza termica (Uw) 1.2 UNI EN ISO 10077-1
Norma di prodotto: finestre e porte pedonali esterne - EN 14351-1:2016
Firma del legale rappresentante
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "formal_declaration", certificateScope: "installed_windows" });
    expect(result.matchedCriteria).toContain("numeric_thermal_performance");
  });

  it("DoP tabellare con legenda 9.7 promossa", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
DICHIARAZIONE di PRESTAZIONE
Scopo utilizzo: serramento in pvc per uso esterno.
Produttore: Finestra Esempio s.r.l.
Normativa armonizzata: EN 14351-1:2016
9. prestazione dichiarata:
POS. CODICE 9.1 9.2 9.3 9.4 9.5 9.6 9.7 9.8a 9.9
1 F_A 8A - C5/B5 - - - 1,28W/m2K - 4
2 F_B 8A - C5/B5 - - - 1,22W/m2K - 4
Legenda: 9.1 Tenuta all'acqua, 9.7 Trasmittanza termica, 9.9 Permeabilità all'aria
La dichiarazione è sotto la responsabilità del fabbricante. FIRMA
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "formal_declaration", certificateScope: "installed_windows" });
    expect(result.matchedCriteria).toContain("numeric_thermal_performance");
  });

  it("colonna numerica senza legenda non promossa", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
DICHIARAZIONE di PRESTAZIONE del serramento
Produttore e fabbricante: Finestra Esempio s.r.l. - FIRMA
Normativa armonizzata: EN 14351-1:2016
POS. CODICE 9.1 9.2 9.3 9.4 9.5 9.6 9.7 9.8a 9.9
1 F_A 8A - C5/B5 - - - 1,28W/m2K - 4
2 F_B 8A - C5/B5 - - - 1,22W/m2K - 4
` });
    expect(result).toMatchObject({ verifiedKind: "additional", profile: "none" });
    expect(result.missingCriteria).toContain("numeric_thermal_performance");
  });

  it("etichette abbreviate complete promosse", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
EN 14351-1:2016
Commessa: 35760/2025
posizione: 01 numero: 1/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
\fEN 14351-1:2016
Commessa: 35760/2025
posizione: 01 numero: 2/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "abbreviated_product_label", certificateScope: "installed_windows" });
  });

  it("non promuove un testo con Uw tra parentesi se manca il profilo certificativo chiuso", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
Nota interna: finestra 720 x 670. Trasmittanza termica (Uw) 1.2.
Valore riferito telefonicamente e da verificare.
` });
    expect(result).toMatchObject({ verifiedKind: "additional", profile: "none" });
    expect(result.matchedCriteria).toContain("numeric_thermal_performance");
    expect(result.missingCriteria).toContain("technical_standard");
    expect(result.missingCriteria).toContain("declaring_party_or_signature");
  });

  it("non promuove mai una appendice ENEA storica anche se contiene segnali tecnici", () => {
    const result = classifyAprInfissiTechnicalDocument({
      storageKind: "additional",
      historicalEneaAppendixExcluded: true,
      text: "Dichiarazione di prestazione serramenti, Uw = 1,2 W/m2K, UNI EN ISO 10077, rappresentante legale e firma.",
    });
    expect(result.verifiedKind).toBe("additional");
  });

  it("marca separatamente un certificato riferito agli infissi rimossi", () => {
    const result = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: `
ASSEVERAZIONE DELLE PRESTAZIONI TERMICHE DEGLI INFISSI DISMESSI
Il rappresentante legale assevera la trasmittanza termica Uw = 6,00 W/m2K secondo UNI EN ISO 10077-1:2007. Timbro e firma.
` });
    expect(result).toMatchObject({ verifiedKind: "third_party_certificate", profile: "formal_declaration", certificateScope: "removed_windows" });
  });
});
