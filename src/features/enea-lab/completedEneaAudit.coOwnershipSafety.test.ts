import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

const BASE = `
Ecobonus 2026
3. Proprietario o detentore dell'edificio o avente diritto
Nome: Mario
Cognome: Rossi
Codice fiscale: RSSMRA80A01H501U
Sesso: M
Data di nascita: 01/01/1980
Comune di nascita: Roma (RM)
Residenza: Via Esempio 1 - 00100 Roma (RM)
`;

describe("audit storico cointestazione ENEA", () => {
  it("riconosce come non cointestata una pratica conclusa con entrambe le sezioni altri beneficiari vuote", () => {
    const snapshot = parseCompletedEneaText(`${BASE}
4. Altri beneficiari (persone fisiche)
5. Altri beneficiari (persone giuridiche)
6. Titolo di possesso Proprietario o comproprietario
7. Destinazione d'uso generale Residenziale
`);

    expect(snapshot.fields["beneficiario.cointestazione"]).toBe("No");
  });

  it("non certifica come singolo beneficiario un PDF conclusivo che contiene altri beneficiari persone fisiche", () => {
    const snapshot = parseCompletedEneaText(`${BASE}
4. Altri beneficiari (persone fisiche)
Nome: Lucia Rossi Codice fiscale: RSSLCU82B41H501A
5. Altri beneficiari (persone giuridiche)
6. Titolo di possesso Proprietario o comproprietario
7. Destinazione d'uso generale Residenziale
`);

    expect(snapshot.fields["beneficiario.cointestazione"]).toBe("Sì");
  });

  it("non certifica come singolo beneficiario un PDF conclusivo che contiene altri beneficiari persone giuridiche", () => {
    const snapshot = parseCompletedEneaText(`${BASE}
4. Altri beneficiari (persone fisiche)
5. Altri beneficiari (persone giuridiche)
Denominazione: Esempio SRL Codice fiscale: 12345678901
6. Titolo di possesso Proprietario o comproprietario
7. Destinazione d'uso generale Residenziale
`);

    expect(snapshot.fields["beneficiario.cointestazione"]).toBe("Sì");
  });
});
