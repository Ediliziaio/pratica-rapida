export interface WhatsappPracticeContextSource {
  id: string;
  code: string;
  stage: string;
  product: string;
  updatedAt: string;
  missingDocuments: string[];
  // Il chiamante può avere molti altri dati sensibili: questa funzione li ignora.
  [key: string]: unknown;
}

export interface WhatsappMinimalCrmContext {
  practiceId: string;
  practiceCode: string;
  stage: string;
  product: string;
  updatedAt: string;
  missingDocuments: string[];
}

/**
 * Data minimisation gate: il modello riceve soltanto ciò che serve per
 * rispondere a stato pratica / documenti mancanti. CF, indirizzi, documenti,
 * URL, importi e altre colonne CRM non vengono propagati per default.
 */
export function buildMinimalWhatsappCrmContext(
  source: WhatsappPracticeContextSource,
): WhatsappMinimalCrmContext {
  return {
    practiceId: source.id,
    practiceCode: source.code,
    stage: source.stage,
    product: source.product,
    updatedAt: source.updatedAt,
    missingDocuments: source.missingDocuments.filter(Boolean).slice(0, 20),
  };
}
