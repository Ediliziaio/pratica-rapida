function comparable(observation) {
  return JSON.stringify({ entry: observation?.entry ?? null, verified: observation?.verified ?? false });
}

export function classifyQuiescentCaseTruth(observation) {
  const entry = observation?.entry ?? null;
  const uncertainStatus = entry?.uncertainPageSave?.status ?? null;
  if ((entry?.state === "operator_intervention" && uncertainStatus === "probing")
    || (entry?.state === "recovery_queued" && ["recovery_authorized", "resolved_saved"].includes(uncertainStatus))) {
    return { kind: "unresolved", entry };
  }
  if (entry?.state === "saved"
    && entry.completedPageIds?.length === entry.expectedPageIds?.length
    && observation?.verified === true) return { kind: "saved", entry };
  if (entry && ["operator_intervention", "technical_block"].includes(entry.state)) return { kind: "case_block", entry };
  return { kind: "unresolved", entry: entry ?? { reason: "Stato finale non determinato dopo la quiescenza reale del worker." } };
}

export async function settleCaseTruthAfterWorkerQuiescence(input) {
  await input.stopWorkerServices();
  const deadline = Date.now() + (input.quiescenceTimeoutMs ?? 15_000);
  while (input.workerServicesActive()) {
    if (Date.now() >= deadline) throw new Error("apr_case_finalizer_worker_not_quiescent");
    await input.wait(100);
  }

  let previous = input.readObservation();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await input.wait(input.stabilityIntervalMs ?? 250);
    const current = input.readObservation();
    if (comparable(previous) === comparable(current)) {
      const truth = classifyQuiescentCaseTruth(current);
      const terminalTruth = { ...truth, verified: current?.verified === true };
      await input.publishTerminalTruth?.(terminalTruth);
      return terminalTruth;
    }
    previous = current;
  }
  throw new Error("apr_case_finalizer_truth_not_stable_after_quiescence");
}

export async function settleCaseTruthWhileWorkerContinues(input) {
  let previous = input.readObservation();
  while (true) {
    await input.wait(input.stabilityIntervalMs ?? 250);
    const current = input.readObservation();
    if (comparable(previous) === comparable(current)) {
      const truth = classifyQuiescentCaseTruth(current);
      if (truth.kind === "unresolved") {
        await input.onUnresolved?.(truth);
        previous = current;
        continue;
      }
      const terminalTruth = { ...truth, verified: current?.verified === true };
      await input.publishTerminalTruth?.(terminalTruth);
      return terminalTruth;
    }
    previous = current;
  }
}
