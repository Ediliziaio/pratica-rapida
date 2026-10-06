import type { FormSchema } from "@/types/form-module";

const INVOICE_FIELD_KEYS = new Set([
  "fattura",
  "fattura_url",
  "fattura_installatore",
  "fattura_lavori",
]);

const REQUIRED_INVOICE_FIELD = {
  key: "fattura_url",
  label: "Fattura dell'installatore",
  type: "upload" as const,
  required: true,
  help_text: "Fattura emessa dall'installatore per i lavori eseguiti (PDF, JPG o PNG, max 20 MB).",
  max_size_mb: 20,
  accept: ["pdf", "jpg", "jpeg", "png"],
};

const FINANCING_FIELD = {
  key: "finanziamento",
  label: "Hai usufruito di un finanziamento per i lavori?",
  type: "radio" as const,
  required: true,
  options: [
    { value: "si", label: "Sì, interamente" },
    { value: "in_parte", label: "Sì, in parte" },
    { value: "no", label: "No" },
  ],
};

const REQUIRED_BANK_TRANSFER_FIELD = {
  key: "bonifico_url",
  label: "Copia del bonifico parlante",
  type: "upload" as const,
  required: true,
  multiple: true,
  help_text: "Carica tutti i bonifici effettuati per la detrazione (PDF, JPG o PNG, max 20 MB ciascuno).",
  max_size_mb: 20,
  accept: ["pdf", "jpg", "jpeg", "png"],
};

function isInvoiceUpload(field: FormSchema["steps"][number]["fields"][number]): boolean {
  return field.type === "upload" && INVOICE_FIELD_KEYS.has(field.key.toLowerCase());
}

/**
 * La fattura viene richiesta al cliente soltanto nelle pratiche CF, cioè
 * quando il costo della pratica è a carico del cliente finale.
 */
export function customerMustUploadInvoice(tipoFatturazione: string | null | undefined): boolean {
  // Fail-safe: nascondiamo la fattura soltanto quando il dato certifica
  // esplicitamente che paga il rivenditore. Le pratiche legacy senza valore
  // non devono finire con un campo nascosto che il backend continua a
  // richiedere.
  return tipoFatturazione !== "rivenditore";
}

/**
 * I moduli dinamici arrivano dal DB: per le pratiche fatturate al rivenditore
 * rimuoviamo esclusivamente il campo fattura, lasciando invariati tutti gli
 * altri documenti e tutte le altre regole dello schema.
 */
export function applyInvoiceRequestPolicy(
  schema: FormSchema,
  requireCustomerInvoice: boolean,
): FormSchema {
  // Alcuni moduli dinamici di produzione contenevano solo la fattura: la
  // pagina iniziale annunciava i bonifici, ma il wizard non li chiedeva mai.
  // Normalizziamo qui tutti i moduli, senza dipendere dalla configurazione DB.
  const sourceSteps = (schema.steps ?? []).map((step) => ({
    ...step,
    fields: [...(step.fields ?? [])],
  }));
  const allFields = sourceSteps.flatMap((step) => step.fields);
  const hasFinancing = allFields.some((field) => field.key.toLowerCase() === "finanziamento");
  const hasBankTransfer = allFields.some((field) =>
    field.type === "upload" && /bonific/i.test(field.key)
  );

  if (!hasFinancing || !hasBankTransfer) {
    let paymentStepIndex = sourceSteps.findIndex((step) =>
      step.fields.some((field) => field.key.toLowerCase() === "finanziamento")
    );
    if (paymentStepIndex < 0) {
      paymentStepIndex = sourceSteps.findIndex((step) =>
        step.fields.some((field) => field.type === "upload" && /bonific/i.test(field.key))
      );
    }
    if (paymentStepIndex < 0) {
      paymentStepIndex = sourceSteps.findIndex((step) => step.key === "documenti");
    }
    if (paymentStepIndex < 0) {
      paymentStepIndex = sourceSteps.findIndex((step) =>
        step.fields.some((field) => isInvoiceUpload(field))
      );
    }
    if (paymentStepIndex < 0) {
      sourceSteps.push({ key: "documenti", label: "Documenti di pagamento", fields: [] });
      paymentStepIndex = sourceSteps.length - 1;
    }

    const paymentStep = sourceSteps[paymentStepIndex];
    const financingPath = `${paymentStep.key}.finanziamento`;
    if (!hasFinancing) paymentStep.fields.unshift(FINANCING_FIELD);
    if (!hasBankTransfer) {
      paymentStep.fields.push({
        ...REQUIRED_BANK_TRANSFER_FIELD,
        visible_if: { path: financingPath, not_equals: "si" },
      });
    }
    if (/fattur/i.test(paymentStep.label)) paymentStep.label = "Documenti di pagamento";
  }

  if (requireCustomerInvoice) {
    let invoiceFieldFound = false;
    const steps = sourceSteps.map((step) => ({
      ...step,
      fields: (step.fields ?? []).map((field) => {
        if (!isInvoiceUpload(field)) return field;
        invoiceFieldFound = true;
        return { ...field, required: true };
      }),
    }));

    if (invoiceFieldFound) return { ...schema, steps };

    const documentStepIndex = steps.findIndex((step) => step.key === "documenti");
    if (documentStepIndex >= 0) {
      steps[documentStepIndex] = {
        ...steps[documentStepIndex],
        fields: [...steps[documentStepIndex].fields, REQUIRED_INVOICE_FIELD],
      };
    } else {
      steps.push({
        key: "documenti",
        label: "Documenti",
        fields: [REQUIRED_INVOICE_FIELD],
      });
    }

    return { ...schema, steps };
  }

  const steps = sourceSteps.map((step) => {
    const originalFields = step.fields ?? [];
    const fields = originalFields.filter((field) => !isInvoiceUpload(field));

    return {
      ...step,
      fields,
      hadFields: originalFields.length > 0,
    };
  });

  return {
    ...schema,
    // Se una sezione era composta soltanto dal caricamento fattura (come il
    // modulo Schermature attivo in produzione), eliminiamo anche la sezione
    // ormai vuota. Le sezioni originariamente vuote restano invariate.
    steps: steps
      .filter((step) => !step.hadFields || step.fields.length > 0)
      .map(({ hadFields: _hadFields, ...step }) => step),
  };
}
