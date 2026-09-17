import crypto from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const ROOT = path.resolve("ops/apr-infissi-atzeni-amadu-field-comparison-2026-09-10");
const AUTH_STATE = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const IDS = Object.freeze([
  "dc4484cd-c462-49c0-a734-3064dd6469a8",
  "e94df373-f8f5-44b9-bd31-3e6c36025c13",
]);

function sha256(bytes: Uint8Array | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function atomicWrite(target: string, contents: string | Uint8Array): void {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
}

const auth = new PersistentAprCrmAuth(AUTH_STATE);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,pratica_enea_conclusa_urls",
  or: `(${IDS.map((id) => `id.eq.${id}`).join(",")})`,
  limit: String(IDS.length),
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
if (!response.ok) throw new Error(`crm_historical_metadata_http_${response.status}`);
const rows = await response.json() as Array<{
  id?: unknown;
  cliente_nome?: unknown;
  cliente_cognome?: unknown;
  pratica_enea_conclusa_urls?: unknown;
}>;
if (!Array.isArray(rows) || rows.length !== IDS.length) throw new Error("crm_historical_metadata_cardinality_mismatch");

const cases = [];
for (const id of IDS) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`crm_historical_metadata_identity_missing:${id}`);
  const paths = Array.isArray(row.pratica_enea_conclusa_urls)
    ? [...new Set(row.pratica_enea_conclusa_urls.filter((item): item is string => typeof item === "string"))]
      .filter((item) => item.startsWith(`${id}/`) && /\.pdf$/iu.test(item))
    : [];
  if (!paths.length) throw new Error(`crm_historical_pdf_missing:${id}`);
  const documents = [];
  for (const [index, objectPath] of paths.entries()) {
    const fileResponse = await auth.readOnlyStorageGet("enea-documents", objectPath);
    if (!fileResponse.ok) throw new Error(`crm_historical_pdf_http_${fileResponse.status}:${id}:${index + 1}`);
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(`crm_historical_pdf_signature_rejected:${id}:${index + 1}`);
    const target = path.join(ROOT, "historical-pdfs", id, `operator-completed-${index + 1}.pdf`);
    atomicWrite(target, bytes);
    documents.push({ objectPath, localPath: target, byteLength: bytes.byteLength, sha256: sha256(bytes) });
  }
  cases.push({
    practiceId: id,
    displayName: `${String(row.cliente_nome ?? "")} ${String(row.cliente_cognome ?? "")}`.trim(),
    documents,
  });
}

const result = {
  version: "apr-atzeni-amadu-historical-inputs-v1",
  generatedAt: new Date().toISOString(),
  readOnly: true,
  crmMethods: ["GET", "HEAD"],
  externalMutationAllowed: false,
  cases,
};
atomicWrite(path.join(ROOT, "historical-inputs.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
