import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sendEmail = readFileSync(resolve(process.cwd(), "supabase/functions/send-email/index.ts"), "utf8");
const workflowFunction = readFileSync(resolve(process.cwd(), "supabase/functions/photovoltaico-unifilare/index.ts"), "utf8");

describe("comunicazione schema unifilare", () => {
  it("ha un template dedicato al rivenditore con il collegamento alla sua area", () => {
    expect(sendEmail).toContain('fotovoltaico_schema_da_firmare: "reseller"');
    expect(sendEmail).toContain('case "fotovoltaico_schema_da_firmare"');
    expect(sendEmail).toContain("Scarica e ricarica lo schema");
  });

  it("invia soltanto dopo il caricamento della bozza ed evita doppi invii", () => {
    expect(workflowFunction).toContain('practice.unifilare_status !== "bozza_pronta"');
    expect(workflowFunction).toContain('category", "schema_unifilare_bozza"');
    expect(workflowFunction).toContain('idempotency_key: `fotovoltaico-unifilare-${practiceId}`');
    expect(workflowFunction).toContain('unifilare_status: "inviato_da_firmare"');
  });

  it("non contiene ancora solleciti automatici", () => {
    expect(workflowFunction).not.toMatch(/reminder|sollecito/i);
  });
});
