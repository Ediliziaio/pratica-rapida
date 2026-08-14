import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

describe("audit storico ENEA - tabella schermature vuota", () => {
  it("resta fail-closed se il PDF schermature non contiene alcuna riga tecnica interpretabile", () => {
    const snapshot = parseCompletedEneaText(`
      Ecobonus 2026
      Comma 345B - Schermature solari
      Scheda intervento
      SS. Schermature solari
      # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²]
      Spese congrue sostenute [€] 13924
      2. Risparmio stimato di energia primaria non rinnovabile [kWh/anno] 311 Il documento originale cartaceo
    `);

    expect(snapshot.screeningCount).toBe(-1);
  });
});
