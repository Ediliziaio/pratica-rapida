import { describe, expect, it } from "vitest";
import { loadedAprCohortServiceLabels, quiescePreviousAprCohorts, runningAprCohortProcesses } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerCohortIsolation.mjs";

describe("isolamento completo delle esecuzioni APR", () => {
  it("riconosce soltanto i servizi delle coorti e preserva il supervisore principale", () => {
    const output = `123 0 com.praticarapida.apr-enea-cohort300-worker\n456 0 com.praticarapida.enea-shadow-supervisor\n789 0 com.praticarapida.apr-enea-cohort301-watchdog`;
    expect(loadedAprCohortServiceLabels(output)).toEqual([
      "com.praticarapida.apr-enea-cohort300-worker",
      "com.praticarapida.apr-enea-cohort301-watchdog",
    ]);
  });

  it("spegne ogni vecchia coorte prima di partire e si rifiuta di avviare se un processo resiste", async () => {
    let labels = "1 0 com.praticarapida.apr-enea-cohort300-worker";
    let processes = "101 /usr/local/bin/node /runtime/cohorts/apr-pilot-300-old/install/apr-enea-worker.mjs serve";
    const bootedOut: string[] = [];
    const terminated: number[] = [];

    await expect(quiescePreviousAprCohorts({
      launchctlDomain: () => labels,
      processList: () => processes,
      bootout: (label: string) => { bootedOut.push(label); labels = ""; },
      terminate: (pid: number) => { terminated.push(pid); },
      wait: async () => {},
    })).rejects.toThrow(/apr_previous_cohort_services_still_active/);
    expect(bootedOut).toEqual(["com.praticarapida.apr-enea-cohort300-worker"]);
    expect(terminated).toEqual([101]);

    processes = "";
    await expect(quiescePreviousAprCohorts({ launchctlDomain: () => labels, processList: () => processes, bootout: () => {}, terminate: () => {}, wait: async () => {} })).resolves.toMatchObject({ stopped: true });
  });

  it("consente esclusivamente il supervisore della coorte corrente durante il preflight", async () => {
    const current = "/cohorts/apr-pilot-400-current";
    const ps = `201 /usr/local/bin/node ${current}/install/apr-supervisor.mjs serve\n202 /usr/local/bin/node /cohorts/apr-pilot-399-old/install/apr-watchdog.mjs serve`;
    expect(runningAprCohortProcesses(ps)).toHaveLength(2);
    const terminated: number[] = [];
    let calls = 0;
    await expect(quiescePreviousAprCohorts({
      launchctlDomain: () => "",
      processList: () => calls++ < 2 ? ps : `201 /usr/local/bin/node ${current}/install/apr-supervisor.mjs serve`,
      allowProcess: (entry: { command: string }) => entry.command.includes(current) && entry.command.includes("apr-supervisor.mjs"),
      bootout: () => {}, terminate: (pid: number) => terminated.push(pid), wait: async () => {},
    })).resolves.toMatchObject({ stopped: true });
    expect(terminated).toEqual([202]);
  });
});
