import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPILATION_REMINDER_STAGE_TYPES,
  isCompletedDeliveryCommunication,
} from "../../supabase/functions/_shared/reminder-safety";

describe("compilation reminder delivery safety", () => {
  it("consente il sollecito soltanto nelle due colonne di attesa", () => {
    expect(COMPILATION_REMINDER_STAGE_TYPES).toEqual(["inviata", "attesa_compilazione"]);
    expect(COMPILATION_REMINDER_STAGE_TYPES).not.toContain("gestionale");
    expect(COMPILATION_REMINDER_STAGE_TYPES).not.toContain("recensione");
    expect(COMPILATION_REMINDER_STAGE_TYPES).not.toContain("archiviate");
  });

  it("riconosce una consegna riuscita dai log email e WhatsApp", () => {
    expect(isCompletedDeliveryCommunication({
      status: "sent",
      metadata: { template: "pratica_inviata" },
    })).toBe(true);
    expect(isCompletedDeliveryCommunication({
      status: "read",
      body_preview: "[invio_avvenuto_recensione] Mario | mario@example.com",
    })).toBe(true);
    expect(isCompletedDeliveryCommunication({
      status: "failed",
      metadata: { template: "pratica_inviata" },
    })).toBe(false);
    expect(isCompletedDeliveryCommunication({
      status: "read",
      body_preview: "[sollecito_compilazione] Mario | https://example.com",
    })).toBe(false);
  });

  it("mantiene entrambe le barriere nel percorso che invia davvero", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/process-automations/index.ts"),
      "utf8",
    );
    expect(source).toContain('.in("current_stage_id", idColonneSollecito)');
    expect(source).toContain('.from("cruscotto_pratiche_da_crm")');
    expect(source).toContain("isCompletedDeliveryCommunication");
    expect(source).toContain("if (completedPracticeIds.has(String(p.id))) continue;");
  });
});
