import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadViewSql = readFileSync(
  new URL("../../../supabase/migrations/20260811000101_crm_lead_attention_view.sql", import.meta.url),
  "utf8",
);

describe("commercial lead attention SQL safety", () => {
  it("non attribuisce automaticamente follow-up a fasi CRM personalizzate", () => {
    expect(leadViewSql).toMatch(
      /stage_id NOT IN \('lead', 'contatto', 'demo', 'onboarding', 'attivo'\)[\s\S]{0,180}'needs_stage_review'/,
    );
    expect(leadViewSql).toMatch(/WHEN attention_status = 'needs_stage_review' THEN 70/);
  });
});
