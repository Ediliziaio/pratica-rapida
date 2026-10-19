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
const reopenSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/reopen-cadastral-form/index.ts"),
  "utf8",
);

describe("pagamento catastale al termine della compilazione", () => {
  it("lo step Catasto salva la bozza e prosegue senza aprire il pagamento", () => {
    const goNextStart = formSource.indexOf("const goNext = async () => {");
    const goNextEnd = formSource.indexOf("const goBack = async () => {", goNextStart);
    const goNextSource = formSource.slice(goNextStart, goNextEnd);

    expect(goNextSource).toContain("const ok = await saveDraft(");
    expect(goNextSource).toContain("setStepIndex((i) => Math.min(i + 1, totalSteps - 1));");
    expect(goNextSource).not.toContain("startRequiredPayment");
    expect(goNextSource).not.toContain("shouldStartCadastralCheckout");
  });

  it("crea il pagamento soltanto dopo l'invio finale del form", () => {
    const firstSubmit = formSource.indexOf('supabase.rpc("submit_form_by_token"');
    const firstPayment = formSource.indexOf("await startRequiredPayment(paymentRequired);", firstSubmit);

    expect(firstSubmit).toBeGreaterThan(0);
    expect(firstPayment).toBeGreaterThan(firstSubmit);
    expect(formSource).not.toContain("shouldStartCadastralCheckout");
  });

  it("il servizio di pagamento rifiuta ogni modulo non ancora inviato", () => {
    expect(createPaymentSource).toContain("if (!practice.form_compilato_at) {");
    expect(createPaymentSource).not.toContain(
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

  it("riapre al Catasto senza perdere la bozza e rimuove il metadato al nuovo invio", () => {
    expect(formSource).toContain('shouldReopenAtCadastralStep(row.dati_form)');
    expect(formSource).toContain('setCadastralResumeMode("at")');
    expect(formSource).toContain("withoutWorkflowMetadata(");
    expect(formSource).toContain("normalizeCfCustomerCompletionDate(dynamicData)");
  });

  it("blocca la riapertura se esiste qualsiasi effetto di pagamento o fiscale", () => {
    expect(reopenSource).toContain("Operazione riservata al super amministratore");
    expect(reopenSource).toContain("esiste già un pagamento o un effetto fiscale da verificare");
    expect(reopenSource).toContain('session.payment_status === "paid"');
    expect(reopenSource).toContain("deleteIssuedDocument");
    expect(reopenSource).toContain('recupero_richiesto: false');
  });

  it("espone nel CRM un comando esplicito e non automatico", () => {
    expect(kanbanSource).toContain("Riapri senza servizio Catasto");
    expect(kanbanSource).toContain('window.confirm(');
    expect(kanbanSource).toContain('functions.invoke("reopen-cadastral-form"');
  });
});
