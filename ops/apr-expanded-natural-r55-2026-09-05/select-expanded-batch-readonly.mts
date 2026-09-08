#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const operationDir = path.join(sourceRoot, "ops/apr-expanded-natural-r55-2026-09-05");
const authRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const seed = "apr-expanded-natural-r55-2026-09-05";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const normalized = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const keyOf = (value: string) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const one = (value: any) => Array.isArray(value) ? value[0] ?? null : value && typeof value === "object" ? value : null;
const moduleOf = (value: unknown) => /(?:infiss|serrament|finestre?\b)/i.test(String(value ?? "")) ? "infissi" : /(?:schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/i.test(String(value ?? "")) ? "screening" : null;
const complexityOf = (count: number) => count <= 1 ? "simple" : count <= 3 ? "medium" : "complex";
const excludedNames = new Set(["beatrice-ciotta", "samuele-beretta", "prova-rivenditore-1-30-04"]);
const vendorExcluded = (value: string) => {
  const v = normalized(value).replace(/[^a-z0-9]/g, "");
  return v.includes("vans") || v.includes("erremme") || v.includes("rmlegno") || v.includes("overthemol");
};

const prior = JSON.parse(readFileSync(path.join(sourceRoot, "ops/apr-natural-autonomy12-r52-2026-09-04/manifest.json"), "utf8"));
const priorIds = new Set(prior.cases.map((item: any) => item.practiceId));
const auth = new PersistentAprCrmAuth(authRoot);
const config = JSON.parse(readFileSync(path.join(authRoot, "crm-auth/public-auth-config.json"), "utf8"));
auth.configure(config.supabaseOrigin, config.publishableKey);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fatture_urls,created_at,updated_at,fornitore,pipeline_stages!inner(name,stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  "pipeline_stages.stage_type": "in.(recensione,gestionale)",
  order: "updated_at.desc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const body = await response.text();
if (!response.ok) throw new Error(`crm_http_${response.status}:${sha256(body)}`);
const rows = JSON.parse(body);
if (!Array.isArray(rows)) throw new Error("crm_response_invalid");

const candidates: any[] = [];
const exclusions: any[] = [];
for (const row of rows) {
  const relation = one(row.pipeline_stages);
  const type = normalized(relation?.stage_type).replace(/\s+/g, "_");
  const stageName = String(relation?.name ?? "").trim();
  if (type !== "recensione" && !(type === "gestionale" && normalized(stageName) === "da inserire su excel")) continue;
  const displayName = `${String(row.cliente_nome ?? "").trim()} ${String(row.cliente_cognome ?? "").trim()}`.trim().replace(/\s+/g, " ");
  const customerKey = keyOf(displayName);
  const reseller = String(one(row.companies)?.ragione_sociale ?? row.fornitore ?? "").trim();
  const module = moduleOf(row.prodotto_installato);
  const reason = excludedNames.has(customerKey) ? "permanent_customer_exclusion" : vendorExcluded(reseller) ? "permanent_vendor_exclusion" : !module ? "not_infissi_or_screening" : null;
  const base = { practiceId: row.id, customerKey, displayName, stage: type, stageName, module, productEvidence: String(row.prodotto_installato ?? "").trim(), reseller, invoiceCount: Array.isArray(row.fatture_urls) ? row.fatture_urls.length : 0, createdAt: row.created_at, updatedAt: row.updated_at };
  if (reason) exclusions.push({ ...base, exclusionReason: reason }); else candidates.push({ ...base, complexity: complexityOf(base.invoiceCount), generationMode: "fresh_generation" });
}

const reviewPool = candidates.filter((item) => item.stage === "recensione" && !priorIds.has(item.practiceId));
const review = [...reviewPool].sort((a, b) => sha256(`${seed}:review:${a.practiceId}`).localeCompare(sha256(`${seed}:review:${b.practiceId}`))).slice(0, 10);
if (review.length !== 10) throw new Error(`review_pool_insufficient:${review.length}`);
const excel = candidates.filter((item) => item.stage === "gestionale");
const selectedNew = [...review, ...excel].sort((a, b) => sha256(`${seed}:queue:${a.practiceId}`).localeCompare(sha256(`${seed}:queue:${b.practiceId}`)));
const priorCases = prior.cases.map((item: any) => ({ ...item, generationMode: "fresh_generation", cohort: 0 }));
const all = [...priorCases, ...selectedNew].map((item, index) => ({ ...item, cohort: 3100 + index }));
const observedAt = new Date().toISOString();
const evidence = {
  version: "apr-expanded-natural-r55-selection-evidence-v1", observedAt, seed, responseSha256: sha256(body), returnedRows: rows.length,
  method: "GET-only CRM selection; the ten Recensione cases are SHA-256 seeded from the current eligible pool after excluding the prior 12; every eligible Infissi/Schermature case in Da inserire su Excel is included",
  counts: { priorTwelve: priorCases.length, reviewEligiblePool: reviewPool.length, reviewSelected: review.length, excelSelected: excel.length, total: all.length },
  exclusions, selectedNew, mutationAllowed: false,
};
const manifest = {
  version: "apr-expanded-natural-r55-manifest-v1", experimentId: "apr-expanded-natural-r55-2026-09-05", authorizationId: "user-2026-09-05-expanded-natural-draft-only",
  authorizedAt: "2026-09-05T00:00:00.000Z", mode: "real_enea_draft_only",
  selection: { total: all.length, allowedStages: ["archiviate", "recensione", "gestionale"], selectionSeed: seed, distribution: evidence.counts, excludedCustomerKeys: [...excludedNames], excludedResellers: ["Vans", "Erre Emme", "RM Legno", "Overthemol"] },
  cases: all,
  executionPolicy: { sequential: true, noMaterialProgressMs: 420000, absolutePerCaseMs: 1500000, isolateAndContinue: true, diagnoseDuringRun: false, repairDuringRun: false },
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, priorDraftPolicy: "fresh_generation_only" },
};
mkdirSync(operationDir, { recursive: true });
writeFileSync(path.join(operationDir, "selection-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(path.join(operationDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ observedAt, counts: evidence.counts, manifestSha256: sha256(JSON.stringify(manifest, null, 2) + "\n"), excludedPermanent: exclusions.filter((item) => item.exclusionReason !== "not_infissi_or_screening").map((item) => ({ displayName: item.displayName, reseller: item.reseller, stageName: item.stageName, reason: item.exclusionReason })) }, null, 2)}\n`);
