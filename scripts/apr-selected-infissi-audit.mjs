import { createClient } from "@supabase/supabase-js";
import { buildAprInfissiIntake } from "../src/features/enea-lab/infissiIntake.ts";
import { parseCompletedEneaText } from "../src/features/enea-lab/completedEneaAudit.ts";

const projectRef = process.env.SUPABASE_PROJECT_REF || "xmkjrhwmmuzaqjqlvzxm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const clientHash = process.env.APR_CLIENT_HASH;

if (!accessToken || !clientHash) {
  throw new Error("Configurazione audit APR incompleta.");
}

async function managementRequest(path, init = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase Management API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

const sql = `
  select
    p.id,
    p.prodotto_installato,
    p.dati_form,
    p.fatture_urls,
    p.pratica_enea_conclusa_urls,
    s.stage_type,
    c.ragione_sociale
  from public.enea_practices p
  join public.companies c on c.id = p.reseller_id
  left join public.pipeline_stages s on s.id = p.current_stage_id
  where md5(lower(trim(concat_ws(' ', p.cliente_nome, p.cliente_cognome)))) = '${clientHash}'
    and regexp_replace(lower(c.ragione_sociale), '[^a-z0-9]', '', 'g') not like '%erremme%'
  order by p.updated_at desc nulls last
  limit 2;
`;

const queryResult = await managementRequest("/database/query", {
  method: "POST",
  body: JSON.stringify({ query: sql }),
});
const rows = Array.isArray(queryResult) ? queryResult : (queryResult.result ?? []);
if (rows.length !== 1) {
  throw new Error(`La selezione fail-closed richiede una pratica univoca; trovate: ${rows.length}.`);
}

const row = rows[0];
const product = row.dati_form?.prodotto ?? { tipo: "" };
const invoicePaths = Array.isArray(row.fatture_urls) ? row.fatture_urls : [];
const completedPaths = Array.isArray(row.pratica_enea_conclusa_urls)
  ? row.pratica_enea_conclusa_urls
  : [];
const intake = buildAprInfissiIntake(
  { prodotto: product },
  {
    hasInvoice: invoicePaths.length > 0,
    hasCompletedEneaPdf: completedPaths.length > 0,
  },
);

const apiKeys = await managementRequest("/api-keys");
const serviceRole = (Array.isArray(apiKeys) ? apiKeys : apiKeys.data ?? [])
  .find((key) => key.name === "service_role" || key.type === "service_role")?.api_key;
if (!serviceRole) throw new Error("Chiave read-only audit non disponibile.");

const supabase = createClient(`https://${projectRef}.supabase.co`, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let completedPdfRead = false;
let completedSnapshot = null;
let technicalSignals = [];
const completedPath = completedPaths.find((path) => (
  typeof path === "string"
  && path.startsWith(`${row.id}/`)
  && /\.pdf$/i.test(path)
));

if (completedPath) {
  const { data, error } = await supabase.storage.from("enea-documents").download(completedPath);
  if (error || !data) throw new Error(error?.message ?? "PDF ENEA conclusivo non scaricabile.");
  const pdfPath = "/tmp/apr-selected-completed.pdf";
  const textPath = "/tmp/apr-selected-completed.txt";
  await Bun.write(pdfPath, new Uint8Array(await data.arrayBuffer()));
  const conversion = Bun.spawn(["pdftotext", "-layout", pdfPath, textPath], {
    stdout: "ignore",
    stderr: "pipe",
  });
  if (await conversion.exited !== 0) {
    throw new Error(`Estrazione PDF fallita: ${await new Response(conversion.stderr).text()}`);
  }
  const text = await Bun.file(textPath).text();
  completedPdfRead = true;
  completedSnapshot = parseCompletedEneaText(text);
  technicalSignals = [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => /serrament|infiss|trasmitt|vetro|spesa congrua|risparmio energetico/i.test(line))
      .filter((line) => !/nome:|cognome:|codice fiscale:|indirizzo:|residenza:/i.test(line))
      .map((line) => line.slice(0, 400)),
  )].slice(0, 80);
}

const report = {
  auditMode: "read-only",
  practiceId: row.id,
  erremmeExcluded: true,
  productLabel: row.prodotto_installato,
  stageType: row.stage_type,
  invoiceCount: invoicePaths.length,
  completedEneaPdfCount: completedPaths.length,
  structuredIntakeComplete: intake.structuredIntakeComplete,
  intakeFields: intake.fields,
  blockers: intake.blockers,
  shadowTechnicalMappingAllowed: intake.shadowTechnicalMappingAllowed,
  officialSubmissionAllowed: intake.officialSubmissionAllowed,
  completedPdfRead,
  completedCpidObserved: Boolean(completedSnapshot?.cpid),
  completedCommonFieldIds: Object.keys(completedSnapshot?.fields ?? {}).sort(),
  completedTechnicalSignals: technicalSignals,
  verdict: intake.shadowTechnicalMappingAllowed
    ? "READY_FOR_TECHNICAL_COMPARISON"
    : "BLOCKED_TECHNICAL_ADAPTER_MISSING",
};

await Bun.write("apr-selected-infissi-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  practiceId: report.practiceId,
  verdict: report.verdict,
  completedPdfRead: report.completedPdfRead,
  blockerCount: report.blockers.length,
}));
