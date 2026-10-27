/**
 * Gli orari dell'assistenza, provati sull'ora italiana e non su quella del
 * computer che fa girare i test.
 */
import { describe, expect, it } from "vitest";

import {
  inOrario,
  quandoRispondiamo,
  statoBreve,
} from "../pages/eneasubito/chat/orari";

// Ottobre: in Italia e' UTC+2.
const alle = (oraItaliana: number) =>
  new Date(`2026-10-19T${String(oraItaliana - 2).padStart(2, "0")}:30:00Z`);

describe("inOrario", () => {
  it.each([
    [9, true],
    [12, true],
    [17, true],
    [18, false],
    [20, false],
    [8, false],
  ])("alle %i italiane -> %s", (ora, atteso) => {
    expect(inOrario(alle(ora))).toBe(atteso);
  });

  // D'inverno l'Italia e' UTC+1: la stessa ora UTC cade in un orario diverso.
  it("segue l'ora legale", () => {
    expect(inOrario(new Date("2027-01-19T08:30:00Z"))).toBe(true); // 09:30
    expect(inOrario(new Date("2027-01-19T07:30:00Z"))).toBe(false); // 08:30
  });
});

describe("cosa diciamo", () => {
  // Si controlla la regola, non la frase: la scritta fuori orario e' cambiata
  // il 21/10/2026 per decisione del Titolare, e un test legato alle parole
  // esatte diventa rosso per una modifica voluta. Quello che non deve mai
  // succedere e' dire «online» quando non lo siamo.
  it("non dice «online» fuori orario", () => {
    expect(statoBreve(alle(12))).toBe("online");
    expect(statoBreve(alle(22))).not.toBe("online");
    expect(statoBreve(alle(7))).not.toBe("online");
  });

  // La promessa dev'essere mantenibile: dopo le 18 non si dice «poche ore».
  it("dopo le 18 dice che se ne parla domani", () => {
    expect(quandoRispondiamo(alle(12))).toContain("poche ore");
    expect(quandoRispondiamo(alle(20))).toContain("il giorno dopo");
    expect(quandoRispondiamo(alle(7))).toContain("mattinata");
  });
});
