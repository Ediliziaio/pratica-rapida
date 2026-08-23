#!/usr/bin/env node
import path from "node:path";
import { PersistentEneaRunner, RunnerBusyError, RunnerReadinessBlockedError } from "./runner";
import { supervise } from "./supervisor";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const ownerId = option("--owner") ?? `runner-${process.pid}-${crypto.randomUUID()}`;
const runner = new PersistentEneaRunner(rootDirectory);

function print(state = runner.load()) {
  process.stdout.write(`${JSON.stringify(supervise(state), null, 2)}\n`);
}

try {
  if (command === "init") {
    print(runner.initialize());
  } else if (command === "run") {
    runner.initialize();
    let state = runner.start(ownerId, option("--command-id") ?? `run:${crypto.randomUUID()}`);
    let cycle = 0;
    while (state.runner.status === "running") {
      state = runner.tick(ownerId, `cycle:${ownerId}:${cycle++}`);
      if (cycle > state.queue.length * 4 + 10) throw new Error("Guardia cicli attivata: runner fermato senza avanzare oltre il limite locale.");
    }
    print(state);
  } else if (command === "tick") {
    print(runner.tick(ownerId, option("--command-id") ?? `tick:${crypto.randomUUID()}`));
  } else if (command === "stop") {
    print(runner.stop(ownerId, option("--command-id") ?? `stop:${crypto.randomUUID()}`));
  } else if (command === "status") {
    print();
  } else {
    throw new Error("Comando non valido. Usare: init, run, tick, stop, status.");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof RunnerReadinessBlockedError ? "RUNNER_READINESS_BLOCKED"
    : error instanceof RunnerBusyError ? "RUNNER_BUSY" : "RUNNER_ERROR";
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
}
