import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

export const APR_CRM_LOCAL_DRAFT_PACKAGES_VERSION = "apr-crm-local-draft-packages-v1" as const;

const SYSTEM_RULE_IDS = [
  "system-apr-crm-integration-boundary",
  "system-apr-operator-intervention-routing",
  "system-atomic-checkpoint-resume",
] as const;

type PreflightContract = Pick<PersistentAprCrmLocalPreflight, "snapshot" | "buildDraftExecutionPackage">;
type PreflightSnapshot = ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>;
type PreflightItem = PreflightSnapshot["items"][number];
type DraftPackage = ReturnType<PersistentAprCrmLocalPreflight["buildDraftExecutionPackage"]>;

export interface AprCrmLocalDraftPackageSummary {
  customerKey: string;
  displayName: string;
  practiceId: string;
  status: "verified_local_package";
  sourceFingerprint: string | null;
  mappingFingerprint: string;
  workflowFingerprint: string;
  packageFingerprint: string;
  packageArtifactPath: string;
  packageArtifactSha256: string;
  productCount: number;
  eligibleExpense: number | null;
  requiredPortalFieldCount: number;
  screeningItemCount: number;
  supportedPages: string[];
  sourceIds: string[];
  executionNotArmed: true;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
}

export interface AprCrmResidualCaseClassification {
  customerKey: string;
  displayName: string;
  practiceId: string;
  classification: "unsupported_product_module" | "operator_required";
  category: "infissi_serramenti" | "pompe_di_calore_climatizzazione" | "beneficiary_identity" | "missing_fiscal_invoice" | "preflight_evidence";
  productModule: string;
  blockerCodes: string[];
  sourceFields: string[];
  reason: string;
  nextAction: string;
  appliedRuleIds: string[];
}

export interface AprCrmLocalDraftPackagesState {
  version: typeof APR_CRM_LOCAL_DRAFT_PACKAGES_VERSION;
  revision: number;
  status: "unprepared" | "completed" | "technical_block";
  sourceSignature: string | null;
  sourceFingerprint: string | null;
  packages: AprCrmLocalDraftPackageSummary[];
  residualCases: AprCrmResidualCaseClassification[];
  externalActionAllowed: false;
  crmMutationAllowed: false;
  eneaActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  reason: string;
  nextAction: string;
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "packages_verified" | "technical_block";
    reason: string;
    appliedRuleIds: string[];
  }>;
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmLocalDraftPackagesState {
  const reason = "Pacchetti di bozza locali non ancora verificati.";
  return {
    version: APR_CRM_LOCAL_DRAFT_PACKAGES_VERSION,
    revision: 0,
    status: "unprepared",
    sourceSignature: null,
    sourceFingerprint: null,
    packages: [],
    residualCases: [],
    externalActionAllowed: false,
    crmMutationAllowed: false,
    eneaActionAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    reason,
    nextAction: "Attendere il completamento del preflight locale.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }],
  };
}

function validState(value: AprCrmLocalDraftPackagesState) {
  return value.version === APR_CRM_LOCAL_DRAFT_PACKAGES_VERSION
    && value.externalActionAllowed === false
    && value.crmMutationAllowed === false
    && value.eneaActionAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.communicationsAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function readProductModule(item: PreflightItem) {
  try {
    const dossier = JSON.parse(readFileSync(item.dossierPath, "utf8")) as { row?: { prodotto_installato?: unknown } };
    return typeof dossier.row?.prodotto_installato === "string" ? dossier.row.prodotto_installato.trim() : "";
  } catch {
    return "";
  }
}

export function classifyResidualPreflightCase(item: PreflightItem): AprCrmResidualCaseClassification {
  const productModule = readProductModule(item);
  const normalizedModule = productModule.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const blockers = item.report?.blockers ?? [];
  const blockerCodes = blockers.map((blocker) => blocker.code);
  const sourceFields = [...new Set(blockers.flatMap((blocker) => [blocker.field, ...blocker.sourceIds]))];
  const blockerRuleIds = blockers.flatMap((blocker) => blocker.appliedRuleIds);
  const appliedRuleIds = [...new Set([...SYSTEM_RULE_IDS, ...blockerRuleIds])].filter((ruleId) => registryRule(ruleId));

  if (/infissi|serramenti/.test(normalizedModule)) {
    return {
      customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
      classification: "unsupported_product_module", category: "infissi_serramenti", productModule,
      blockerCodes, sourceFields,
      reason: "Flusso APR comune Infissi / Serramenti pronto; estrazione fatture e modulo tecnico non ancora implementati. I blocker da parser schermature non sono usati come diagnosi del prodotto.",
      nextAction: "Mantenere il caso fuori dall'esecuzione ENEA fino al completamento dei gate fatture, cardinalita e dati tecnici Infissi / Serramenti.", appliedRuleIds,
    };
  }
  if (/pompe? di calore|climatizz/.test(normalizedModule)) {
    return {
      customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
      classification: "unsupported_product_module", category: "pompe_di_calore_climatizzazione", productModule,
      blockerCodes, sourceFields,
      reason: "Modulo APR Pompe di Calore / Climatizzazione non ancora implementato; i blocker da parser schermature non sono usati come diagnosi del prodotto.",
      nextAction: "Mantenere il caso fuori dall'esecuzione ENEA fino al gate dedicato Pompe di Calore / Climatizzazione.", appliedRuleIds,
    };
  }

  if (blockerCodes.some((code) => code === "tax_code_missing_or_invalid" || code === "tax_code_conflict")) {
    return {
      customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
      classification: "operator_required", category: "beneficiary_identity", productModule,
      blockerCodes, sourceFields,
      reason: blockers.find((blocker) => blocker.field === "beneficiary.taxCode")?.reason ?? "Identita fiscale del beneficiario non risolta dalle fonti originarie.",
      nextAction: "Richiesto intervento operatore sul CF; dopo la risposta riaccodare la stessa pratica dal nuovo checkpoint.", appliedRuleIds,
    };
  }

  const missingInvoice = blockerCodes.includes("original_invoice_missing_or_unavailable") || blockerCodes.includes("invoice_78e3f1f0");
  return {
    customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
    classification: "operator_required", category: missingInvoice ? "missing_fiscal_invoice" : "preflight_evidence", productModule,
    blockerCodes, sourceFields,
    reason: missingInvoice
      ? "Nessuna fattura fiscale originaria valida riconosciuta; APR non inventa dati economici o tecnici."
      : blockers.map((blocker) => `${blocker.field}: ${blocker.reason}`).join(" · ") || "Preflight non verde per evidenze originarie insufficienti.",
    nextAction: missingInvoice
      ? "Richiesto intervento operatore: acquisire la fattura originaria e rimettere la pratica in Pronte da fare."
      : "Richiesto intervento operatore: risolvere i campi indicati e riaccodare la stessa pratica.",
    appliedRuleIds,
  };
}

function summarizePackage(item: PreflightItem, draftPackage: DraftPackage, packageArtifactPath: string, packageArtifactSha256: string): AprCrmLocalDraftPackageSummary {
  return {
    customerKey: draftPackage.customerKey,
    displayName: draftPackage.displayName,
    practiceId: draftPackage.practiceId,
    status: "verified_local_package",
    sourceFingerprint: draftPackage.sourceFingerprint,
    mappingFingerprint: draftPackage.mappingFingerprint,
    workflowFingerprint: draftPackage.workflowFingerprint,
    packageFingerprint: draftPackage.packageFingerprint,
    packageArtifactPath,
    packageArtifactSha256,
    productCount: item.report?.products.length ?? 0,
    eligibleExpense: item.report?.financial.eligibleExpense ?? null,
    requiredPortalFieldCount: draftPackage.workflow.preparedFieldIds.length,
    screeningItemCount: item.report?.eneaPayloadAudit?.portalGate.screeningItemCount ?? 0,
    supportedPages: [...draftPackage.workflow.steps.map((step) => step.id)],
    sourceIds: [...(item.report?.sourceIds ?? [])],
    executionNotArmed: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
  };
}

export class PersistentAprCrmLocalDraftPackages {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly preflight: PreflightContract) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-local-draft-packages");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLocalDraftPackagesState;
      return validState(value) ? value : initialState(now);
    } catch {
      return initialState(now);
    }
  }

  private write(state: AprCrmLocalDraftPackagesState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  private persistPackageArtifact(draftPackage: DraftPackage) {
    if (!/^[a-z0-9][a-z0-9._:-]{7,159}$/.test(draftPackage.customerKey)) throw new Error("crm_local_draft_package_customer_key_invalid");
    const packageArtifactPath = path.join(this.directory, "packages", `${draftPackage.customerKey}.json`);
    // `generatedAt` descrive l'istante della ricostruzione in memoria e cambia
    // a ogni heartbeat pur quando campi, fonti e workflow sono identici. Non fa
    // parte dell'artefatto di handoff: l'esecutore lo rigenerera' solo dopo un
    // futuro claim autorizzato. Escluderlo rende il checkpoint byte-idempotente.
    const { generatedAt: _volatileGeneratedAt, ...stablePayload } = draftPackage.payload;
    const stableDraftPackage = { ...draftPackage, payload: stablePayload };
    const contents = `${JSON.stringify(stableDraftPackage, null, 2)}\n`;
    const packageArtifactSha256 = createHash("sha256").update(contents).digest("hex");
    if (!existsSync(packageArtifactPath) || createHash("sha256").update(readFileSync(packageArtifactPath)).digest("hex") !== packageArtifactSha256) {
      atomicWrite(packageArtifactPath, contents);
    }
    return { packageArtifactPath, packageArtifactSha256 };
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  synchronize(now = new Date()) {
    const preflight = this.preflight.snapshot(now);
    if (preflight.status !== "completed") return this.initialize(now);

    const packages: AprCrmLocalDraftPackageSummary[] = [];
    try {
      for (const item of preflight.items.filter((candidate) => candidate.state === "ready_local_plan" && candidate.customerKey !== "beatrice-ciotta")) {
        const draftPackage = this.preflight.buildDraftExecutionPackage(item.customerKey, now);
        const artifact = this.persistPackageArtifact(draftPackage);
        packages.push(summarizePackage(item, draftPackage, artifact.packageArtifactPath, artifact.packageArtifactSha256));
      }
    } catch (error) {
      const current = this.initialize(now);
      const reason = `Verifica pacchetto locale fallita: ${error instanceof Error ? error.message : String(error)}`;
      const signature = sha256({ preflight: preflight.sourceFingerprint, revision: preflight.revision, reason });
      if (current.status === "technical_block" && current.sourceSignature === signature) return current;
      const next = structuredClone(current);
      next.revision += 1; next.status = "technical_block"; next.sourceSignature = signature; next.sourceFingerprint = preflight.sourceFingerprint;
      next.packages = []; next.residualCases = []; next.reason = reason; next.nextAction = "Correggere esclusivamente il costruttore locale; nessuna azione ENEA e' autorizzata.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", reason, appliedRuleIds: [...SYSTEM_RULE_IDS] });
      return this.write(next);
    }

    const residualCases = preflight.items.filter((item) => item.state === "blocked_case").map(classifyResidualPreflightCase);
    packages.sort((left, right) => left.customerKey.localeCompare(right.customerKey));
    residualCases.sort((left, right) => left.customerKey.localeCompare(right.customerKey));
    const sourceSignature = sha256({
      sourceFingerprint: preflight.sourceFingerprint,
      packages: packages.map(({ customerKey, packageFingerprint, packageArtifactSha256 }) => ({ customerKey, packageFingerprint, packageArtifactSha256 })),
      residualCases: residualCases.map(({ customerKey, classification, category, productModule, blockerCodes }) => ({ customerKey, classification, category, productModule, blockerCodes })),
    });
    const current = this.initialize(now);
    if (current.status === "completed" && current.sourceSignature === sourceSignature) return current;
    const next = structuredClone(current);
    next.revision += 1; next.status = "completed"; next.sourceSignature = sourceSignature; next.sourceFingerprint = preflight.sourceFingerprint;
    next.packages = packages; next.residualCases = residualCases;
    const unsupported = residualCases.filter((item) => item.classification === "unsupported_product_module").length;
    const operator = residualCases.filter((item) => item.classification === "operator_required").length;
    next.reason = `${packages.length} pacchetti locali verificati; ${unsupported} casi in moduli non implementati; ${operator} casi Richiesto intervento operatore.`;
    next.nextAction = "Consultare pacchetti e classificazioni in dashboard; ogni azione CRM/ENEA resta vietata.";
    const appliedRuleIds = [...new Set([...SYSTEM_RULE_IDS, ...residualCases.flatMap((item) => item.appliedRuleIds)])].filter((ruleId) => registryRule(ruleId));
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "packages_verified", reason: next.reason, appliedRuleIds });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return {
      ...state,
      progress: {
        verifiedPackages: state.packages.length,
        unsupportedModules: state.residualCases.filter((item) => item.classification === "unsupported_product_module").length,
        operatorRequired: state.residualCases.filter((item) => item.classification === "operator_required").length,
        total: state.packages.length + state.residualCases.length,
      },
      lastEvent: state.audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}
