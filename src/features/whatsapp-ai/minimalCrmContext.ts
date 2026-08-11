export interface WhatsappPracticeContextSource {
  id: string;
  // Il CRM ENEA attuale non espone un codice pratica dedicato: quando assente
  // non va inventato né derivato da dati sensibili.
  code?: string | null;
  stage: string | null;
  product: string | null;
  updatedAt: string | null;
  missingDocuments: string[];
  // Il chiamante può avere molti altri dati sensibili: questa funzione li ignora.
  [key: string]: unknown;
}

export interface WhatsappMinimalCrmContext {
  practiceId: string;
  practiceCode: string | null;
  stage: string | null;
  product: string | null;
  updatedAt: string | null;
  missingDocuments: string[];
}

/**
 * Data minimisation gate: il modello riceve soltanto ciò che serve per
 * rispondere a stato pratica / documenti mancanti. CF, indirizzi, documenti,
 * URL, importi e altre colonne CRM non vengono propagati per default.
 *
 * I valori assenti restano null: il laboratorio non deve inventare un codice,
 * uno stato o un prodotto che il CRM reale non contiene.
 */
export function buildMinimalWhatsappCrmContext(
  source: WhatsappPracticeContextSource,
): WhatsappMinimalCrmContext {
  return {
    practiceId: source.id,
    practiceCode: source.code ?? null,
    stage: source.stage,
    product: source.product,
    updatedAt: source.updatedAt,
    missingDocuments: source.missingDocuments.filter(Boolean).slice(0, 20),
  };
}
