export const ENEA_SHADOW_IMPORT_STORAGE_KEY = "enea-shadow-crm:single-import:v1";
export const IMPORT_CONFIRMATION_PHRASE = "IMPORTA_UNA_PRATICA";

export interface CrmReadOnlySnapshot {
  id: string;
  code: string;
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
  cliente_cf?: string | null;
  prodotto_installato: string;
  ricevuta_at: string;
  data_fine_lavori?: string | null;
  document_count: number;
  form_complete: boolean;
}

export interface ImportConsent {
  confirmationPhrase: string;
  singlePracticeConfirmed: boolean;
  localOnlyConfirmed: boolean;
  communicationsBlockedConfirmed: boolean;
}

export interface LocalImportedPractice {
  schema: "enea-shadow-single-import-v1";
  localId: string;
  sourceFingerprint: string;
  code: string;
  customerLabel: "Cliente reale mascherato";
  maskedEmail: string | null;
  maskedPhone: string | null;
  maskedFiscalCode: string | null;
  product: string;
  receivedAt: string;
  workCompletedAt: string | null;
  documentCount: number;
  formComplete: boolean;
  importedAt: string;
  sourceMode: "read-only-snapshot";
  communicationPolicy: {
    email: "blocked";
    whatsapp: "blocked";
    crmWrite: "blocked";
    eneaWrite: "blocked";
    upload: "blocked";
  };
}

export type ImportResult = { ok: true; practice: LocalImportedPractice } | { ok: false; reason: string };

function communicationsAreBlocked(policy: unknown): policy is LocalImportedPractice["communicationPolicy"] {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false;
  const candidate = policy as Record<string, unknown>;
  return candidate.email === "blocked"
    && candidate.whatsapp === "blocked"
    && candidate.crmWrite === "blocked"
    && candidate.eneaWrite === "blocked"
    && candidate.upload === "blocked";
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function maskEmail(value: string | null | undefined): string | null {
  if (!value?.includes("@")) return null;
  const [, domain] = value.split("@");
  return domain ? `***@${domain}` : null;
}

function maskPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `***${digits.slice(-4)}` : null;
}

function maskFiscalCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length >= 4 ? `************${normalized.slice(-4)}` : null;
}

function validSnapshot(snapshot: CrmReadOnlySnapshot): boolean {
  return /^[0-9a-f-]{20,}$/i.test(snapshot.id)
    && /^CRM-[A-Z0-9-]{4,20}$/.test(snapshot.code)
    && snapshot.prodotto_installato.length > 0
    && Number.isFinite(Date.parse(snapshot.ricevuta_at))
    && Number.isInteger(snapshot.document_count)
    && snapshot.document_count >= 0
    && snapshot.document_count <= 50;
}

export function prepareSinglePracticeImport(
  snapshots: readonly CrmReadOnlySnapshot[],
  consent: ImportConsent,
  now = new Date(),
): ImportResult {
  if (snapshots.length !== 1) return { ok: false, reason: "È consentita esattamente una pratica." };
  if (consent.confirmationPhrase !== IMPORT_CONFIRMATION_PHRASE
    || !consent.singlePracticeConfirmed
    || !consent.localOnlyConfirmed
    || !consent.communicationsBlockedConfirmed) {
    return { ok: false, reason: "Consenso locale esplicito incompleto." };
  }
  const [snapshot] = snapshots;
  if (!validSnapshot(snapshot)) return { ok: false, reason: "Snapshot CRM non valido o non minimizzato." };
  const sourceFingerprint = fingerprint(snapshot.id);
  return {
    ok: true,
    practice: {
      schema: "enea-shadow-single-import-v1",
      localId: `local-import-${sourceFingerprint}`,
      sourceFingerprint,
      code: snapshot.code,
      customerLabel: "Cliente reale mascherato",
      maskedEmail: maskEmail(snapshot.cliente_email),
      maskedPhone: maskPhone(snapshot.cliente_telefono),
      maskedFiscalCode: maskFiscalCode(snapshot.cliente_cf),
      product: snapshot.prodotto_installato,
      receivedAt: snapshot.ricevuta_at,
      workCompletedAt: snapshot.data_fine_lavori && Number.isFinite(Date.parse(snapshot.data_fine_lavori)) ? snapshot.data_fine_lavori : null,
      documentCount: snapshot.document_count,
      formComplete: snapshot.form_complete === true,
      importedAt: now.toISOString(),
      sourceMode: "read-only-snapshot",
      communicationPolicy: { email: "blocked", whatsapp: "blocked", crmWrite: "blocked", eneaWrite: "blocked", upload: "blocked" },
    },
  };
}

export function saveImportedPractice(storage: Pick<Storage, "setItem">, practice: LocalImportedPractice): boolean {
  if (practice.schema !== "enea-shadow-single-import-v1" || !communicationsAreBlocked(practice.communicationPolicy)) return false;
  try {
    storage.setItem(ENEA_SHADOW_IMPORT_STORAGE_KEY, JSON.stringify(practice));
    return true;
  } catch {
    return false;
  }
}

export function loadImportedPractice(storage: Pick<Storage, "getItem">): LocalImportedPractice | null {
  try {
    const raw = storage.getItem(ENEA_SHADOW_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalImportedPractice;
    return parsed?.schema === "enea-shadow-single-import-v1"
      && parsed.customerLabel === "Cliente reale mascherato"
      && /^local-import-[0-9a-f]{8}$/.test(parsed.localId)
      && communicationsAreBlocked(parsed.communicationPolicy)
      ? parsed : null;
  } catch {
    return null;
  }
}
