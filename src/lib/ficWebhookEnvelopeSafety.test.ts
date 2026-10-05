import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const webhookPath = path.resolve(process.cwd(), "supabase/functions/fic-webhook/index.ts");
const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20261005140000_recover_fic_email_sent_ids.sql",
);
const finalizerPath = path.resolve(
  process.cwd(),
  "supabase/functions/_shared/finalize-cf-payment.ts",
);

describe("Fatture in Cloud email webhook safety", () => {
  it("reads resource ids from both structured and binary CloudEvent envelopes", () => {
    const source = fs.readFileSync(webhookPath, "utf8");
    expect(source).toContain("function resourceIds(data: JsonObject)");
    expect(source).toContain("Array.isArray(data.ids)");
    expect(source).toContain("Array.isArray((nested as JsonObject).ids)");
    expect(source).toContain("const ids = resourceIds(event.data)");
  });

  it("backfills already delivered invoice emails without resending them", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("payload -> 'data' -> 'ids'");
    expect(sql).toContain("customer_emailed_at = COALESCE");
    expect(sql).toContain("payment.status = 'sdi_pending'");
    expect(sql).not.toContain("scheduleDocumentEmail");
  });

  it("can recover a delivered email from recorded webhook evidence", () => {
    const source = fs.readFileSync(finalizerPath, "utf8");
    expect(source).toContain("async function recoverRecordedInvoiceEmail");
    expect(source).toContain("invoices.email_sent");
    expect(source).toContain("Number(id) === invoiceId");
    expect(source).toContain("customerEmailedAt = await recoverRecordedInvoiceEmail");
    expect(source).toContain("if (!customerEmailedAt)");
  });
});
