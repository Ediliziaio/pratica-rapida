function comparable(observation) {
  return JSON.stringify({ entry: observation?.entry ?? null, verified: observation?.verified ?? false });
}

export function classifyQuiescentCaseTruth(observation) {
  const entry = observation?.entry ?? null;
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
    if (comparable(previous) === comparable(current)) return classifyQuiescentCaseTruth(current);
    previous = current;
  }
  throw new Error("apr_case_finalizer_truth_not_stable_after_quiescence");
}
