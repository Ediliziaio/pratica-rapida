import { describe, expect, it } from "vitest";
import { ENEA_OPERATIONAL_PROTOCOL, ENEA_OPERATIONAL_REGISTRY, registryRule, rulesForStep } from "./operationalRegistry";

describe("registro operativo unico",()=>{
  it("ha id stabili e schema decisionale completo",()=>{
    expect(new Set(ENEA_OPERATIONAL_REGISTRY.map(r=>r.id)).size).toBe(ENEA_OPERATIONAL_REGISTRY.length);
    for(const rule of ENEA_OPERATIONAL_REGISTRY) expect(rule).toMatchObject({id:expect.any(String),condition:expect.any(String),sourcePrecedence:expect.any(Array),deterministicAction:expect.any(String),audit:expect.any(String),outcome:expect.stringMatching(/continue|requested_operator/)});
  });
  it("copre una sola volta il protocollo ordinato completo",()=>{
    expect(ENEA_OPERATIONAL_PROTOCOL).toEqual(["customer_form","identity_property","dates","economic_sources","gross_reconciliation","screenings","plant","enea_mapping","preview","submit_cpid"]);
    for(const step of ENEA_OPERATIONAL_PROTOCOL) expect(rulesForStep(step).length).toBeGreaterThan(0);
  });
  it("rende reperibili le regole solo per id",()=>expect(registryRule("core-form-first")?.step).toBe("customer_form"));
});
