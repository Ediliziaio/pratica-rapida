export const AUDITED_OPERATOR_QUEUE_STORAGE_KEY = "enea-shadow-crm:audited-operator-queue:v1";
export const PERSISTENT_OPERATIONAL_QUEUE_VERSION = "enea-operational-queue-v1" as const;

export const OPERATIONAL_QUEUE_STEPS = [
  "form", "identity_property", "dates", "sources_economy", "screenings", "plant", "enea_mapping",
] as const;
export type OperationalQueueStep = typeof OPERATIONAL_QUEUE_STEPS[number];

export interface OperationalQueueAuditEvent {
  id: string;
  at: string;
  type: "checkpoint_migrated" | "checkpoint_reached" | "status_changed" | "block_recorded" | "queue_resumed";
  step: OperationalQueueStep;
  note: string;
}

export type AuditedDocumentClassification = "acconto" | "saldo" | "duplicato" | "altro" | "non_accessibile" | "da_classificare";

export interface AuditedOperatorPractice {
  id: string;
  code: string;
  displayName: string;
  status: "requested_operator" | "economically_verified" | "submitted_manual_exception";
  reason: string;
  documents: ReadonlyArray<{ reference: string; classification: AuditedDocumentClassification; note: string }>;
  communicationsBlocked: true;
  queueVersion: typeof PERSISTENT_OPERATIONAL_QUEUE_VERSION;
  revision: number;
  currentStep: OperationalQueueStep;
  completedSteps: ReadonlyArray<OperationalQueueStep>;
  sources: ReadonlyArray<{ sourceId: string; kind: "form" | "document" | "operator_policy" | "audit"; verification: "verified" | "pending"; note: string }>;
  appliedRules: ReadonlyArray<string>;
  activeBlock: string | null;
  nextAction: string;
  updatedAt: string;
  audit: ReadonlyArray<OperationalQueueAuditEvent>;
}

const INITIAL_QUEUE_AT = "2026-08-14T00:00:00.000Z";

function operationalFields(id: string, reason: string, documents: AuditedOperatorPractice["documents"]) {
  return {
    queueVersion: PERSISTENT_OPERATIONAL_QUEUE_VERSION,
    revision: 1,
    currentStep: "form" as OperationalQueueStep,
    completedSteps: [] as OperationalQueueStep[],
    sources: documents.map((document, index) => ({
      sourceId: `${id}:document:${index + 1}`,
      kind: "document" as const,
      verification: document.classification === "non_accessibile" || document.classification === "da_classificare" ? "pending" as const : "verified" as const,
      note: `${document.reference}: ${document.note}`,
    })),
    appliedRules: [] as string[],
    activeBlock: reason,
    nextAction: reason.includes("Prossima azione:") ? reason.split("Prossima azione:")[1].trim() : "Riprendere dal checkpoint indicato e completare il preflight.",
    updatedAt: INITIAL_QUEUE_AT,
    audit: [{ id: `${id}:audit:1`, at: INITIAL_QUEUE_AT, type: "checkpoint_migrated" as const, step: "form" as OperationalQueueStep, note: "Coda precedente migrata senza perdita di stato o fonti." }],
  };
}

function definePractice(input: Omit<AuditedOperatorPractice, keyof ReturnType<typeof operationalFields>>): AuditedOperatorPractice {
  return { ...input, ...operationalFields(input.id, input.reason, input.documents) };
}

export const DEFAULT_AUDITED_OPERATOR_QUEUE: ReadonlyArray<AuditedOperatorPractice> = Object.freeze([
  definePractice({
    id: "audit-sara-agostinelli", code: "AUDIT-01", displayName: "Sara Agostinelli", status: "requested_operator",
    reason: "Preflight bloccato: nella sessione CRM dedicata le cinque fonti risultano non disponibili e non è stato possibile ripetere la tripla riconciliazione dalle fonti originarie. Nessuna scheda ENEA aperta. Prossima azione: ripristinare un percorso read-only verificabile agli allegati e rieseguire il preflight completo.",
    documents: [
      { reference: "Fattura 1", classification: "acconto", note: "Documento leggibile; importo rilevato nell'audit." },
      { reference: "Fattura 2", classification: "saldo", note: "Documento leggibile con storno dell'acconto." },
      { reference: "Fattura 3", classification: "duplicato", note: "Stessa terna numero + data + totale di Fattura 2; esclusa dal calcolo, mantenuta in audit." },
      { reference: "Fattura 4", classification: "duplicato", note: "Stessa terna numero + data + totale di Fattura 1; esclusa dal calcolo, mantenuta in audit." },
      { reference: "Fattura 5", classification: "altro", note: "Planimetria catastale: documento non economico, escluso senza bloccare." },
    ], communicationsBlocked: true,
  }),
  definePractice({
    id: "audit-samuele-colombo", code: "AUDIT-02", displayName: "Samuele Colombo", status: "requested_operator",
    reason: "Preflight ENEA bloccato esclusivamente su schermature.meccanismo: form e due copie della fattura originaria non indicano motore, arganello o molla. Le policy autorizzate non definiscono un fallback quando la movimentazione è assente. Prossima azione: operatore verifica la movimentazione reale delle tre schermature; nessuna scheda ENEA aperta.",
    documents: [
      { reference: "Fattura 1", classification: "saldo", note: "Terna numero/data/totale lordo verificata; tre righe schermatura con misure e gTot; totale lordo IVA incluso €17.529,60." },
      { reference: "Fattura 2", classification: "duplicato", note: "Copia semanticamente identica della stessa fattura; esclusa dal calcolo e conservata nell'audit." },
    ], communicationsBlocked: true,
  }),
  definePractice({
    id: "audit-patrizia-vaccani", code: "AUDIT-03", displayName: "Patrizia Vaccani", status: "submitted_manual_exception",
    reason: "Invio manuale eccezionale riferito dall'utente; verifica server e CPID ancora pendenti. Non è un successo dell'automazione submit.",
    documents: [{ reference: "Allegati originari", classification: "non_accessibile", note: "Richiesta rilettura della fonte, senza inferenze." }],
    communicationsBlocked: true,
  }),
  definePractice({
    id: "audit-vito-fusillo", code: "AUDIT-04", displayName: "Vito Fusillo", status: "requested_operator",
    reason: "Totale economico già riconciliato dalle fonti originarie acquisite, ma inventario tecnico e preflight ENEA non sono completi e auditati. Nessuna scheda ENEA aperta. Prossima azione: completare fonti tecniche e relative provenienze.",
    documents: [
      { reference: "Fattura 1", classification: "non_accessibile", note: "Collegamento rilevato, contenuto non leggibile." },
      { reference: "Fattura 2", classification: "acconto", note: "Acconto 50% classificato nell'audit." },
      { reference: "Fattura 3", classification: "saldo", note: "Saldo 50% classificato nell'audit." },
    ], communicationsBlocked: true,
  }),
  definePractice({
    id: "audit-zeno-righetti", code: "AUDIT-05", displayName: "Zeno Righetti", status: "requested_operator",
    reason: "Totale economico già riconciliato dalle fatture uniche, ma manca il preflight tecnico ENEA completo con provenienze verificabili. Nessuna scheda ENEA aperta. Prossima azione: completare lo snapshot tecnico.",
    documents: [{ reference: "4 documenti originari", classification: "da_classificare", note: "Classificazione documento per documento richiesta." }],
    communicationsBlocked: true,
  }),
  definePractice({
    id: "audit-matteo-maranesi", code: "AUDIT-06", displayName: "Matteo Maranesi", status: "requested_operator",
    reason: "Verifica economica completata: totale ENEA €9.350,01 come somma dei lordi delle due fatture uniche. Lo storno interno difforme resta auditato e non bloccante. Il preflight tecnico ENEA completo non è però presente: nessuna scheda ENEA aperta; prossima azione completare fonti e provenienze tecniche.",
    documents: [
      { reference: "Fattura 490/26", classification: "acconto", note: "Lordo IVA inclusa €2.800; copia duplicata esclusa e auditata." },
      { reference: "Fattura 814/26", classification: "saldo", note: "Lordo IVA inclusa €6.550,01; copia duplicata esclusa e auditata; storno interno annotato." },
    ],
    communicationsBlocked: true,
  }),
]);

function validQueue(value: unknown): value is AuditedOperatorPractice[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_AUDITED_OPERATOR_QUEUE.length) return false;
  return value.every((item) => item && typeof item === "object"
    && typeof item.id === "string" && typeof item.code === "string" && typeof item.displayName === "string"
    && ["requested_operator", "economically_verified", "submitted_manual_exception"].includes(item.status) && typeof item.reason === "string"
    && item.communicationsBlocked === true && Array.isArray(item.documents)
    && item.queueVersion === PERSISTENT_OPERATIONAL_QUEUE_VERSION && Number.isInteger(item.revision)
    && OPERATIONAL_QUEUE_STEPS.includes(item.currentStep) && Array.isArray(item.completedSteps)
    && Array.isArray(item.sources) && Array.isArray(item.appliedRules) && Array.isArray(item.audit)
    && (typeof item.activeBlock === "string" || item.activeBlock === null)
    && typeof item.nextAction === "string" && typeof item.updatedAt === "string");
}

function migrateLegacyQueue(value: unknown): AuditedOperatorPractice[] | null {
  if (!Array.isArray(value) || value.length !== DEFAULT_AUDITED_OPERATOR_QUEUE.length) return null;
  const legacy = value as Array<Partial<AuditedOperatorPractice>>;
  if (!legacy.every((item) => typeof item.id === "string" && typeof item.reason === "string" && Array.isArray(item.documents))) return null;
  return legacy.map((item) => {
    const fallback = DEFAULT_AUDITED_OPERATOR_QUEUE.find((practice) => practice.id === item.id);
    if (!fallback) return null;
    return { ...fallback, ...item, ...operationalFields(item.id!, item.reason!, item.documents as AuditedOperatorPractice["documents"]) };
  }).filter((item): item is AuditedOperatorPractice => item !== null);
}

export function checkpointOperationalPractice(
  queue: ReadonlyArray<AuditedOperatorPractice>, practiceId: string,
  update: { step: OperationalQueueStep; completed?: boolean; status?: AuditedOperatorPractice["status"]; source?: AuditedOperatorPractice["sources"][number]; ruleId?: string; block?: string | null; nextAction: string; note: string; at?: string },
): AuditedOperatorPractice[] {
  const at = update.at ?? new Date().toISOString();
  return queue.map((practice) => {
    if (practice.id !== practiceId) return practice;
    const completedSteps = update.completed && !practice.completedSteps.includes(update.step) ? [...practice.completedSteps, update.step] : [...practice.completedSteps];
    const sources = update.source && !practice.sources.some((source) => source.sourceId === update.source!.sourceId) ? [...practice.sources, update.source] : [...practice.sources];
    const appliedRules = update.ruleId && !practice.appliedRules.includes(update.ruleId) ? [...practice.appliedRules, update.ruleId] : [...practice.appliedRules];
    const type: OperationalQueueAuditEvent["type"] = update.block ? "block_recorded" : update.status && update.status !== practice.status ? "status_changed" : "checkpoint_reached";
    return {
      ...practice, status: update.status ?? practice.status, revision: practice.revision + 1,
      currentStep: update.step, completedSteps, sources, appliedRules,
      activeBlock: update.block === undefined ? practice.activeBlock : update.block,
      reason: update.block ?? practice.reason, nextAction: update.nextAction, updatedAt: at,
      audit: [...practice.audit, { id: `${practice.id}:audit:${practice.revision + 1}`, at, type, step: update.step, note: update.note }],
    };
  });
}

export function resumeOperationalQueue(queue: ReadonlyArray<AuditedOperatorPractice>, at = new Date().toISOString()) {
  return queue.map((practice) => ({
    ...practice,
    audit: [...practice.audit, { id: `${practice.id}:audit:${practice.revision + 1}`, at, type: "queue_resumed" as const, step: practice.currentStep, note: `Ripresa dal checkpoint ${practice.currentStep}; nessun passo precedente ripetuto.` }],
    revision: practice.revision + 1,
    updatedAt: at,
  }));
}

export function recordExceptionalManualSubmit(
  queue: ReadonlyArray<AuditedOperatorPractice>, practiceId: string,
  serverEvidence?: { cpid: string; verifiedAt: string },
): AuditedOperatorPractice[] {
  return queue.map((practice) => practice.id !== practiceId ? practice : ({
    ...practice,
    status: "submitted_manual_exception",
    reason: serverEvidence?.cpid.trim()
      ? `Invio manuale eccezionale verificato lato server il ${serverEvidence.verifiedAt}; CPID presente. Non è un successo dell'automazione submit.`
      : "Invio manuale eccezionale riferito dall'utente; verifica server e CPID non disponibili nel canale Chrome corrente. Non è un successo dell'automazione submit.",
  }));
}

export function saveAuditedOperatorQueue(storage: Storage, queue: ReadonlyArray<AuditedOperatorPractice>): boolean {
  if (!validQueue(queue)) return false;
  try { storage.setItem(AUDITED_OPERATOR_QUEUE_STORAGE_KEY, JSON.stringify(queue)); return true; } catch { return false; }
}

export function loadAuditedOperatorQueue(storage: Storage): AuditedOperatorPractice[] {
  try {
    const raw = storage.getItem(AUDITED_OPERATOR_QUEUE_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDITED_OPERATOR_QUEUE.map((item) => ({ ...item, documents: item.documents.map((doc) => ({ ...doc })) }));
    const parsed: unknown = JSON.parse(raw);
    if (validQueue(parsed)) return parsed;
    const migrated = migrateLegacyQueue(parsed);
    if (migrated?.length === DEFAULT_AUDITED_OPERATOR_QUEUE.length) {
      saveAuditedOperatorQueue(storage, migrated);
      return migrated;
    }
    return DEFAULT_AUDITED_OPERATOR_QUEUE.map((item) => ({ ...item, documents: item.documents.map((doc) => ({ ...doc })) }));
  } catch {
    return DEFAULT_AUDITED_OPERATOR_QUEUE.map((item) => ({ ...item, documents: item.documents.map((doc) => ({ ...doc })) }));
  }
}
