import { describe, expect, it } from "vitest";

import { emptyFormData } from "@/types/form-cliente";
import { validateEdificio } from "./validation";

describe("validateEdificio con valori numerici da una bozza JSON", () => {
  it("non genera eccezioni e accetta i tre campi numerici validi", () => {
    const data = emptyFormData();
    data.edificio.anno_costruzione = 1998 as unknown as string;
    data.edificio.superficie_mq = 120 as unknown as string;
    data.edificio.numero_appartamenti = 1 as unknown as string;

    expect(() => validateEdificio(data)).not.toThrow();
    const errors = validateEdificio(data);
    expect(errors["edificio.anno_costruzione"]).toBeUndefined();
    expect(errors["edificio.superficie_mq"]).toBeUndefined();
    expect(errors["edificio.numero_appartamenti"]).toBeUndefined();
  });

  it("continua a segnalare un anno numerico fuori intervallo", () => {
    const data = emptyFormData();
    data.edificio.anno_costruzione = 1700 as unknown as string;

    expect(validateEdificio(data)["edificio.anno_costruzione"]).toContain("Anno non valido");
  });
});
