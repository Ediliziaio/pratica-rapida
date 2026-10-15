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

  it("isola il percorso H24 ai soli solleciti di compilazione", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/process-automations/index.ts"),
      "utf8",
    );
    expect(source).toContain('triggerGroup !== "compilation_reminders"');
    expect(source).toContain('rulesQuery.eq("trigger_event", "days_waiting_7")');
    expect(source).toContain('rule.trigger_event !== "days_waiting_7"');
    expect(source).toContain("!compilationOnly &&");
    expect(source).not.toContain("if (compilationOnly && attesaPagamento) continue;");
  });

  it("non esclude i clienti finali non pagati dal sollecito di compilazione H24", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/process-automations/index.ts"),
      "utf8",
    );
    const reminderCase = source.slice(
      source.indexOf('case "days_waiting_7"'),
      source.indexOf('case "days_waiting_fornitore_30"'),
    );

    expect(reminderCase).toContain("const attesaPagamento =\n              !compilationOnly &&");
    expect(reminderCase).toContain('if (!attesaPagamento && rule.channel === "whatsapp"');
    expect(reminderCase).toContain('template_name: (rule as { template_id?: string }).template_id ?? "sollecito_compilazione"');
  });

  it("non applica una fascia oraria ai promemoria Meta H24", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/process-meta-private-followups/index.ts"),
      "utf8",
    );
    expect(source).not.toContain("outside_whatsapp_hours");
    expect(source).not.toContain("isAllowedWhatsAppTime");
  });
});
