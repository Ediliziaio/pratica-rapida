#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const baselineAt = "2026-09-02T06:57:46.749Z";
const authRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const auth = new PersistentAprCrmAuth(authRoot);
const config = JSON.parse(readFileSync(path.join(authRoot, "crm-auth", "public-auth-config.json"), "utf8"));
auth.configure(config.supabaseOrigin, config.publishableKey);
await auth.maintainSession();

const stages = [
  { key: "archiviate", name: "Archiviate", type: "archiviate" },
  { key: "gestionale", name: "Da inserire su Excel", type: "gestionale" },
  { key: "recensione", name: "Recensione", type: "recensione" },
] as const;

const results: Record<string, unknown> = {};
for (const stage of stages) {
  const params = new URLSearchParams({
    select: "id,cliente_nome,cliente_cognome,created_at,pipeline_stages!inner(name,stage_type)",
    brand: "eq.enea",
    created_at: `gt.${baselineAt}`,
    "pipeline_stages.stage_type": `eq.${stage.type}`,
    order: "created_at.asc",
    limit: "1000",
  });
  const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
  const body = await response.text();
  if (!response.ok) throw new Error(`crm_http_${response.status}:${sha256(body)}`);
  const rows = (JSON.parse(body) as Array<Record<string, unknown>>).filter((row) => {
    if (stage.type !== "gestionale") return true;
    const relation = Array.isArray(row.pipeline_stages) ? row.pipeline_stages[0] : row.pipeline_stages;
    return relation && typeof relation === "object" && String((relation as Record<string, unknown>).name ?? "").trim() === stage.name;
  });
  results[stage.key] = {
    stageName: stage.name,
    count: rows.length,
    responseSha256: sha256(body),
    cases: rows.map((row) => ({
      practiceId: row.id,
      displayName: `${String(row.cliente_nome ?? "").trim()} ${String(row.cliente_cognome ?? "").trim()}`.trim(),
      createdAt: row.created_at,
    })),
  };
}

process.stdout.write(`${JSON.stringify({
  version: "apr-crm-new-practices-readonly-v1",
  observedAt: new Date().toISOString(),
  baselineAt,
  endpoint: "/rest/v1/enea_practices_public",
  method: "GET",
  mutationAllowed: false,
  stages: results,
}, null, 2)}\n`);
