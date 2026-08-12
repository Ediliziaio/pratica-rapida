import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

describe("audit storico ENEA - righe schermatura non supportate", () => {
  it("non perde dal conteggio una riga numerata con tipologia sconosciuta", () => {
    const snapshot = parseCompletedEneaText(`
      Scheda intervento
      SS. Schermature solari
      # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²]
      1 Altra schermatura solare Esterna 3.7 2.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      2 Chiusura oscurante Esterna 4.1 3.2 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      Spese congrue sostenute [€] 13924
    `);

    expect(snapshot.fields["schermature.0.superficie"]).toBe("3.7");
    expect(snapshot.fields["schermature.1.superficie"]).toBeUndefined();
    expect(snapshot.screeningCount).toBe(-1);
  });
});
