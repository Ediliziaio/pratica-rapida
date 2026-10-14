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

  it("richiede il PDF per lo schema iniziale ma accetta una foto nitida dello schema firmato", () => {
    expect(validatePhotovoltaicAttachment("schema_unifilare_rivenditore", {
      name: "schema.pdf",
      type: "application/pdf",
      size: 1024,
    })).toBeNull();
    expect(validatePhotovoltaicAttachment("schema_unifilare_firmato", {
      name: "foto-schema.jpg",
      type: "image/jpeg",
      size: 1024,
    })).toBeNull();
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
