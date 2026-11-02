import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020120000_business_lead_nurture.sql"),
  "utf8",
);
const processor = readFileSync(
  resolve(process.cwd(), "supabase/functions/process-lead-nurture/index.ts"),
  "utf8",
);
const emailSender = readFileSync(
  resolve(process.cwd(), "supabase/functions/send-email/index.ts"),
  "utf8",
);
const cronAuthMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261102183500_authenticate_clienti_50_nurture_cron.sql"),
  "utf8",
);

describe("lead nurture safety gates", () => {
  it("is installed disabled until the owner approves the final messages", () => {
    expect(migration).toContain("'{\"enabled\":false,\"duration_days\":60}'");
    expect(processor).toContain('reason: "disabled"');
  });

  it("is restricted to Clienti €50 and stops on archive or pipeline exit", () => {
    expect(migration).toContain("NEW.stage_id <> 'clienti_50'");
    expect(migration).toContain("NEW.archived_at IS NOT NULL");
    expect(migration).toContain("l.stage_id = 'clienti_50'");
    expect(migration).toContain("recipient_opt_out");
    expect(processor).toContain('current?.stage_id === "clienti_50"');
  });

  it("uses the €50 reseller price and contains no legacy €65 offer", () => {
    expect(processor).toContain("50 € + IVA");
    expect(processor).toContain("riservat");
    expect(processor).not.toMatch(/65\s*€|€\s*65/);
  });

  it("enforces the permanent WhatsApp time windows", () => {
    expect(processor).toContain('if (day === "Sun") return false');
    expect(processor).toContain('if (day === "Sat") return mins >= 510 && mins < 840');
    expect(processor).toContain("return mins >= 510 && mins < 1320");
  });

  it("checks recipient, duplicate delivery, and controlled content before sending", () => {
    expect(processor).toContain("const recipientOk");
    expect(processor).toContain("const { data: alreadySent = [] }");
    expect(processor).toContain("const contentOk");
  });

  it("authenticates the database clock with a service-role-only RPC", () => {
    expect(processor).toContain("authorizedCronRequest");
    expect(processor).toContain('verifier.rpc("authenticate_lead_nurture_cron")');
    expect(cronAuthMigration).toContain("GRANT EXECUTE ON FUNCTION public.authenticate_lead_nurture_cron() TO service_role");
    expect(cronAuthMigration).toContain("REVOKE ALL ON FUNCTION public.authenticate_lead_nurture_cron() FROM PUBLIC");
  });

  it("uses the approved multimedia sequence and the dedicated responsive template", () => {
    expect(processor).toContain('const OFFSETS = [0, 2, 5, 9, 14, 21, 25, 29, 45, 60]');
    expect(processor).toContain('template: "lead_nurture"');
    expect(processor).toContain('portale-demo-breve.gif');
    expect(processor).toContain('Pratica_Rapida_Servizi_e_prezzi_2026.pdf');
    expect(processor).toContain('attachments: [step.attachment]');
    expect(emailSender).toContain('case "lead_nurture"');
    expect(emailSender).toContain('@media only screen and (max-width:620px)');
  });

  it("only sends expiring-promotion messages inside the real 30-day window", () => {
    expect(migration).toContain("promotion_expires_at timestamptz");
    expect(migration).toContain("now() + interval '30 days'");
    expect(processor).toContain("promotionMessageIsTimely");
    expect(processor).toContain('error_message: "promotion_window_missed"');
  });

  it("keeps media links and every CTA in the controlled allowlist", () => {
    expect(processor).toContain('const allowed = [APP, SITE, WHATSAPP');
    expect(processor).toContain('return urls.every');
  });
});
