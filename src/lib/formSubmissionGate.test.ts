import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAllDynamicSteps } from "@/components/form-cliente/dynamicValidation";
import type { FormSchema } from "@/types/form-module";

const formSource = readFileSync(
  path.resolve(process.cwd(), "src/pages/FormPubblico.tsx"),
  "utf8",
);
const kanbanSource = readFileSync(
  path.resolve(process.cwd(), "src/pages/KanbanBoard.tsx"),
  "utf8",
);
const readyGuardSource = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20261011150600_guard_ready_requires_submitted_form.sql"),
  "utf8",
);

describe("invio del form cliente", () => {
  it("non interpreta l'assenza di pagamento come ritorno dal Catasto", () => {
    expect(formSource).toContain("else if (row.payment_required && isPaymentFlowComplete(row))");
  });

  it("disabilita l'invio se una sezione precedente e' incompleta", () => {
    const schema = {
      steps: [
        { key: "richiedente", label: "Richiedente", fields: [
          { key: "nome", label: "Nome", type: "text", required: true },
        ] },
        { key: "edificio", label: "Edificio", fields: [
          { key: "tipo", label: "Tipo", type: "text", required: true },
        ] },
      ],
    } as FormSchema;
    const errors = validateAllDynamicSteps(schema, { edificio: { tipo: "esistente" } });

    expect(errors).toHaveProperty("richiedente.nome");
    expect(formSource).toContain("validateAllDynamicSteps(effectiveDynamicSchema ?? dbModule.schema, dynamicData)");
    expect(formSource).toContain("disabled={submitting || uploading || navigating || submitDisabledByMissingData}");
    expect(formSource).toContain("Dati obbligatori mancanti: vai alla prima sezione da completare");
  });

  it("rifiuta in CRM una pratica di servizio completo senza form inviato", () => {
    expect(kanbanSource).toContain('newStage?.stage_type === "pronte_da_fare"');
    expect(kanbanSource).toContain('practice.tipo_servizio === "servizio_completo" && !practice.form_compilato_at');
    expect(readyGuardSource).toContain("NEW.tipo_servizio = 'servizio_completo'");
    expect(readyGuardSource).toContain("NEW.form_compilato_at IS NULL");
    expect(readyGuardSource).toContain("stage.stage_type = 'pronte_da_fare'");
  });
});
