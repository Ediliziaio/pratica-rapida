import { describe, expect, it } from "vitest";
import { APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA, classifyAprInfissiTechnicalDocument } from "./infissiTechnicalDocumentClassifier";

describe("classificazione semantica dei documenti tecnici Infissi", () => {
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
