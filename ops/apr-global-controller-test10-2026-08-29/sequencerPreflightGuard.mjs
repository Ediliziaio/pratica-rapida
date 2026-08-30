export function resolveCommonPreflightBlock(checkpoint, customerKey) {
  const item = checkpoint?.items?.find((candidate) => candidate.customerKey === customerKey);
  if (item?.state !== "blocked_case") return null;
  return Object.freeze({
    customerKey,
    state: "blocked_case",
    reason: item.reason ?? "Preflight comune bloccato senza motivazione leggibile.",
    blockerCodes: Object.freeze([...(item.blockers ?? item.blockerCodes ?? [])].map((blocker) =>
      typeof blocker === "string" ? blocker : blocker?.code,
    ).filter(Boolean)),
  });
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
