import type {
  EneaLabDocumentAnalysis,
  EneaLabIssue,
  EneaLabMappedPractice,
  EneaLabPayload,
  EneaLabSourcePractice,
} from "./types";

function requiredFields(mapped: EneaLabMappedPractice) {
  return mapped.sections.flatMap((section) => section.fields).filter((field) => field.required);
}

export function validatePreparedPractice(
  source: EneaLabSourcePractice,
  mapped: EneaLabMappedPractice,
  analysis?: EneaLabDocumentAnalysis,
): EneaLabIssue[] {
  const issues: EneaLabIssue[] = [];
  const productItems = source.form.prodotto.tipo === "schermature"
    ? source.form.prodotto.items
    : [];

  if (source.queueStatus !== "ready") {
    issues.push({
      code: "client-form-not-ready",
      severity: "blocker",
      message: "Il modulo cliente non risulta ancora inviato.",
    });
  }

  if (!productItems.length) {
    issues.push({
      code: "screening-list-empty",
      severity: "blocker",
      message: "Il modulo cliente non contiene l'elenco delle schermature.",
      fieldId: "schermature.numero",
    });
  }

  if (analysis) {
    for (const [index, message] of analysis.blockers.entries()) {
      issues.push({ code: `document-blocker-${index}`, severity: "blocker", message });
    }
    for (const [index, message] of analysis.warnings.entries()) {
      issues.push({ code: `document-warning-${index}`, severity: "warning", message });
    }

    if (productItems.length && analysis.items.length && productItems.length !== analysis.items.length) {
      issues.push({
        code: "screening-count-mismatch",
        severity: "blocker",
        message: `Il modulo indica ${productItems.length} schermature, mentre le fatture ne descrivono ${analysis.items.length}. Verificare l'abbinamento una per una.`,
        fieldId: "schermature.numero",
      });
    }

    analysis.items.forEach((item, index) => {
      if (item.gTot === null || item.gTot <= 0 || item.gTot > 0.35) {
        issues.push({
          code: `invalid-gtot-${index}`,
          severity: "blocker",
          message: `Elemento ${index + 1}: il gTot deve essere documentato e non superiore a 0,35.`,
          fieldId: `schermature.estratte.${index}.gtot`,
        });
      }
    });
  }

  const finishDate = source.dataFineLavori ? new Date(`${source.dataFineLavori}T12:00:00Z`) : null;
  if (finishDate && Number.isNaN(finishDate.getTime())) {
    issues.push({
      code: "invalid-finish-date",
      severity: "blocker",
      message: "La data di fine lavori non è valida.",
      fieldId: "intervento.data_fine",
    });
  } else if (finishDate && finishDate.getTime() > Date.now()) {
    issues.push({
      code: "future-finish-date",
      severity: "blocker",
      message: "La data di fine lavori è nel futuro.",
      fieldId: "intervento.data_fine",
    });
  }

  for (const field of requiredFields(mapped)) {
    if (field.status !== "missing") continue;
    issues.push({
      code: `missing-${field.id}`,
      severity: "blocker",
      message: `${field.label}: Intervento umano richiesto.`,
      fieldId: field.id,
    });
  }

  return issues.filter((issue, index, all) =>
    all.findIndex((candidate) => candidate.code === issue.code) === index,
  );
}

export function buildEneaPayload(
  mapped: EneaLabMappedPractice,
  issues: EneaLabIssue[],
  mode: "test" | "official",
  now = new Date(),
): EneaLabPayload {
  const fields = mapped.sections.flatMap((section) => section.fields);
  const selectedFields = mode === "test" ? fields : fields.filter((field) => !field.testOnly);

  return {
    schemaVersion: 1,
    mode,
    generatedAt: now.toISOString(),
    practiceCode: mapped.source.code,
    fields: Object.fromEntries(selectedFields.map((field) => [field.id, field.value])),
    excludedTestFields: mode === "official"
      ? fields.filter((field) => field.testOnly).map((field) => field.id)
      : [],
    interventionRequired: issues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => issue.message),
  };
}
