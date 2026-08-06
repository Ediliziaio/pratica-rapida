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

function fieldById(mapped: EneaLabMappedPractice, fieldId: string) {
  return mapped.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId);
}

function manuallyVerified(mapped: EneaLabMappedPractice, fieldId: string): boolean {
  const field = fieldById(mapped, fieldId);
  return field?.status === "ready" && field.source === "Inserimento operatore";
}

function allManualScreeningEssentialsReady(mapped: EneaLabMappedPractice): boolean {
  const fields = mapped.sections.flatMap((section) => section.fields);
  const dimensions = fields.filter((field) => /^schermature\.\d+\.dimensioni$/.test(field.id));
  if (!dimensions.length) return false;
  return dimensions.every((dimension) => {
    const prefix = dimension.id.replace(/\.dimensioni$/, "");
    return ["dimensioni", "superficie", "gtot"].every((suffix) =>
      fieldById(mapped, `${prefix}.${suffix}`)?.status === "ready",
    );
  });
}

function documentBlockerResolution(
  message: string,
  mapped: EneaLabMappedPractice,
): { resolved: boolean; fieldId: string } {
  if (/Nessuna riga di schermatura/i.test(message)) {
    return {
      resolved: allManualScreeningEssentialsReady(mapped),
      fieldId: "schermature.0.dimensioni",
    };
  }
  if (/totale di almeno un documento/i.test(message)) {
    return {
      resolved: manuallyVerified(mapped, "schermature.spesa"),
      fieldId: "schermature.spesa",
    };
  }
  if (/documento fiscale duplicato|note di credito superano/i.test(message)) {
    return {
      resolved: manuallyVerified(mapped, "schermature.spesa")
        && fieldById(mapped, "documenti.fatture")?.status === "ready",
      fieldId: "schermature.spesa",
    };
  }
  if (/documento deve essere letto|documento non è stato riconosciuto/i.test(message)) {
    return {
      resolved: fieldById(mapped, "documenti.fatture")?.status === "ready",
      fieldId: "documenti.fatture",
    };
  }
  return { resolved: false, fieldId: "documenti.fatture" };
}

function parseFieldDate(value: string): Date | null {
  const italian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = italian
    ? [Number(italian[3]), Number(italian[2]), Number(italian[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const result = new Date(Date.UTC(year, month - 1, day, 12));
  return result.getUTCFullYear() === year
    && result.getUTCMonth() === month - 1
    && result.getUTCDate() === day
    ? result
    : null;
}

function portalValue(fieldId: string, value: string): string {
  const trimmed = value.trim();
  const numericUnit = /(?:€|m²|kW|kWh\/anno|%)\s*$/i;
  if (!numericUnit.test(trimmed)) return trimmed;
  const withoutUnit = trimmed.replace(numericUnit, "").trim();
  return fieldId === "schermature.spesa" || fieldId === "schermature.spese_professionali"
    ? withoutUnit.replace(/\.(?=\d{3}(?:\D|$))/g, "")
    : withoutUnit;
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
    const screeningCount = fieldById(mapped, "schermature.numero");
    if (screeningCount?.source !== "Inserimento operatore" || !allManualScreeningEssentialsReady(mapped)) {
      issues.push({
        code: "screening-list-empty",
        severity: "blocker",
        message: "Il modulo cliente non contiene l'elenco delle schermature.",
        fieldId: "schermature.numero",
      });
    }
  }

  if (analysis) {
    for (const [index, message] of analysis.blockers.entries()) {
      const resolution = documentBlockerResolution(message, mapped);
      if (!resolution.resolved) {
        issues.push({
          code: `document-blocker-${index}`,
          severity: "blocker",
          message,
          fieldId: resolution.fieldId,
        });
      }
    }
    for (const [index, message] of analysis.warnings.entries()) {
      issues.push({ code: `document-warning-${index}`, severity: "warning", message });
    }

    if (productItems.length && analysis.items.length && productItems.length !== analysis.items.length) {
      const screeningCount = fieldById(mapped, "schermature.numero");
      if (screeningCount?.status !== "ready") {
        issues.push({
          code: "screening-count-mismatch",
          severity: "blocker",
          message: `Il modulo indica ${productItems.length} schermature, mentre le fatture ne descrivono ${analysis.items.length}. Verificare l'abbinamento una per una e confermare il numero corretto.`,
          fieldId: "schermature.numero",
        });
      }
    }

    analysis.items.forEach((item, index) => {
      const fieldId = `schermature.${index}.gtot`;
      const mappedGTot = fieldById(mapped, fieldId);
      if (!mappedGTot) return;
      if ((item.gTot === null || item.gTot <= 0 || item.gTot > 0.35) && mappedGTot?.status !== "ready") {
        issues.push({
          code: `invalid-gtot-${index}`,
          severity: "blocker",
          message: `Elemento ${index + 1}: il gTot deve essere documentato e non superiore a 0,35.`,
          fieldId,
        });
      }
    });
  }

  const startField = fieldById(mapped, "intervento.data_inizio");
  const finishField = fieldById(mapped, "intervento.data_fine");
  const startDate = startField?.status === "ready" ? parseFieldDate(startField.value) : null;
  const finishDate = finishField?.status === "ready" ? parseFieldDate(finishField.value) : null;
  if (finishField?.status === "ready" && !finishDate) {
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
  if (startField?.status === "ready" && !startDate) {
    issues.push({
      code: "invalid-start-date",
      severity: "blocker",
      message: "La data di inizio lavori non è valida.",
      fieldId: "intervento.data_inizio",
    });
  }
  if (startDate && finishDate && startDate.getTime() > finishDate.getTime()) {
    issues.push({
      code: "start-after-finish",
      severity: "blocker",
      message: "La data di inizio lavori non può essere successiva alla data di fine lavori.",
      fieldId: "intervento.data_inizio",
    });
  }

  for (const field of requiredFields(mapped)) {
    if (field.status === "ready") continue;
    issues.push({
      code: `${field.status}-${field.id}`,
      severity: "blocker",
      message: field.status === "review"
        ? `${field.label}: controllo operatore da confermare.`
        : `${field.label}: Intervento umano richiesto.`,
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
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const hasUnverifiedRequiredFields = fields.some(
    (field) => field.required && field.status !== "ready",
  );
  const selectedFields = mode === "test"
    ? fields
    : fields.filter((field) => !field.testOnly && field.status === "ready");
  const selectedIds = new Set(selectedFields.map((field) => field.id));
  const portalFields = mapped.sections.flatMap((section) => section.fields
    .filter((field) => selectedIds.has(field.id))
    .map((field) => ({
      id: field.id,
      label: field.label,
      sectionId: section.id,
      sectionTitle: section.title,
      value: portalValue(field.id, field.value),
      source: field.source,
      testOnly: field.testOnly,
    })));

  return {
    schemaVersion: 1,
    mode,
    readyForOfficialSubmission: mode === "official"
      && blockers.length === 0
      && !hasUnverifiedRequiredFields,
    generatedAt: now.toISOString(),
    practiceCode: mapped.source.code,
    fields: Object.fromEntries(selectedFields.map((field) => [field.id, field.value])),
    portalFields,
    excludedTestFields: mode === "official"
      ? fields.filter((field) => field.testOnly).map((field) => field.id)
      : [],
    excludedUnverifiedFields: mode === "official"
      ? fields.filter((field) => !field.testOnly && field.status !== "ready").map((field) => field.id)
      : [],
    interventionRequired: blockers.map((issue) => issue.message),
  };
}

export function fingerprintPreparedPractice(
  mapped: EneaLabMappedPractice,
  issues: EneaLabIssue[],
): string {
  const stable = JSON.stringify({
    practiceCode: mapped.source.code,
    fields: mapped.sections.flatMap((currentSection) =>
      currentSection.fields.map((field) => ({
        id: field.id,
        value: field.value,
        status: field.status,
        testOnly: field.testOnly,
      })),
    ),
    issues: issues.map(({ code, severity, message, fieldId }) => ({ code, severity, message, fieldId })),
  });

  let hash = 2166136261;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
