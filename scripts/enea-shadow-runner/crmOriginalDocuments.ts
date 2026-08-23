import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_CRM_DOCUMENTS_VERSION = "apr-crm-original-documents-v1" as const;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const SUPPORTED_ORIGINAL_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const RULE_IDS = [
  "core-form-first",
  "core-economic-classification",
  "system-apr-crm-readonly-adapter-contract",
  "system-apr-crm-integration-boundary",
  "system-readonly-adapter-contract",
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export interface AprCrmDocumentTransport {
  readOnlyStorageGet(bucket: "enea-documents", objectPath: string, now?: Date): Promise<Response>;
  snapshot(now?: Date): { status: string };
}

export interface AprCrmDocumentItem {
  documentKey: string;
  customerKey: string;
  practiceId: string;
  kind: "invoice" | "additional";
  sourcePath: string;
  state: "queued" | "downloading" | "downloaded" | "blocked_invalid_path" | "blocked_response" | "blocked_not_pdf" | "blocked_unsupported_content";
  requestAttemptCount: number;
  localPath: string | null;
  responseSha256: string | null;
  contentType: string | null;
  byteLength: number;
  reason: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface AprCrmDocumentsState {
  version: typeof APR_CRM_DOCUMENTS_VERSION;
  revision: number;
  status: "unprepared" | "queued" | "running" | "completed" | "waiting_auth";
  sourceSetFingerprint: string | null;
  currentDocumentKey: string | null;
  items: AprCrmDocumentItem[];
  externalActionAllowed: false;
  operationalGate: "crm_original_documents_readonly_only";
  reason: string;
  nextAction: string;
  documentFormatRepairsApplied: string[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "prepared" | "source_revision_applied" | "format_support_applied" | "document_claimed" | "document_request_started" | "document_downloaded" | "document_blocked" | "waiting_auth" | "completed"; documentKey: string | null; reason: string; appliedRuleIds: string[] }>;
}

function atomicWrite(target: string, contents: string | Buffer) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); }
  finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmDocumentsState {
  const reason = "Allegati CRM originari non ancora preparati.";
  return {
    version: APR_CRM_DOCUMENTS_VERSION, revision: 0, status: "unprepared", sourceSetFingerprint: null,
    currentDocumentKey: null, items: [], externalActionAllowed: false, operationalGate: "crm_original_documents_readonly_only",
    reason, nextAction: "Attendere i dossier CRM acquisiti e verificati.", documentFormatRepairsApplied: [],
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", documentKey: null, reason, appliedRuleIds: RULE_IDS }],
  };
}

function validState(value: AprCrmDocumentsState) {
  return value.version === APR_CRM_DOCUMENTS_VERSION && value.externalActionAllowed === false
    && value.operationalGate === "crm_original_documents_readonly_only"
    && value.audit.every((event) => event.appliedRuleIds.every((id) => registryRule(id)));
}

type AcquiredDossierInput = { customerKey: string; practiceId: string; dossierPath: string };

function stringPaths(value: unknown) {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((candidate): candidate is string => typeof candidate === "string") : [];
}

function validOriginalPath(practiceId: string, sourcePath: string) {
  return sourcePath.startsWith(`${practiceId}/`) && !sourcePath.includes("\\")
    && !sourcePath.split("/").some((segment) => !segment || segment === "." || segment === "..")
    && SUPPORTED_ORIGINAL_EXTENSIONS.has(path.extname(sourcePath).toLowerCase());
}

function detectedOriginalFormat(body: Buffer) {
  if (body.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "pdf" as const;
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png" as const;
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpeg" as const;
  return null;
}

function expectedOriginalFormat(sourcePath: string) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".pdf") return "pdf" as const;
  if (extension === ".png") return "png" as const;
  if (extension === ".jpg" || extension === ".jpeg") return "jpeg" as const;
  return null;
}

export class PersistentAprCrmOriginalDocuments {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly documentDirectory: string;

  constructor(readonly rootDirectory: string, readonly transport: AprCrmDocumentTransport) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-original-documents");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.documentDirectory = path.join(this.directory, "files");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmDocumentsState;
      value.documentFormatRepairsApplied ??= [];
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprCrmDocumentsState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  prepare(dossiers: AcquiredDossierInput[], now = new Date()) {
    const current = this.initialize(now);
    const sources: Array<Omit<AprCrmDocumentItem, "state" | "requestAttemptCount" | "localPath" | "responseSha256" | "contentType" | "byteLength" | "reason" | "startedAt" | "endedAt">> = [];
    for (const dossierRef of [...dossiers].sort((a, b) => a.customerKey.localeCompare(b.customerKey))) {
      const dossier = JSON.parse(readFileSync(dossierRef.dossierPath, "utf8")) as { row?: { id?: unknown; fatture_urls?: unknown; documenti_aggiuntivi_urls?: unknown; dati_form?: { fatture?: { fattura?: unknown } } } };
      if (dossier.row?.id !== dossierRef.practiceId) throw new Error(`crm_document_dossier_identity_mismatch:${dossierRef.customerKey}`);
      // Il CRM può conservare l'originale caricato dal form sotto
      // dati_form.fatture.fattura anche quando fatture_urls punta a una copia
      // immagine. Entrambe sono fonti originarie della stessa pratica e
      // restano inventariate 1:1; il contenuto viene accettato soltanto se la
      // firma binaria coincide con PDF, PNG o JPEG dichiarati dal percorso.
      const invoicePaths = [...new Set([
        ...stringPaths(dossier.row.fatture_urls),
        ...stringPaths(dossier.row.dati_form?.fatture?.fattura),
      ])];
      const additionalPaths = Array.isArray(dossier.row.documenti_aggiuntivi_urls) ? dossier.row.documenti_aggiuntivi_urls.filter((value): value is string => typeof value === "string") : [];
      for (const [kind, sourcePath] of [...invoicePaths.map((value) => ["invoice", value] as const), ...additionalPaths.map((value) => ["additional", value] as const)]) {
        sources.push({ documentKey: sha256(`${dossierRef.customerKey}\0${kind}\0${sourcePath}`), customerKey: dossierRef.customerKey, practiceId: dossierRef.practiceId, kind, sourcePath });
      }
    }
    const unique = [...new Map(sources.map((source) => [source.documentKey, source])).values()];
    const sourceSetFingerprint = sha256(JSON.stringify(unique));
    if (current.sourceSetFingerprint === sourceSetFingerprint) return current;
    // Un checkpoint terminale resta una fotografia immutabile anche se una
    // versione successiva del discovery riconosce altre fonti originarie. Non
    // riaprire automaticamente il batch già concluso: la nuova regola entrerà
    // in vigore soltanto su una nuova coda, evitando download o preflight
    // duplicati dopo il deploy/riavvio.
    if (current.sourceSetFingerprint && current.status === "completed") return current;
    if (current.sourceSetFingerprint) throw new Error("crm_document_source_set_immutable");
    const next = structuredClone(current); next.revision += 1; next.status = unique.length ? "queued" : "completed"; next.sourceSetFingerprint = sourceSetFingerprint;
    next.items = unique.map((source) => {
      const validPath = validOriginalPath(source.practiceId, source.sourcePath);
      return { ...source, state: validPath ? "queued" as const : "blocked_invalid_path" as const, requestAttemptCount: 0,
        localPath: null, responseSha256: null, contentType: null, byteLength: 0,
        reason: validPath ? "In coda per GET read-only dell’allegato originario." : "Percorso allegato non valido o non appartenente alla pratica.", startedAt: null, endedAt: validPath ? null : now.toISOString() };
    });
    const blocked = next.items.filter((item) => item.state === "blocked_invalid_path").length;
    next.reason = `Preparati ${next.items.length} allegati originari; ${blocked} percorsi bloccati prima della rete.`;
    next.nextAction = unique.length ? "Scaricare un allegato alla volta con GET autenticato e fingerprint locale." : "Nessun allegato originario referenziato.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "prepared", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  extendAfterAcquisitionCorrection(dossiers: AcquiredDossierInput[], now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceSetFingerprint) return this.prepare(dossiers, now);
    if (current.status !== "completed") return current;
    const sources: Array<Omit<AprCrmDocumentItem, "state" | "requestAttemptCount" | "localPath" | "responseSha256" | "contentType" | "byteLength" | "reason" | "startedAt" | "endedAt">> = [];
    for (const dossierRef of [...dossiers].sort((a, b) => a.customerKey.localeCompare(b.customerKey))) {
      const dossier = JSON.parse(readFileSync(dossierRef.dossierPath, "utf8")) as { row?: { id?: unknown; fatture_urls?: unknown; documenti_aggiuntivi_urls?: unknown; dati_form?: { fatture?: { fattura?: unknown } } } };
      if (dossier.row?.id !== dossierRef.practiceId) throw new Error(`crm_document_dossier_identity_mismatch:${dossierRef.customerKey}`);
      const invoicePaths = [...new Set([...stringPaths(dossier.row.fatture_urls), ...stringPaths(dossier.row.dati_form?.fatture?.fattura)])];
      const additionalPaths = Array.isArray(dossier.row.documenti_aggiuntivi_urls) ? dossier.row.documenti_aggiuntivi_urls.filter((value): value is string => typeof value === "string") : [];
      for (const [kind, sourcePath] of [...invoicePaths.map((value) => ["invoice", value] as const), ...additionalPaths.map((value) => ["additional", value] as const)]) {
        sources.push({ documentKey: sha256(`${dossierRef.customerKey}\0${kind}\0${sourcePath}`), customerKey: dossierRef.customerKey, practiceId: dossierRef.practiceId, kind, sourcePath });
      }
    }
    const unique = [...new Map(sources.map((source) => [source.documentKey, source])).values()];
    const sourceSetFingerprint = sha256(JSON.stringify(unique));
    if (current.sourceSetFingerprint === sourceSetFingerprint) return current;
    const incomingKeys = new Set(unique.map((item) => item.documentKey));
    if (current.items.some((item) => !incomingKeys.has(item.documentKey))) throw new Error("crm_document_source_revision_removed_existing_source");
    const existingKeys = new Set(current.items.map((item) => item.documentKey));
    const additions = unique.filter((item) => !existingKeys.has(item.documentKey));
    if (!additions.length) return current;
    const next = structuredClone(current);
    next.revision += 1;
    next.sourceSetFingerprint = sourceSetFingerprint;
    next.currentDocumentKey = null;
    const appended = additions.map((source) => {
      const validPath = validOriginalPath(source.practiceId, source.sourcePath);
      return { ...source, state: validPath ? "queued" as const : "blocked_invalid_path" as const, requestAttemptCount: 0,
        localPath: null, responseSha256: null, contentType: null, byteLength: 0,
        reason: validPath ? "In coda dopo correzione identita operatore; GET read-only non ancora eseguito." : "Percorso allegato non valido o non appartenente alla pratica.", startedAt: null, endedAt: validPath ? null : now.toISOString() };
    });
    next.items.push(...appended);
    next.status = appended.some((item) => item.state === "queued") ? "queued" : "completed";
    next.reason = `Aggiunti ${appended.length} allegati originari dopo correzione identita; ${current.items.length} checkpoint precedenti preservati senza nuovi GET.`;
    next.nextAction = next.status === "queued" ? "Scaricare esclusivamente i nuovi allegati con GET autenticato." : "Registrare i nuovi percorsi bloccati senza ripetere gli allegati esistenti.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "source_revision_applied", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  applyOriginalImageSupport(repairId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.documentFormatRepairsApplied.includes(repairId)) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(repairId)) throw new Error("crm_document_format_repair_id_invalid");
    const repairable = current.items.filter((item) => (item.state === "blocked_invalid_path" || (item.state === "blocked_response"
        && item.reason === "Trasporto GET allegato non disponibile; nessun dato inventato." && item.responseSha256 === null && item.contentType === null && item.byteLength === 0))
      && validOriginalPath(item.practiceId, item.sourcePath)
      && [".png", ".jpg", ".jpeg"].includes(path.extname(item.sourcePath).toLowerCase()));
    if (!repairable.length) return current;
    const repairableKeys = new Set(repairable.map((item) => item.documentKey));
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.currentDocumentKey = null;
    next.documentFormatRepairsApplied.push(repairId);
    for (const item of next.items) if (repairableKeys.has(item.documentKey)) {
      item.state = "queued"; item.reason = `Riarmato per acquisizione immagine originaria ${repairId}; GET non ancora eseguito.`; item.endedAt = null;
    }
    next.reason = `${repairable.length} immagini originarie riarmate; tutti i PDF e i relativi fingerprint restano immutati.`;
    next.nextAction = "Acquisire esclusivamente le immagini riarmate con GET read-only e validazione della firma binaria.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "format_support_applied", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  private claim(now: Date) {
    const current = this.load(now);
    const active = current.items.find((item) => item.state === "downloading");
    if (active) return active;
    const index = current.items.findIndex((item) => item.state === "queued");
    if (index < 0) return null;
    const next = structuredClone(current); const item = next.items[index]; next.revision += 1; next.status = "running"; next.currentDocumentKey = item.documentKey;
    item.state = "downloading"; item.startedAt ??= now.toISOString(); item.reason = "Allegato reclamato; GET riprendibile dopo riavvio.";
    next.reason = `${item.customerKey}: acquisizione ${item.kind} in corso.`;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "document_claimed", documentKey: item.documentKey, reason: item.reason, appliedRuleIds: RULE_IDS });
    this.write(next); return item;
  }

  async tick(now = new Date()) {
    const current = this.load(now);
    if (current.status === "unprepared" || current.status === "completed") return current;
    if (this.transport.snapshot(now).status !== "authenticated") {
      if (current.status === "waiting_auth") return current;
      const next = structuredClone(current); next.revision += 1; next.status = "waiting_auth";
      next.reason = "Sessione CRM APR non autenticata; allegati sospesi senza perdita della coda."; next.nextAction = "Ripristinare la sessione APR globale; nessun ticket pratica.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "waiting_auth", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
      return this.write(next);
    }
    const item = this.claim(now);
    if (!item) return this.complete(now);
    const beforeRequest = structuredClone(this.load(now)); const targetBefore = beforeRequest.items.find((candidate) => candidate.documentKey === item.documentKey)!;
    beforeRequest.revision += 1; targetBefore.requestAttemptCount += 1;
    beforeRequest.audit.push({ revision: beforeRequest.revision, at: now.toISOString(), type: "document_request_started", documentKey: item.documentKey, reason: "GET storage read-only avviato; nessun corpo o metodo mutativo.", appliedRuleIds: RULE_IDS });
    this.write(beforeRequest);
    let response: Response;
    try { response = await this.transport.readOnlyStorageGet("enea-documents", item.sourcePath, now); }
    catch { return this.block(item.documentKey, "blocked_response", "Trasporto GET allegato non disponibile; nessun dato inventato.", now); }
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (!response.ok || (declaredLength > MAX_DOCUMENT_BYTES)) return this.block(item.documentKey, "blocked_response", `Risposta allegato non valida: HTTP ${response.status}${declaredLength > MAX_DOCUMENT_BYTES ? ", dimensione dichiarata oltre 20 MB" : ""}.`, now, null, contentType);
    const body = Buffer.from(await response.arrayBuffer()); const bodyHash = sha256(body);
    if (body.length > MAX_DOCUMENT_BYTES) return this.block(item.documentKey, "blocked_response", "Allegato oltre 20 MB; controllo operatore richiesto.", now, bodyHash, contentType, body.length);
    const expectedFormat = expectedOriginalFormat(item.sourcePath); const detectedFormat = detectedOriginalFormat(body);
    if (!expectedFormat || !detectedFormat || expectedFormat !== detectedFormat) return this.block(item.documentKey, "blocked_unsupported_content", `Firma contenuto non coerente con il formato originario dichiarato, sha256 ${bodyHash}.`, now, bodyHash, contentType, body.length);
    const extension = expectedFormat === "jpeg" ? ".jpg" : `.${expectedFormat}`;
    const localPath = path.join(this.documentDirectory, item.customerKey, `${item.documentKey}${extension}`); atomicWrite(localPath, body);
    const next = structuredClone(this.load(now)); const target = next.items.find((candidate) => candidate.documentKey === item.documentKey)!;
    next.revision += 1; target.state = "downloaded"; target.localPath = localPath; target.responseSha256 = bodyHash; target.contentType = contentType; target.byteLength = body.length; target.endedAt = now.toISOString();
    target.reason = `Allegato originario acquisito via GET, validato come ${expectedFormat.toUpperCase()} e salvato con fingerprint.`; next.currentDocumentKey = null; next.reason = `${target.customerKey}: ${target.reason}`;
    next.nextAction = "Proseguire con il prossimo allegato; nessun documento ENEA storico viene acquisito.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "document_downloaded", documentKey: target.documentKey, reason: target.reason, appliedRuleIds: RULE_IDS });
    this.write(next); return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "downloading") ? next : this.complete(now);
  }

  private block(documentKey: string, state: "blocked_response" | "blocked_not_pdf" | "blocked_unsupported_content", reason: string, now: Date, responseSha256: string | null = null, contentType: string | null = null, byteLength = 0) {
    const next = structuredClone(this.load(now)); const item = next.items.find((candidate) => candidate.documentKey === documentKey)!; next.revision += 1;
    item.state = state; item.reason = reason; item.responseSha256 = responseSha256; item.contentType = contentType; item.byteLength = byteLength; item.endedAt = now.toISOString(); next.currentDocumentKey = null;
    next.reason = `${item.customerKey}: ${reason}`; next.nextAction = "Registrare il blocco del documento e proseguire con il successivo.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "document_blocked", documentKey, reason, appliedRuleIds: RULE_IDS });
    this.write(next); return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "downloading") ? next : this.complete(now);
  }

  private complete(now: Date) {
    const current = this.load(now); if (current.status === "completed") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "completed"; next.currentDocumentKey = null;
    const downloaded = next.items.filter((item) => item.state === "downloaded").length; const blocked = next.items.length - downloaded;
    next.reason = `Acquisizione allegati originari conclusa: ${downloaded} documenti validi, ${blocked} bloccati.`;
    next.nextAction = "Estrarre e validare localmente form e fatture; ENEA resta chiusa.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now); return { ...state, progress: { total: state.items.length,
      queued: state.items.filter((item) => item.state === "queued" || item.state === "downloading").length,
      downloaded: state.items.filter((item) => item.state === "downloaded").length,
      blocked: state.items.filter((item) => item.state.startsWith("blocked_")).length },
    lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}
