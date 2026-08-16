import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

describe("audit storico PDF ENEA con CPID discordanti", () => {
  it("fallisce chiuso se un singolo PDF contiene due CPID diversi", () => {
    const snapshot = parseCompletedEneaText(`
      Ecobonus 2026
      Comma 345B - Schermature solari
      CPID 288717-2026E-AAAAAAAAAAAAAAAA Data chiusura 2026-07-14 9:57:39 CEST
      Dati generali
      6. Data di ultimazione dei lavori (collaudo) 14/07/2026
      Ecobonus 2026 - CPID 999999-2026E-BBBBBBBBBBBBBBBB del 2026-07-14 9:57:39 CEST
    `);

    expect(snapshot.cpid).toBeNull();
  });

  it("mantiene il CPID se le occorrenze nel PDF coincidono", () => {
    const snapshot = parseCompletedEneaText(`
      Ecobonus 2026
      Comma 345B - Schermature solari
      CPID 288717-2026E-AAAAAAAAAAAAAAAA Data chiusura 2026-07-14 9:57:39 CEST
      Ecobonus 2026 - CPID 288717-2026E-AAAAAAAAAAAAAAAA del 2026-07-14 9:57:39 CEST
    `);

    expect(snapshot.cpid).toBe("288717-2026E-AAAAAAAAAAAAAAAA");
  });
});
