import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

function completedScreeningPdf(row: string): string {
  return `
    Ecobonus 2026
    Comma 345B - Schermature solari
    CPID 288717-2026E-TEST
    Scheda intervento
    SS. Schermature solari
    # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²] Resistenza termica supplementare (Rsupp) [Km²/W] Esposizione Modalità di calcolo Fattore di trasmissione solare (gtot) Materiale schermature Meccanismo di regolazione
    ${row}
    Spese congrue sostenute [€] 1000
  `;
}

describe("audit storico ENEA · colonne prestazionali schermature", () => {
  it("accetta una schermatura solare conclusa senza Rsupp quando il gTot e' presente", () => {
    const snapshot = parseCompletedEneaText(completedScreeningPdf(
      "1 Tenda o veneziana Esterna 3.7 2.9 Sud Dichiarato dal fornitore 0.13 Tessuto Manuale",
    ));

    expect(snapshot.screeningCount).toBe(1);
    expect(snapshot.fields["schermature.0.rsupp"]).toBeUndefined();
    expect(snapshot.fields["schermature.0.gtot"]).toBe("0.13");
  });

  it("accetta una chiusura oscurante conclusa senza gTot quando la Rsupp e' presente", () => {
    const snapshot = parseCompletedEneaText(completedScreeningPdf(
      "1 Persiana avvolgibile Esterna 3.7 2.9 0.08 Nord Calcolato secondo UNI EN 13125 Metallo Manuale",
    ));

    expect(snapshot.screeningCount).toBe(1);
    expect(snapshot.fields["schermature.0.rsupp"]).toBe("0.08");
    expect(snapshot.fields["schermature.0.gtot"]).toBeUndefined();
  });

  it("resta fail-closed se manca il gTot a una schermatura solare", () => {
    const snapshot = parseCompletedEneaText(completedScreeningPdf(
      "1 Tenda o veneziana Esterna 3.7 2.9 0.08 Sud Dichiarato dal fornitore Tessuto Manuale",
    ));

    expect(snapshot.screeningCount).toBe(-1);
  });

  it("resta fail-closed se manca la Rsupp a una chiusura oscurante", () => {
    const snapshot = parseCompletedEneaText(completedScreeningPdf(
      "1 Persiana avvolgibile Esterna 3.7 2.9 Nord Calcolato secondo UNI EN 13125 Metallo Manuale",
    ));

    expect(snapshot.screeningCount).toBe(-1);
  });
});
