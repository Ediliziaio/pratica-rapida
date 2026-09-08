import crypto from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { APR_DECLARED_BUSINESS_DECISIONS, resolveDeclaredBusinessDecisions } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { APR_RULE_SOURCE_FINGERPRINT, APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

export const APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION = "apr-historical-business-decision-audit-v1" as const;

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

function filesBelow(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(target) : entry.name.endsWith(".jsonl") ? [target] : [];
  });
}

function directUserText(payload: unknown): string | null {
  const value = payload as { type?: string; role?: string; content?: Array<{ type?: string; text?: string }> };
  if (value?.type !== "message" || value.role !== "user") return null;
  let text = (value.content ?? []).filter((item) => item.type === "input_text").map((item) => item.text ?? "").join("\n").trim();
  if (text.includes("## My request:")) text = text.split("## My request:").at(-1)?.trim() ?? "";
  if (!text || text.startsWith("<heartbeat>") || text.startsWith("<codex_delegation>") || text.startsWith("<codex_internal_context") || text.startsWith("The following is the Codex agent history") || text.startsWith("<external_codex_apps_") || text.includes("<environment_context>") || text.includes("<recommended_plugins>")) return null;
  return text;
}

export async function inventoryHistoricalDecisionSources(input: { sessionsRoot: string; repositoryMarker?: string; additionalSourceFiles?: readonly string[] }) {
  const repositoryMarker = input.repositoryMarker ?? "pratica-rapida";
  const messageByHash = new Map<string, { timestamp: string; sourceFileIdentity: string }>();
  let eligibleSessionFiles = 0;
  for (const file of filesBelow(input.sessionsRoot).sort()) {
    const sourceFileIdentity = sha256(path.relative(input.sessionsRoot, file));
    let first = true;
    let eligible = false;
    for await (const line of readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      let record: { timestamp?: string; type?: string; payload?: unknown };
      try { record = JSON.parse(line) as typeof record; } catch { continue; }
      if (first) {
        first = false;
        eligible = record.type === "session_meta" && String((record.payload as { cwd?: string })?.cwd ?? "").includes(repositoryMarker);
        if (!eligible) break;
        eligibleSessionFiles += 1;
      }
      if (record.type !== "response_item") continue;
      const text = directUserText(record.payload);
      if (!text) continue;
      const messageHash = sha256(text);
      if (!messageByHash.has(messageHash)) messageByHash.set(messageHash, { timestamp: record.timestamp ?? "undated", sourceFileIdentity });
    }
  }
  const additionalSourceFiles = [...(input.additionalSourceFiles ?? [])].map((file) => path.resolve(file)).sort();
  let additionalSourceMessageCount = 0;
  const exactSourceReferences = new Set<string>();
  for (const file of additionalSourceFiles) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { messages?: Array<{ threadId?: string; messageId?: string; startedAt?: string; text?: string }> };
    for (const message of parsed.messages ?? []) {
      const text = String(message.text ?? "").trim();
      if (!text || !message.startedAt || !message.messageId) continue;
      const messageHash = sha256(text);
      const sourceFileIdentity = sha256(file);
      if (!messageByHash.has(messageHash)) messageByHash.set(messageHash, { timestamp: message.startedAt, sourceFileIdentity });
      exactSourceReferences.add(`chatgpt-thread:${message.threadId ?? "unknown"}:message:${message.messageId}`);
      exactSourceReferences.add(`chatgpt:${message.threadId ?? "unknown"}#${message.messageId}`);
      exactSourceReferences.add(String(message.messageId));
      additionalSourceMessageCount += 1;
    }
  }
  const messages = [...messageByHash.entries()].map(([messageHash, value]) => ({ messageHash, ...value })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    sessionsRoot: path.resolve(input.sessionsRoot),
    eligibleSessionFiles,
    additionalSourceFiles,
    additionalSourceMessageCount,
    uniqueDirectUserMessages: messages.length,
    availableFrom: messages.at(0)?.timestamp ?? null,
    availableTo: messages.at(-1)?.timestamp ?? null,
    sourceCorpusFingerprint: sha256(JSON.stringify(messages)),
    exactSourceReferences: [...exactSourceReferences].sort(),
    messageHashesByDate: Object.fromEntries([...new Set(messages.map((item) => item.timestamp.slice(0, 10)))].map((date) => [date, messages.filter((item) => item.timestamp.startsWith(date)).map((item) => item.messageHash)])),
  };
}

export function buildHistoricalBusinessDecisionAudit(input: {
  sourceInventory: Awaited<ReturnType<typeof inventoryHistoricalDecisionSources>>;
  provedMatrixKeys: ReadonlySet<string>;
  deploymentVerified: boolean;
  baselineBundleText: string;
  currentBundleText: string;
  generatedAt?: Date;
}) {
  const links = new Map<string, string[]>();
  for (const entry of APR_RULE_TEST_MATRIX) for (const ruleId of entry.registryRuleIds) links.set(ruleId, [...(links.get(ruleId) ?? []), entry.key]);
  const resolved = resolveDeclaredBusinessDecisions({ matrixLinks: links, provedMatrixKeys: input.provedMatrixKeys, deploymentVerified: input.deploymentVerified });
  const decisions = resolved.map((decision) => {
    const sourceDate = decision.source.receivedAt;
    const exactReferenceAvailable = input.sourceInventory.exactSourceReferences.includes(decision.source.reference);
    const datedSourceAvailable = sourceDate !== "undocumented" && Boolean(input.sourceInventory.messageHashesByDate[sourceDate]?.length);
    const sourceAvailable = exactReferenceAvailable || datedSourceAvailable;
    const baselineContained = decision.ruleIds.every((ruleId) => input.baselineBundleText.includes(ruleId));
    const currentContained = decision.ruleIds.every((ruleId) => input.currentBundleText.includes(ruleId));
    const recoveryStatus = decision.finalStatus === "superseded"
      ? "superseded"
      : decision.finalStatus !== "certified_deployed" || !currentContained || !sourceAvailable
        ? "unresolved_documented"
        : baselineContained ? "already_active" : "newly_activated_now";
    return { ...decision, sourceAvailable, sourceVerification: exactReferenceAvailable ? "exact_reference" as const : datedSourceAvailable ? "date_corpus" as const : "missing" as const, baselineContained, currentContained, recoveryStatus };
  });
  const unresolved = decisions.filter((item) => item.recoveryStatus === "unresolved_documented");
  return {
    version: APR_HISTORICAL_BUSINESS_DECISION_AUDIT_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    status: unresolved.length ? "incomplete" as const : "completed" as const,
    ruleSourceFingerprint: APR_RULE_SOURCE_FINGERPRINT,
    sourceCoverage: {
      ...input.sourceInventory,
      limitation: `Nessuna conversazione locale anteriore a ${input.sourceInventory.availableFrom ?? "fonte assente"}; una decisione mai documentata non puo essere enumerata ne ricostruita senza inventarla.`,
    },
    declaredDecisionCount: APR_DECLARED_BUSINESS_DECISIONS.length,
    activeDecisionCount: decisions.filter((item) => item.recoveryStatus === "already_active" || item.recoveryStatus === "newly_activated_now").length,
    alreadyActiveCount: decisions.filter((item) => item.recoveryStatus === "already_active").length,
    newlyActivatedNowCount: decisions.filter((item) => item.recoveryStatus === "newly_activated_now").length,
    supersededCount: decisions.filter((item) => item.recoveryStatus === "superseded").length,
    unresolvedDocumentedDecisionCount: unresolved.length,
    unrecoverableBecauseNeverDocumentedCount: 0,
    unrecoverableExplanation: "Per definizione non e possibile elencare una regola mai documentata in alcuna fonte. Il conteggio zero significa: nessuna lacuna identificabile nel corpus disponibile, non prova che conversazioni oggi indisponibili non siano mai esistite.",
    decisions,
  };
}

export function assertHistoricalBusinessDecisionAudit(report: ReturnType<typeof buildHistoricalBusinessDecisionAudit>) {
  if (report.status !== "completed" || report.unresolvedDocumentedDecisionCount !== 0) throw new Error("apr_historical_business_decision_audit_incomplete");
  if (report.ruleSourceFingerprint !== APR_RULE_SOURCE_FINGERPRINT || report.declaredDecisionCount !== APR_DECLARED_BUSINESS_DECISIONS.length) throw new Error("apr_historical_business_decision_audit_identity_mismatch");
  return report;
}
