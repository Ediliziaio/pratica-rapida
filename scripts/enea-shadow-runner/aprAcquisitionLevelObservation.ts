import {
  envelopeImmutableArtifact,
  verifyImmutableArtifactEnvelope,
  type AprImmutableArtifactEnvelope,
} from "./aprMonotonicArtifacts";

export const APR_L1_ACQUISITION_ARTIFACT_VERSION = "apr-l1-acquisition-artifact-v1" as const;

export type AprAcquisitionMethod = "upload" | "ocr" | "text_extraction";
export type AprAcquisitionPageOutcome = "complete" | "unreadable" | "missing";

export interface AprAcquisitionPage {
  pageId: string;
  pageNumber: number;
  contentSha256: string | null;
  acquisitionMethod: AprAcquisitionMethod | null;
  outcome: AprAcquisitionPageOutcome;
}

export interface AprAcquiredDocument {
  documentId: string;
  pages: readonly AprAcquisitionPage[];
}

export interface AprAcquisitionArtifactPayload {
  schemaVersion: typeof APR_L1_ACQUISITION_ARTIFACT_VERSION;
  mode: "parallel_observation_only";
  customerKey: string;
  practiceId: string;
  documents: readonly AprAcquiredDocument[];
  status: "completed" | "blocked";
  blockerCodes: readonly string[];
  operationalAuthority: false;
}

export type AprAcquisitionArtifact = AprImmutableArtifactEnvelope<AprAcquisitionArtifactPayload>;

type AcquisitionPageInput = AprAcquisitionPage;
type AcquiredDocumentInput = { documentId: string; pages: readonly AcquisitionPageInput[] };

const SHA256 = /^[a-f0-9]{64}$/;

function required(value: string, code: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function normalizePage(documentId: string, page: AcquisitionPageInput): AprAcquisitionPage {
  const pageId = required(page.pageId, "apr_l1_page_id_missing");
  if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) throw new Error(`apr_l1_page_number_invalid:${documentId}:${pageId}`);
  if (page.outcome === "missing") {
    if (page.contentSha256 !== null || page.acquisitionMethod !== null) throw new Error(`apr_l1_missing_page_has_content:${documentId}:${pageId}`);
  } else {
    if (!page.contentSha256 || !SHA256.test(page.contentSha256)) throw new Error(`apr_l1_page_content_hash_invalid:${documentId}:${pageId}`);
    if (!page.acquisitionMethod) throw new Error(`apr_l1_page_method_missing:${documentId}:${pageId}`);
  }
  return { pageId, pageNumber: page.pageNumber, contentSha256: page.contentSha256, acquisitionMethod: page.acquisitionMethod, outcome: page.outcome };
}

function normalizeDocument(document: AcquiredDocumentInput): AprAcquiredDocument {
  const documentId = required(document.documentId, "apr_l1_document_id_missing");
  if (document.pages.length === 0) throw new Error(`apr_l1_document_pages_missing:${documentId}`);
  const pages = document.pages.map((page) => normalizePage(documentId, page))
    .sort((left, right) => left.pageNumber - right.pageNumber || left.pageId.localeCompare(right.pageId));
  if (new Set(pages.map((page) => page.pageId)).size !== pages.length) throw new Error(`apr_l1_duplicate_page_id:${documentId}`);
  if (new Set(pages.map((page) => page.pageNumber)).size !== pages.length) throw new Error(`apr_l1_duplicate_page_number:${documentId}`);
  return { documentId, pages };
}

function pageBlocker(documentId: string, page: AprAcquisitionPage) {
  return page.outcome === "unreadable"
    ? `apr_l1_page_unreadable:${documentId}:${page.pageId}`
    : page.outcome === "missing"
      ? `apr_l1_page_missing:${documentId}:${page.pageId}`
      : null;
}

/**
 * Struttura risultati di acquisizione gia osservati a monte. Non apre file,
 * non esegue OCR e non decide la leggibilita: normalizza e sigilla l'input.
 */
export function createAcquisitionArtifact(input: {
  customerKey: string;
  practiceId: string;
  documents: readonly AcquiredDocumentInput[];
}): AprAcquisitionArtifact {
  const documents = input.documents.map(normalizeDocument).sort((left, right) => left.documentId.localeCompare(right.documentId));
  if (new Set(documents.map((document) => document.documentId)).size !== documents.length) throw new Error("apr_l1_duplicate_document_id");
  const blockerCodes = documents.flatMap((document) => document.pages
    .map((page) => pageBlocker(document.documentId, page))
    .filter((code): code is string => code !== null)).sort();
  if (documents.length === 0) blockerCodes.push("apr_l1_documents_missing");
  const payload: AprAcquisitionArtifactPayload = {
    schemaVersion: APR_L1_ACQUISITION_ARTIFACT_VERSION,
    mode: "parallel_observation_only",
    customerKey: required(input.customerKey, "apr_l1_customer_key_missing"),
    practiceId: required(input.practiceId, "apr_l1_practice_id_missing"),
    documents,
    status: blockerCodes.length ? "blocked" : "completed",
    blockerCodes,
    operationalAuthority: false,
  };
  return deepFreeze(envelopeImmutableArtifact(payload));
}

export function verifyAcquisitionArtifact(artifact: AprAcquisitionArtifact) {
  if (!verifyImmutableArtifactEnvelope(artifact)
    || artifact.payload.schemaVersion !== APR_L1_ACQUISITION_ARTIFACT_VERSION
    || artifact.payload.mode !== "parallel_observation_only"
    || artifact.payload.operationalAuthority !== false) return false;
  try {
    const rebuilt = createAcquisitionArtifact({ customerKey: artifact.payload.customerKey, practiceId: artifact.payload.practiceId, documents: artifact.payload.documents });
    return rebuilt.artifactId === artifact.artifactId;
  } catch {
    return false;
  }
}
