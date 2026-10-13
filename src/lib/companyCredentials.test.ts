import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, getFunctionErrorMessage } from "./companyCredentials";

describe("credenziali temporanee dei rivenditori", () => {
  it("genera sempre password di 12 caratteri con maiuscola, minuscola, numero e simbolo", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const password = generateTemporaryPassword();

      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%]/);
    }
  });

  it("mostra il dettaglio restituito dalla Edge Function", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        json: async () => ({ error: "Sessione scaduta, rieffettua il login." }),
      },
    };

    await expect(getFunctionErrorMessage(error, "Operazione fallita"))
      .resolves.toBe("Sessione scaduta, rieffettua il login.");
  });

  it("mantiene il messaggio originale se la risposta non è JSON", async () => {
    const error = {
      message: "Servizio temporaneamente non disponibile",
      context: { json: async () => { throw new Error("not json"); } },
    };

    await expect(getFunctionErrorMessage(error, "Operazione fallita"))
      .resolves.toBe("Servizio temporaneamente non disponibile");
  });
});
