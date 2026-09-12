import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import { emptyFormData } from "@/types/form-cliente";

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
  ricevuta_at: string | null;
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
  resellerIdentifier: string | null;
  technicalSnapshot: LocalTechnicalSnapshot | null;
  maskedEmail: string | null;
  maskedPhone: string | null;
  maskedFiscalCode: string | null;
  product: string;
  receivedAt: string | null;
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

export interface LocalTechnicalSnapshot {
  buildingFingerprint: string;
  plant: { type: "centralizzato" | "autonomo"; terminals: "caloriferi" | "riscaldamento_pavimento" | "split"; fuel: "gas_metano" | "gasolio" | "gpl" | "energia_elettrica"; boiler: "gas_a_condensazione" | "altro"; airConditioning: boolean };
  screenings: Array<{ type: "tenda_da_sole" | "zanzariera"; exposure: "sud_est" | "sud_ovest" | "sud" | "est" | "ovest" | "nord_est" | "nord_ovest" | "nord"; widthCm: number; heightCm: number; motorized: boolean }>;
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
    && (snapshot.ricevuta_at === null || Number.isFinite(Date.parse(snapshot.ricevuta_at)))
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
      resellerIdentifier: null,
      technicalSnapshot: null,
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

export function withVerifiedReseller(practice: LocalImportedPractice, identifier: string): LocalImportedPractice | null {
  const normalized = identifier.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) && normalized.length <= 40
    ? { ...practice, resellerIdentifier: normalized }
    : null;
}

export function withVerifiedTechnicalSnapshot(practice: LocalImportedPractice, technical: LocalTechnicalSnapshot): LocalImportedPractice | null {
  const validFingerprint = /^building-[0-9a-f]{8}$/.test(technical.buildingFingerprint);
  const validScreenings = technical.screenings.length > 0 && technical.screenings.length <= 20
    && technical.screenings.every((item) => Number.isFinite(item.widthCm) && item.widthCm > 0 && item.widthCm <= 2000
      && Number.isFinite(item.heightCm) && item.heightCm > 0 && item.heightCm <= 2000);
  return validFingerprint && validScreenings ? { ...practice, technicalSnapshot: technical } : null;
}

export function loadImportedPractice(storage: Pick<Storage, "getItem">): LocalImportedPractice | null {
  try {
    const raw = storage.getItem(ENEA_SHADOW_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalImportedPractice;
    return parsed?.schema === "enea-shadow-single-import-v1"
      && parsed.customerLabel === "Cliente reale mascherato"
      && (parsed.resellerIdentifier == null || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed.resellerIdentifier))
      && (parsed.technicalSnapshot == null || /^building-[0-9a-f]{8}$/.test(parsed.technicalSnapshot.buildingFingerprint))
      && /^local-import-[0-9a-f]{8}$/.test(parsed.localId)
      && communicationsAreBlocked(parsed.communicationPolicy)
      ? parsed : null;
  } catch {
    return null;
  }
}

export function toShadowQueuePractice(practice: LocalImportedPractice): EneaLabSourcePractice {
  return {
    id: practice.localId,
    code: practice.code,
    reseller: practice.resellerIdentifier ?? "Origine CRM read-only",
    clienteNome: "Cliente reale",
    clienteCognome: "mascherato",
    prodottoInstallato: practice.product,
    // L'istante di importazione ordina la coda locale quando la sorgente non
    // espone la ricezione originale; non viene presentato come dato CRM.
    ricevutaAt: practice.receivedAt ?? practice.importedAt,
    dataFineLavori: practice.workCompletedAt,
    fattureCount: 0,
    documentiCount: practice.documentCount,
    documentPaths: [],
    queueStatus: practice.formComplete ? "ready" : "waiting_client",
    form: emptyFormData(),
  };
}

export function clearImportedPractice(
  storage: Pick<Storage, "getItem" | "removeItem">,
  localId: string,
): boolean {
  const practice = loadImportedPractice(storage);
  if (!practice || practice.localId !== localId) return false;
  try {
    storage.removeItem(ENEA_SHADOW_IMPORT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
