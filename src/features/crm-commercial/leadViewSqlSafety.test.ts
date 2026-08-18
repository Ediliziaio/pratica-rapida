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
    expect(leadViewSql).toMatch(
      /stage_id NOT IN \('lead', 'contatto', 'demo', 'onboarding', 'attivo'\)[\s\S]{0,80}THEN 70/,
    );
  });

  it("porta in revisione una cronologia temporale impossibile", () => {
    expect(leadViewSql).toContain("l.created_at > now()");
    expect(leadViewSql).toContain("l.contacted_at > now()");
    expect(leadViewSql).toContain("l.contacted_at < l.created_at");
    expect(leadViewSql).toContain("'needs_data_review'");
    expect((leadViewSql.match(/l\.created_at > now\(\)/g) ?? [])).toHaveLength(2);
  });
});
