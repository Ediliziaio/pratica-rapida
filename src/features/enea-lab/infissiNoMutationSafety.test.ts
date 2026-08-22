import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const READ_ONLY_MODULES = [
  "./readOnlyInfissiSource.ts",
  "./infissiReadOnlyDocuments.ts",
  "./infissiTargetSession.ts",
] as const;

const FORBIDDEN_SUPABASE_MUTATIONS = [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /\.rpc\s*\(/,
  /\.upload\s*\(/,
  /\.remove\s*\(/,
] as const;

describe("APR infissi CRM read-only safety", () => {
  for (const relativePath of READ_ONLY_MODULES) {
    it(`${relativePath} non contiene primitive Supabase di scrittura`, () => {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
      for (const forbidden of FORBIDDEN_SUPABASE_MUTATIONS) {
        expect(source).not.toMatch(forbidden);
      }
    });
  }
});
