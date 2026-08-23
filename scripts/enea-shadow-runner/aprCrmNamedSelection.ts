import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";

export const APR_CRM_NAMED_SELECTION_VERSION = "apr-crm-named-selection-v1" as const;
const RULE_IDS = ["system-apr-independent-runtime", "system-apr-crm-readonly-adapter-contract", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume"];

export interface AprCrmNamedSelectionRequest {
  version: typeof APR_CRM_NAMED_SELECTION_VERSION;
  authorizationId: string;
  selections: ReadonlyArray<{ displayName: string; expectedStageType: string }>;
}

interface CrmRow {
  id?: unknown;
  cliente_nome?: unknown;
  cliente_cognome?: unknown;
  prodotto_installato?: unknown;
  updated_at?: unknown;
  pipeline_stages?: unknown;
}

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
const customerKey = (value: string) => normalize(value).replace(/\s+/g, "-");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stageTypes = (value: unknown): string[] => {
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return entries.flatMap((entry) => entry && typeof entry === "object" && typeof (entry as { stage_type?: unknown }).stage_type === "string" ? [(entry as { stage_type: string }).stage_type] : []);
};

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function resolveNamedCrmSelection(rows: CrmRow[], request: AprCrmNamedSelectionRequest) {
  if (request.version !== APR_CRM_NAMED_SELECTION_VERSION || !/^[a-z0-9][a-z0-9._:-]{7,255}$/.test(request.authorizationId)) throw new Error("apr_crm_named_selection_authorization_invalid");
  if (request.selections.length < 2 || request.selections.length > 10) throw new Error("apr_crm_named_selection_size_invalid");
  const wantedNames = request.selections.map((item) => normalize(item.displayName));
  if (new Set(wantedNames).size !== wantedNames.length || wantedNames.includes("beatrice ciotta")) throw new Error("apr_crm_named_selection_identity_invalid");
  return request.selections.map((selection) => {
    const expectedName = normalize(selection.displayName);
    const expectedStage = normalize(selection.expectedStageType).replace(/\s+/g, "_");
    const matches = rows.filter((row) => {
      const displayName = `${typeof row.cliente_nome === "string" ? row.cliente_nome : ""} ${typeof row.cliente_cognome === "string" ? row.cliente_cognome : ""}`.trim();
      return normalize(displayName) === expectedName && stageTypes(row.pipeline_stages).some((stage) => normalize(stage).replace(/\s+/g, "_") === expectedStage);
    });
    if (matches.length !== 1) throw new Error(`apr_crm_named_selection_match_count:${customerKey(selection.displayName)}:${matches.length}`);
    const row = matches[0];
    const practiceId = typeof row.id === "string" ? row.id : "";
    if (!/^[a-f0-9-]{36}$/i.test(practiceId)) throw new Error(`apr_crm_named_selection_practice_invalid:${customerKey(selection.displayName)}`);
    const displayName = `${row.cliente_nome} ${row.cliente_cognome}`.trim().replace(/\s+/g, " ");
    return { customerKey: customerKey(displayName), displayName, practiceId, stageType: expectedStage, productEvidence: typeof row.prodotto_installato === "string" ? row.prodotto_installato.trim().slice(0, 240) : "", updatedAt: typeof row.updated_at === "string" ? row.updated_at : null };
  });
}

export class PersistentAprCrmNamedSelection {
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string, readonly transport: AprCrmReadOnlyTransport) { this.checkpointPath = path.join(path.resolve(rootDirectory), "crm-named-selection", "checkpoint.json"); }

  async discover(request: AprCrmNamedSelectionRequest, now = new Date()) {
    const params = new URLSearchParams({ select: "id,cliente_nome,cliente_cognome,prodotto_installato,updated_at,pipeline_stages!inner(stage_type)", brand: "eq.enea", order: "updated_at.desc", limit: "1000" });
    const response = await this.transport.readOnlyGet("/rest/v1/enea_practices_public", params, now);
    const body = await response.text(); const responseSha256 = sha256(body);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`apr_crm_named_selection_http_${response.status}:${responseSha256}`);
    const parsed = JSON.parse(body) as CrmRow[];
    if (!Array.isArray(parsed)) throw new Error(`apr_crm_named_selection_response_invalid:${responseSha256}`);
    const selected = resolveNamedCrmSelection(parsed, request);
    const checkpoint = { version: APR_CRM_NAMED_SELECTION_VERSION, revision: 1, status: "selected", authorizationId: request.authorizationId, selected, responseSha256, sourceEvidenceId: `crm-named-selection-${sha256(`${responseSha256}:${request.authorizationId}`).slice(0, 20)}`, externalActionAllowed: false, mutationAllowed: false, observedAt: now.toISOString(), reason: `${selected.length} pratiche nominate verificate nel CRM con GET autenticato e pipeline concordante.`, nextAction: "Congelare una nuova coorte APR senza modificare il CRM.", audit: [{ at: now.toISOString(), type: "named_selection_completed", reason: "Identità e pipeline verificate in sola lettura.", appliedRuleIds: [...RULE_IDS] }] } as const;
    atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }
}
