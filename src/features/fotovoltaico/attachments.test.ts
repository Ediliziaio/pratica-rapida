import { describe, expect, it } from "vitest";
import { PHOTOVOLTAICO_MAX_FILE_SIZE, validatePhotovoltaicAttachment } from "./attachments";

describe("validatePhotovoltaicAttachment", () => {
  it("accetta una fattura PDF", () => {
    expect(validatePhotovoltaicAttachment("fatture_vendita", {
      name: "fattura.pdf",
      type: "application/pdf",
      size: 1024,
    })).toBeNull();
  });

  it("blocca una fotografia nello spazio fatture", () => {
    expect(validatePhotovoltaicAttachment("fatture_vendita", {
      name: "fattura.jpg",
      type: "image/jpeg",
      size: 1024,
    })).toContain("esclusivamente file PDF");
  });

  it("accetta una fotografia nel fascicolo tecnico", () => {
    expect(validatePhotovoltaicAttachment("fascicolo_tecnico", {
      name: "targhetta-inverter.jpg",
      type: "image/jpeg",
      size: 1024,
    })).toBeNull();
  });

  it("blocca ogni file oltre 15 MB", () => {
    expect(validatePhotovoltaicAttachment("fascicolo_tecnico", {
      name: "schema.pdf",
      type: "application/pdf",
      size: PHOTOVOLTAICO_MAX_FILE_SIZE + 1,
    })).toContain("dimensione massima 15 MB");
  });
});
