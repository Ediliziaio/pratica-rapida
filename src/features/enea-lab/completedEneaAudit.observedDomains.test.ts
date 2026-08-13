import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

/**
 * Regressione sul dominio schermature osservato nel portale ENEA 2026.
 * La fixture è sintetica e anonimizzata: serve solo a verificare che l'audit
 * read-only dei PDF conclusivi sappia leggere tutti i valori che il workflow
 * ufficiale può rappresentare, senza perdere righe valide come "sconosciute".
 */
describe("audit storico ENEA - domini schermature osservati", () => {
  it("legge tipi, installazioni, esposizioni, calcoli, materiali e regolazioni estesi", () => {
    const snapshot = parseCompletedEneaText(`
      Scheda intervento
      SS. Schermature solari
      # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²]
      Resistenza termica supplementare (Rsupp) [Km²/W] Esposizione Modalità di calcolo
      Fattore di trasmissione solare (gtot) Materiale schermature Meccanismo di regolazione
      1 Persiana Interna 1.2 1.0 0.08 Nord Dalla tabella del programma Chiusure oscuranti(*) 0.20 Legno Servoassistito
      2 Persiana avvolgibile Esterna 2.4 2.0 0.08 Nord-Est Calcolato secondo UNI EN 13125 0.25 Plastica Automatico
      3 Schermatura integrata (veneziana nella vetrocamera) Interna 1.8 1.5 0.08 Nord-Ovest Dichiarato dal fornitore 0.15 Altro Manuale
      4 Altra chiusura oscurante Esterna 3.0 2.5 0.08 P-orizzontale Dichiarato dal fornitore 0.18 PVC Manuale
      Spese congrue sostenute [€] 1000
    `);

    expect(snapshot.screeningCount).toBe(4);
    expect(snapshot.fields["schermature.0.tipo"]).toBe("Persiana");
    expect(snapshot.fields["schermature.0.installazione"]).toBe("Interna");
    expect(snapshot.fields["schermature.0.esposizione"]).toBe("Nord");
    expect(snapshot.fields["schermature.0.modalita_calcolo"]).toBe("Dalla tabella del programma Chiusure oscuranti(*)");
    expect(snapshot.fields["schermature.0.materiale"]).toBe("Legno");
    expect(snapshot.fields["schermature.0.regolazione"]).toBe("Servoassistito");

    expect(snapshot.fields["schermature.1.tipo"]).toBe("Persiana avvolgibile");
    expect(snapshot.fields["schermature.1.esposizione"]).toBe("Nord-Est");
    expect(snapshot.fields["schermature.1.modalita_calcolo"]).toBe("Calcolato secondo UNI EN 13125");
    expect(snapshot.fields["schermature.1.materiale"]).toBe("Plastica");

    expect(snapshot.fields["schermature.2.tipo"]).toBe("Schermatura integrata (veneziana nella vetrocamera)");
    expect(snapshot.fields["schermature.2.esposizione"]).toBe("Nord-Ovest");
    expect(snapshot.fields["schermature.2.materiale"]).toBe("Altro");

    expect(snapshot.fields["schermature.3.tipo"]).toBe("Altra chiusura oscurante");
    expect(snapshot.fields["schermature.3.esposizione"]).toBe("P-orizzontale");
  });
});
