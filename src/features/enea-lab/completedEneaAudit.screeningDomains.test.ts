import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

function completedScreeningRow(row: string): string {
  return `
    Ecobonus 2026
    Comma 345B - Schermature solari
    Scheda intervento
    SS. Schermature solari
    # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²]
    ${row}
    Spese congrue sostenute [€] 1000
  `;
}

describe("audit storico ENEA - domini schermature osservati", () => {
  it("legge una chiusura oscurante a Nord con domini ENEA 2026 estesi", () => {
    const snapshot = parseCompletedEneaText(completedScreeningRow(
      "1 Persiana avvolgibile Interna 2.4 2.0 0.08 Nord Dalla tabella del programma Chiusure oscuranti(*) 0.10 Legno Servoassistito",
    ));

    expect(snapshot.screeningCount).toBe(1);
    expect(snapshot.fields["schermature.0.tipo"]).toBe("Persiana avvolgibile");
    expect(snapshot.fields["schermature.0.installazione"]).toBe("Interna");
    expect(snapshot.fields["schermature.0.esposizione"]).toBe("Nord");
    expect(snapshot.fields["schermature.0.modalita_calcolo"]).toBe(
      "Dalla tabella del programma Chiusure oscuranti(*)",
    );
    expect(snapshot.fields["schermature.0.materiale"]).toBe("Legno");
    expect(snapshot.fields["schermature.0.regolazione"]).toBe("Servoassistito");
  });

  it("legge una schermatura integrata con calcolo UNI EN 13125", () => {
    const snapshot = parseCompletedEneaText(completedScreeningRow(
      "1 Schermatura integrata (veneziana nella vetrocamera) Interna 1.8 1.8 0.08 Sud Calcolato secondo UNI EN 13125 0.20 Plastica Automatico",
    ));

    expect(snapshot.screeningCount).toBe(1);
    expect(snapshot.fields["schermature.0.tipo"]).toBe(
      "Schermatura integrata (veneziana nella vetrocamera)",
    );
    expect(snapshot.fields["schermature.0.modalita_calcolo"]).toBe("Calcolato secondo UNI EN 13125");
    expect(snapshot.fields["schermature.0.materiale"]).toBe("Plastica");
  });

  it("resta fail-closed su Nord per una schermatura solare", () => {
    const snapshot = parseCompletedEneaText(completedScreeningRow(
      "1 Tenda o veneziana Esterna 2.4 2.0 0.08 Nord Dichiarato dal fornitore 0.10 Tessuto Manuale",
    ));

    expect(snapshot.screeningCount).toBe(-1);
    expect(snapshot.fields["schermature.0.tipo"]).toBeUndefined();
  });
});
