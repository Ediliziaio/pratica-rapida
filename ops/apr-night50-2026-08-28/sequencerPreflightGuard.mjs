const screeningOnly = (blocker) => {
  const code = String(blocker?.code ?? "");
  const field = String(blocker?.field ?? blocker?.fieldId ?? "").toLowerCase();
  const reason = String(blocker?.reason ?? blocker?.message ?? "");
  return /^(?:screenings?|schermature?)(?:\.|$)/.test(field)
    || ["crm-source-not-screening", "screenings_missing", "screening_primary_measurements_missing", "screening-list-empty"].includes(code)
    || /^(?:missing|review)-schermature(?:\.|$)/.test(code)
    || /^(?:screening|persiana|avvolgibile|zanzariera)_/.test(code)
    || (/^invoice_[a-f0-9]{8}$/.test(code) && /nessuna riga di schermatura con dimensioni e gtot/i.test(reason));
};

export function resolveCommonPreflightBlock(checkpoint, customerKey, productModule = "screening") {
  const item = checkpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (item?.state !== "blocked_case") return null;
  const blockers = [...(item.report?.blockers ?? item.blockers ?? []), ...(item.report?.eneaPayloadAudit?.blockers ?? [])];
  const applicable = productModule === "infissi" ? blockers.filter((blocker) => !screeningOnly(blocker)) : blockers;
  if (productModule === "infissi" && blockers.length > 0 && applicable.length === 0) return null;
  return Object.freeze({
    customerKey,
    state: "blocked_case",
    reason: item.reason ?? "Preflight comune bloccato senza motivazione leggibile.",
    blockerCodes: Object.freeze([...(applicable.length ? applicable : item.blockerCodes ?? [])].map((blocker) =>
      typeof blocker === "string" ? blocker : blocker?.code,
    ).filter(Boolean)),
  });
}

export function resolveInfissiPreflightDisposition(commonCheckpoint, productCheckpoint, customerKey) {
  const productItem = productCheckpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (productCheckpoint?.status === "completed") {
    if (productItem) return Object.freeze({ kind: "product", item: productItem });
    const documentedNonInfissiBlock = resolveCommonPreflightBlock(commonCheckpoint, customerKey, "screening");
    if (documentedNonInfissiBlock) return Object.freeze({ kind: "common_block", block: documentedNonInfissiBlock });
    return Object.freeze({ kind: "inconsistent", reason: `${customerKey}:product_gate_missing_after_completed_infissi_preflight` });
  }
  const sharedBlock = resolveCommonPreflightBlock(commonCheckpoint, customerKey, "infissi");
  return sharedBlock ? Object.freeze({ kind: "common_block", block: sharedBlock }) : Object.freeze({ kind: "wait" });
}

export function buildPreflightWaitHeartbeat(item, gate, nowIso) {
  return Object.freeze({
    phase: "preflight_wait",
    phaseHeartbeatAt: nowIso,
    nextAction: `Attendere il completamento del gate ${gate} per ${item.displayName}.`,
    detail: Object.freeze({
      customerKey: item.customerKey,
      cohort: item.cohort,
      gate,
      phase: "preflight_wait",
      heartbeatAt: nowIso,
    }),
  });
}
