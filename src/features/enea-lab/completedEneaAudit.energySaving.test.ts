import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

describe("audit storico ENEA - risparmio energetico conclusivo", () => {
  it("legge il risparmio di energia primaria dal riepilogo 2026 osservato", () => {
    const snapshot = parseCompletedEneaText(`
      Ecobonus 2026
      Comma 345B - Schermature solari
      Riepilogo
      2. Risparmio stimato di energia primaria non rinnovabile [kWh/anno]
      Il calcolo del risparmio energetico è a cura degli utenti. In alcuni casi semplici la valutazione del risparmio
      energetico è eseguita automaticamente.
      311
      Il documento originale cartaceo, quando è prevista l'asseverazione del tecnico, deve riportare la firma.
    `);

    expect(snapshot.fields["schermature.risparmio_energia"]).toBe("311");
  });
});
