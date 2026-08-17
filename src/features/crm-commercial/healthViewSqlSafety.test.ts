import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const healthViewSql = readFileSync(
  new URL("../../../supabase/migrations/20260811000100_crm_commercial_health_view.sql", import.meta.url),
  "utf8",
);

describe("commercial health SQL safety", () => {
  it("mantiene nello storico commerciale anche le pratiche auto-archiviate", () => {
    expect(healthViewSql).toContain("LEFT JOIN public.enea_practices p");
    expect(healthViewSql).not.toMatch(
      /LEFT JOIN public\.enea_practices p[\s\S]{0,220}p\.archived_at IS NULL/,
    );
  });
});
