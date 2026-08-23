import { describe, expect, it } from "vitest";
import { APR_CRM_NAMED_SELECTION_VERSION, resolveNamedCrmSelection } from "./aprCrmNamedSelection";

const request = { version: APR_CRM_NAMED_SELECTION_VERSION, authorizationId: "user-two-case-batch-2026-08-17", selections: [{ displayName: "Luciano Javier Martinez", expectedStageType: "pronte_da_fare" }, { displayName: "Mario D'Errico", expectedStageType: "recensione" }] } as const;
const rows = [
  { id: "468069ad-6665-48c6-86ca-09d9b98dc133", cliente_nome: "Luciano Javier", cliente_cognome: "Martinez", pipeline_stages: [{ stage_type: "pronte_da_fare" }] },
  { id: "12345678-1234-1234-1234-123456789abc", cliente_nome: "Mario", cliente_cognome: "D'Errico", pipeline_stages: { stage_type: "recensione" } },
];

describe("selezione nominativa CRM read-only", () => {
  it("verifica identità e pipeline senza mutazioni", () => {
    expect(resolveNamedCrmSelection(rows, request)).toMatchObject([{ customerKey: "luciano-javier-martinez", stageType: "pronte_da_fare" }, { customerKey: "mario-d-errico", stageType: "recensione" }]);
  });
  it("rifiuta pipeline diversa, duplicati e Beatrice", () => {
    expect(() => resolveNamedCrmSelection(rows, { ...request, selections: [{ displayName: "Mario D'Errico", expectedStageType: "archiviate" }, request.selections[0]] })).toThrow("apr_crm_named_selection_match_count:mario-d-errico:0");
    expect(() => resolveNamedCrmSelection(rows, { ...request, selections: [request.selections[0], request.selections[0]] })).toThrow("apr_crm_named_selection_identity_invalid");
    expect(() => resolveNamedCrmSelection(rows, { ...request, selections: [{ displayName: "Beatrice Ciotta", expectedStageType: "pronte_da_fare" }, request.selections[0]] })).toThrow("apr_crm_named_selection_identity_invalid");
  });
});
