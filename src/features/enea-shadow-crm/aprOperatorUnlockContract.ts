import { createHash } from "node:crypto";

export const APR_OPERATOR_UNLOCK_CONTRACT_VERSION = "apr-operator-unlock-contract-v1" as const;

export type AprOperatorBlockCategory =
  | "portal_field"
  | "business_precondition"
  | "source_missing"
  | "source_conflict"
  | "technical_recovery"
  | "legacy_unclassified";

export type AprOperatorBlockStage = "preflight" | "draft_execution" | "server_verification" | "unknown";
export type AprOperatorResumePolicy = "resume_existing_draft" | "recompute_before_draft";
export type AprOperatorBlockStatus = "open" | "answered" | "verified" | "consumed" | "superseded" | "rejected";

export interface AprSingleCaseOperatorScope {
  kind: "single_practice_generation";
  practiceId: string;
  customerKey: string;
  generationId: string;
  propagation: "forbidden";
}

export interface AprOperatorAnswerSchema {
  kind: "controlled_choice" | "text" | "portal_correction_verification";
  choices: ReadonlyArray<{ value: string; label: string }>;
  noteRequired: boolean;
}

export interface AprOperatorBlockDescriptor {
  contractVersion: typeof APR_OPERATOR_UNLOCK_CONTRACT_VERSION;
  blockId: string;
  idempotencyKey: string;
  scope: AprSingleCaseOperatorScope;
  category: AprOperatorBlockCategory;
  code: string;
  stage: AprOperatorBlockStage;
  fieldPath: string;
  draftId: string | null;
  pageId: string | null;
  portalFieldId: string | null;
  reason: string;
  question: string;
  evidenceText: string;
  sourceIds: readonly string[];
  ruleIds: readonly string[];
  resumePolicy: AprOperatorResumePolicy;
  answerSchema: AprOperatorAnswerSchema;
  status: AprOperatorBlockStatus;
  createdAt: string;
  answeredAt: string | null;
  verifiedAt: string | null;
  consumedAt: string | null;
}

export interface CreateAprOperatorBlockInput {
  blockId: string;
  practiceId: string;
  customerKey: string;
  generationId: string;
  category: AprOperatorBlockCategory;
  code: string;
  stage: AprOperatorBlockStage;
  fieldPath: string;
  draftId?: string | null;
  pageId?: string | null;
  portalFieldId?: string | null;
  reason: string;
  question: string;
  evidenceText: string;
  sourceIds: readonly string[];
  ruleIds: readonly string[];
  resumePolicy: AprOperatorResumePolicy;
  answerSchema: AprOperatorAnswerSchema;
  createdAt: string;
}

const nonEmpty = (value: string) => value.trim().length > 0;
const normalizedStrings = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export function isAprOperatorBlockDescriptor(value: unknown): value is AprOperatorBlockDescriptor {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AprOperatorBlockDescriptor>;
  const scope = item.scope as Partial<AprSingleCaseOperatorScope> | undefined;
  return item.contractVersion === APR_OPERATOR_UNLOCK_CONTRACT_VERSION
    && typeof item.blockId === "string" && nonEmpty(item.blockId)
    && typeof item.idempotencyKey === "string" && nonEmpty(item.idempotencyKey)
    && scope?.kind === "single_practice_generation"
    && typeof scope.practiceId === "string" && nonEmpty(scope.practiceId)
    && typeof scope.customerKey === "string" && nonEmpty(scope.customerKey)
    && typeof scope.generationId === "string" && nonEmpty(scope.generationId)
    && scope.propagation === "forbidden"
    && (["portal_field", "business_precondition", "source_missing", "source_conflict", "technical_recovery", "legacy_unclassified"] as unknown[]).includes(item.category)
    && typeof item.code === "string" && nonEmpty(item.code)
    && (["preflight", "draft_execution", "server_verification", "unknown"] as unknown[]).includes(item.stage)
    && typeof item.fieldPath === "string" && nonEmpty(item.fieldPath)
    && typeof item.reason === "string" && nonEmpty(item.reason)
    && typeof item.question === "string" && nonEmpty(item.question)
    && typeof item.evidenceText === "string" && nonEmpty(item.evidenceText)
    && Array.isArray(item.sourceIds) && item.sourceIds.length > 0 && item.sourceIds.every((entry) => typeof entry === "string" && nonEmpty(entry))
    && Array.isArray(item.ruleIds) && item.ruleIds.length > 0 && item.ruleIds.every((entry) => typeof entry === "string" && nonEmpty(entry))
    && (["resume_existing_draft", "recompute_before_draft"] as unknown[]).includes(item.resumePolicy)
    && Boolean(item.answerSchema) && (["controlled_choice", "text", "portal_correction_verification"] as unknown[]).includes(item.answerSchema?.kind)
    && Array.isArray(item.answerSchema?.choices)
    && typeof item.answerSchema?.noteRequired === "boolean"
    && (["open", "answered", "verified", "consumed", "superseded", "rejected"] as unknown[]).includes(item.status)
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt));
}

export function createAprOperatorBlockDescriptor(input: CreateAprOperatorBlockInput): AprOperatorBlockDescriptor {
  const sourceIds = normalizedStrings(input.sourceIds);
  const ruleIds = normalizedStrings(input.ruleIds);
  const descriptor: AprOperatorBlockDescriptor = {
    contractVersion: APR_OPERATOR_UNLOCK_CONTRACT_VERSION,
    blockId: input.blockId.trim(),
    idempotencyKey: `operator-unlock:${createHash("sha256").update(JSON.stringify({ blockId: input.blockId.trim(), practiceId: input.practiceId.trim(), customerKey: input.customerKey.trim(), generationId: input.generationId.trim() })).digest("hex")}`,
    scope: {
      kind: "single_practice_generation",
      practiceId: input.practiceId.trim(),
      customerKey: input.customerKey.trim(),
      generationId: input.generationId.trim(),
      propagation: "forbidden",
    },
    category: input.category,
    code: input.code.trim(),
    stage: input.stage,
    fieldPath: input.fieldPath.trim(),
    draftId: input.draftId?.trim() || null,
    pageId: input.pageId?.trim() || null,
    portalFieldId: input.portalFieldId?.trim() || null,
    reason: input.reason.trim(),
    question: input.question.trim(),
    evidenceText: input.evidenceText.trim(),
    sourceIds,
    ruleIds,
    resumePolicy: input.resumePolicy,
    answerSchema: {
      kind: input.answerSchema.kind,
      choices: input.answerSchema.choices.map((choice) => ({ value: choice.value.trim(), label: choice.label.trim() })),
      noteRequired: input.answerSchema.noteRequired,
    },
    status: "open",
    createdAt: input.createdAt,
    answeredAt: null,
    verifiedAt: null,
    consumedAt: null,
  };
  if (!isAprOperatorBlockDescriptor(descriptor)) throw new Error("apr_operator_block_descriptor_invalid");
  return Object.freeze({ ...descriptor, scope: Object.freeze({ ...descriptor.scope }), sourceIds: Object.freeze([...descriptor.sourceIds]), ruleIds: Object.freeze([...descriptor.ruleIds]), answerSchema: Object.freeze({ ...descriptor.answerSchema, choices: Object.freeze(descriptor.answerSchema.choices.map((choice) => Object.freeze({ ...choice }))) }) });
}

export function operatorEvidenceAppliesToCase(
  descriptor: AprOperatorBlockDescriptor,
  identity: { practiceId: string; customerKey: string; generationId: string },
) {
  return descriptor.scope.propagation === "forbidden"
    && descriptor.scope.practiceId === identity.practiceId
    && descriptor.scope.customerKey === identity.customerKey
    && descriptor.scope.generationId === identity.generationId;
}

export function migrateLegacyOperatorRequest(input: {
  requestId: string;
  field: string;
  reason: string;
  question: string;
  evidenceText: string;
  sourceIds: readonly string[];
  choices: Array<{ value: string; label: string }>;
}, context: { practiceId: string; customerKey: string; generationId: string; createdAt: string; ruleIds: readonly string[] }) {
  return createAprOperatorBlockDescriptor({
    blockId: input.requestId,
    practiceId: context.practiceId,
    customerKey: context.customerKey,
    generationId: context.generationId,
    category: "legacy_unclassified",
    code: "legacy_operator_request",
    stage: "unknown",
    fieldPath: input.field,
    reason: input.reason,
    question: input.question,
    evidenceText: input.evidenceText,
    sourceIds: input.sourceIds,
    ruleIds: context.ruleIds,
    resumePolicy: "recompute_before_draft",
    answerSchema: { kind: input.choices.length ? "controlled_choice" : "text", choices: input.choices, noteRequired: true },
    createdAt: context.createdAt,
  });
}
