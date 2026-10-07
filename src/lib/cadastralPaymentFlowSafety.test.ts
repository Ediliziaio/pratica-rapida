import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.resolve(process.cwd(), "src/pages/FormPubblico.tsx"),
  "utf8",
);
const createPaymentSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-create-payment/index.ts"),
  "utf8",
);
const finalizerSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/_shared/finalize-cf-payment.ts"),
  "utf8",
);
const webhookSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-webhook/index.ts"),
  "utf8",
);
const kanbanSource = readFileSync(
  path.resolve(process.cwd(), "src/pages/KanbanBoard.tsx"),
  "utf8",
);

describe("pagamento catastale durante la compilazione", () => {
  it("salva la bozza prima di creare il pagamento e non avanza se il salvataggio fallisce", () => {
    const save = formSource.indexOf("const ok = await saveDraft(");
    const gate = formSource.indexOf("if (!ok) return;", save);
    const payment = formSource.indexOf("await startRequiredPayment(true);", gate);

    expect(save).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(save);
    expect(payment).toBeGreaterThan(gate);
  });

  it("consente il pagamento intermedio solo al servizio catastale non-CF", () => {
    expect(createPaymentSource).toContain(
      '!practice.form_compilato_at && (!cadastralService || practice.tipo_fatturazione === "cliente_finale")',
    );
  });

  it("riprende il form dopo il catasto e non lo dichiara concluso", () => {
    expect(formSource).toContain('setCadastralResumeMode("after")');
    expect(formSource).toContain('cadastralResumeMode === "after" ? 1 : 0');
    expect(formSource).toContain("tornerai automaticamente alla compilazione dell'impianto");
  });

  it("non sposta in pronte da fare prima dell'invio completo del modulo", () => {
    expect(finalizerSource).toContain("const formCompleted = Boolean(practice.form_compilato_at)");
    expect(finalizerSource).toContain("...(readyStageId ? { current_stage_id: readyStageId } : {})");
    expect(webhookSource).toContain("if (practice.form_compilato_at)");
    expect(webhookSource).toContain("...(readyStageId ? { current_stage_id: readyStageId } : {})");
  });

  it("invia la fattura all'e-mail già salvata nella bozza intermedia", () => {
    expect(finalizerSource).toContain("const customer = extractBillingIdentity(practice)");
    expect(finalizerSource).toContain("const email = customer.email");
    expect(webhookSource).toContain("const customer = extractBillingIdentity(practice)");
    expect(webhookSource).toContain("const email = customer.email");
  });

  it("distingue nel CRM il catasto richiesto da quello pagato", () => {
    expect(kanbanSource).toContain('"CATASTO · PAGATO"');
    expect(kanbanSource).toContain('"CATASTO · DA PAGARE"');
    expect(kanbanSource).toContain("Pagamento e fattura servizio catastale");
  });
});
