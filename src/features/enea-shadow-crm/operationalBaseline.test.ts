import { describe, expect, it } from "vitest";
import { ENEA_OPERATIONAL_BASELINE, ENEA_OPERATIONAL_CHECKLIST, baselineGate } from "./operationalBaseline";
import { ENEA_PREFLIGHT_STEPS } from "./preflightContract";

describe("enea-operational-baseline-v1", () => {
  it("preserva verdi tutti i pilot completati senza usare benchmark storico", () => {
    const pilots=ENEA_OPERATIONAL_BASELINE.slice(0,5);
    expect(pilots.every(item=>item.status==="green" && !item.reason.toLowerCase().includes("pdf storico"))).toBe(true);
    expect(baselineGate().allowed).toBe(true);
  });
  it("non trasforma policy autorizzate in ticket", () => {
    for(const scenario of ENEA_OPERATIONAL_BASELINE) expect(scenario.fields.every(field=>field.status==="resolved")).toBe(true);
  });
  it("espone una sola checklist stabile degli otto step dati", () => {
    expect(ENEA_OPERATIONAL_CHECKLIST).toHaveLength(8);
    expect(ENEA_OPERATIONAL_CHECKLIST.map(item=>item.step)).toEqual(ENEA_PREFLIGHT_STEPS);
    expect(new Set(ENEA_OPERATIONAL_CHECKLIST.map(item=>item.step)).size).toBe(8);
    expect(ENEA_OPERATIONAL_CHECKLIST.every(item=>item.rule.includes("policy consolidata"))).toBe(true);
  });
  it("blocca il gate se un caso già verde degrada", () => {
    const degraded=ENEA_OPERATIONAL_BASELINE.map((item,index)=>index?item:{...item,fields:[{...item.fields[0],status:"blocked" as const}]});
    expect(baselineGate(degraded)).toMatchObject({allowed:false,regressions:[{id:"costigliolo"}]});
  });
});
