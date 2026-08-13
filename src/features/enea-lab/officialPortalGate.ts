import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import { buildEneaOfficialPortalWorkflowScript, type EneaPortalWorkflowPreparation } from "./portalWorkflow";
import type { EneaLabDocumentAnalysis, EneaLabMappedPractice, EneaLabPayload } from "./types";

export type EneaOfficialPortalGateReason =
  | "package-not-current"
  | "payload-not-official"
  | "official-data-incomplete"
  | "payload-inconsistent";

export type EneaOfficialPortalGate =
  | {
      status: "blocked";
      reason: EneaOfficialPortalGateReason;
      workflow: null;
    }
  | {
      status: "ready";
      reason: null;
      workflow: EneaPortalWorkflowPreparation;
    };

function isInternalPlaceholder(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("it");
  return normalized === "non indicato" || normalized === "intervento umano richiesto";
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  if (normalizedLeft.length !== left.length || normalizedRight.length !== right.length) return false;
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function hasCurrentDocumentAnalysis(
  mapped: EneaLabMappedPractice,
  analysis: EneaLabDocumentAnalysis,
): boolean {
  const expectedInvoicePaths = mapped.source.documentPaths
    .filter(({ kind }) => kind === "invoice")
    .map(({ path }) => path);
  const analyzedInvoicePaths = analysis.documents.map(({ path }) => path);

  // L'analisi usata dal gate deve appartenere esattamente al set di fatture
  // della pratica corrente. Questo impedisce che un risultato ancora in cache,
  // appartenente a un'altra pratica o precedente a una modifica documentale,
  // possa validare il pacchetto ufficiale.
  if (!expectedInvoicePaths.length || !sameStringSet(expectedInvoicePaths, analyzedInvoicePaths)) return false;

  const expectedPathSet = new Set(expectedInvoicePaths);
  if (!analysis.items.every((item) => expectedPathSet.has(item.sourcePath))) return false;

  // Il riepilogo documentale e l'elenco dettagliato devono raccontare la stessa
  // cosa per ogni fattura. Se itemCount dichiara due schermature ma l'array
  // dettagliato ne contiene una sola (o viceversa), il gate non deve poter usare
  // il conteggio più basso e preparare un workflow ufficiale incompleto.
  return analysis.documents.every((document) => {
    if (!Number.isInteger(document.itemCount) || document.itemCount < 0) return false;
    if (document.status !== "parsed" && document.itemCount !== 0) return false;
    const detailedCount = analysis.items.filter((item) => item.sourcePath === document.path).length;
    return detailedCount === document.itemCount;
  });
}

function hasReconciledMissingDocumentScreenings(
  mapped: EneaLabMappedPractice,
  analysis: EneaLabDocumentAnalysis,
): boolean {
  const requiresManualReconciliation = analysis.blockers.some((message) =>
    /Nessuna riga di schermatura/i.test(message),
  );
  if (!requiresManualReconciliation) return true;

  const fields = mapped.sections.flatMap((section) => section.fields);
  const screeningCount = fields.find((field) => field.id === "schermature.numero");
  if (screeningCount?.status !== "ready" || screeningCount.source !== "Inserimento operatore") return false;

  const dimensions = fields.filter((field) => /^schermature\.\d+\.dimensioni$/.test(field.id));
  if (!dimensions.length) return false;

  // Se l'analisi corrente non riconosce alcuna riga tecnica, eventuali valori
  // rimasti nel mapping da un'analisi precedente non possono essere riutilizzati
  // come se fossero ancora documentati. Numero, misure e gTot devono essere stati
  // riconciliati esplicitamente dall'operatore; la superficie può invece essere
  // il calcolo deterministico ottenuto dalle misure manualmente verificate.
  return dimensions.every((dimension) => {
    const prefix = dimension.id.replace(/\.dimensioni$/, "");
    const surface = fields.find((field) => field.id === `${prefix}.superficie`);
    const gTot = fields.find((field) => field.id === `${prefix}.gtot`);
    return dimension.status === "ready"
      && dimension.source === "Inserimento operatore"
      && surface?.status === "ready"
      && gTot?.status === "ready"
      && gTot.source === "Inserimento operatore";
  });
}

function mappedScreeningCount(mapped: EneaLabMappedPractice): number | null {
  const field = mapped.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === "schermature.numero");
  if (!field) return null;
  const parsed = Number(field.value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasNoScreeningUndercount(
  mapped: EneaLabMappedPractice,
  analysis: EneaLabDocumentAnalysis,
): boolean {
  const currentCount = mappedScreeningCount(mapped);
  if (currentCount === null) return false;
  const declaredCount = mapped.source.form.prodotto.tipo === "schermature"
    ? mapped.source.form.prodotto.items.length
    : 0;
  const documentedCount = analysis.items.length;

  // Il numero inserito dall'operatore non deve poter cancellare righe già
  // osservate nel modulo o nelle fatture. Un eventuale vero scarto verso il
  // basso va riconciliato fuori dal percorso automatico, non trasformato in un
  // pacchetto ufficiale apparentemente completo.
  return currentCount >= Math.max(declaredCount, documentedCount);
}

function samePortalFields(
  left: EneaLabPayload["portalFields"],
  right: EneaLabPayload["portalFields"],
): boolean {
  if (left.length !== right.length) return false;
  if (new Set(left.map((field) => field.id)).size !== left.length) return false;

  const expectedById = new Map(right.map((field) => [field.id, field]));
  return left.every((field) => {
    const expected = expectedById.get(field.id);
    return Boolean(expected)
      && field.label === expected?.label
      && field.sectionId === expected?.sectionId
      && field.sectionTitle === expected?.sectionTitle
      && field.value === expected?.value
      && field.source === expected?.source
      && field.testOnly === expected?.testOnly;
  });
}

function hasConsistentOfficialPayload(mapped: EneaLabMappedPractice, payload: EneaLabPayload): boolean {
  if (payload.practiceCode !== mapped.source.code) return false;
  if (!payload.portalFields.length) return false;
  if (payload.portalFields.some((field) => field.testOnly || isInternalPlaceholder(field.value))) return false;

  // Ricostruisce localmente la parte deterministica del payload ufficiale dal
  // mapping corrente. Il gate non deve fidarsi di un JSON copiato, alterato o
  // appartenente a un'altra pratica anche se espone flag di readiness validi.
  const expected = buildEneaPayload(mapped, [], "official", new Date(0));
  return sameStringRecord(payload.fields, expected.fields)
    && samePortalFields(payload.portalFields, expected.portalFields)
    && sameStringSet(payload.excludedTestFields, expected.excludedTestFields)
    && sameStringSet(payload.excludedUnverifiedFields, expected.excludedUnverifiedFields);
}

function positiveExpense(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0;
}

function hasPositiveScreeningSurfaces(mapped: EneaLabMappedPractice): boolean {
  const count = mappedScreeningCount(mapped);
  if (count === null) return false;
  const fields = mapped.sections.flatMap((section) => section.fields);

  for (let index = 0; index < count; index += 1) {
    const surface = fields.find((field) => field.id === `schermature.${index}.superficie`);
    const glazedSurface = fields.find((field) => field.id === `schermature.${index}.superficie_finestrata`);
    if (surface?.status !== "ready" || !positiveExpense(surface.value)) return false;
    if (glazedSurface?.status !== "ready" || !positiveExpense(glazedSurface.value)) return false;
  }

  const totalSurface = fields.find((field) => field.id === "schermature.superficie_totale");
  return totalSurface?.status === "ready" && positiveExpense(totalSurface.value);
}

function hasManuallyVerifiedEligibleExpense(mapped: EneaLabMappedPractice): boolean {
  const expense = mapped.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.spesa");
  return expense?.status === "ready"
    && expense.source === "Inserimento operatore"
    && positiveExpense(expense.value);
}

/**
 * Ultima barriera locale prima del collaudo sul portale reale.
 * Non apre ENEA e non esegue il comando: restituisce il workflow ufficiale
 * soltanto se il pacchetto corrente e il payload ufficiale sono coerenti.
 */
export function prepareEneaOfficialPortalCollaudo(
  mapped: EneaLabMappedPractice,
  payload: EneaLabPayload,
  packageCurrent: boolean,
  analysis?: EneaLabDocumentAnalysis,
): EneaOfficialPortalGate {
  if (!packageCurrent) {
    return { status: "blocked", reason: "package-not-current", workflow: null };
  }
  if (payload.mode !== "official") {
    return { status: "blocked", reason: "payload-not-official", workflow: null };
  }

  // Il workflow ufficiale non può essere preparato senza l'analisi documentale
  // corrente. In particolare, durante un errore o mentre il download/parsing è
  // indisponibile, omettere analysis non deve trasformare l'assenza di blocker
  // in un via libera implicito.
  if (!analysis) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasCurrentDocumentAnalysis(mapped, analysis)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasReconciledMissingDocumentScreenings(mapped, analysis)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasNoScreeningUndercount(mapped, analysis)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }

  // Una schermatura con superficie nulla oppure senza superficie vetrata
  // protetta può risultare formalmente "ready" nei livelli precedenti, ma non
  // descrive un intervento ENEA utilizzabile. L'ultima barriera richiede quindi
  // valori strettamente positivi per ogni elemento e per il totale.
  if (!hasPositiveScreeningSurfaces(mapped)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }

  // L'audit storico ha mostrato che il totale fiscale della fattura può non
  // coincidere con la "spesa congrua sostenuta" effettivamente riportata nel
  // riepilogo ENEA conclusivo. Il totale estratto resta quindi una proposta di
  // lavoro: prima del portale reale la spesa deve essere riscritta/verificata
  // esplicitamente dall'operatore, non soltanto ereditata dal parser. Una spesa
  // nulla non è considerata una verifica sufficiente per una pratica con
  // schermature: il gate resta chiuso finché non c'è un importo positivo.
  if (!hasManuallyVerifiedEligibleExpense(mapped)) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }

  // I flag del payload sono una rappresentazione derivata e non una fonte di
  // verità. Prima del collaudo ricontrolliamo direttamente mapping e analisi
  // documentale correnti: un JSON con readiness manipolata o un blocker emerso
  // dai documenti non deve poter essere escluso dal gate finale.
  const independentBlockers = validatePreparedPractice(mapped.source, mapped, analysis)
    .filter((issue) => issue.severity === "blocker");
  if (
    independentBlockers.length > 0
    || !payload.readyForOfficialSubmission
    || payload.interventionRequired.length > 0
  ) {
    return { status: "blocked", reason: "official-data-incomplete", workflow: null };
  }
  if (!hasConsistentOfficialPayload(mapped, payload)) {
    return { status: "blocked", reason: "payload-inconsistent", workflow: null };
  }

  const workflow = buildEneaOfficialPortalWorkflowScript(mapped);
  return workflow.mode === "official"
    ? { status: "ready", reason: null, workflow }
    : { status: "blocked", reason: "payload-inconsistent", workflow: null };
}
