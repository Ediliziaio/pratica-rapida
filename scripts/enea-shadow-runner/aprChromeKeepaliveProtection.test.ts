import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APR_CHROME_KEEPALIVE_PROTECTION_RULE_ID,
  assertAprCohortServiceMayStop,
  classifyStoppableAprCohortProcess,
  isAprEneaChromeKeepaliveProcess,
  protectedCohortBootout,
  protectedCohortTerminate,
} from "./aprChromeKeepaliveProtection.mjs";
import { quiescePreviousAprCohorts } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerCohortIsolation.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9331 --user-data-dir=/Users/test/.apr-enea-profile";
const worker = "/usr/local/bin/node /runtime/apr-pilot-600-case/install/apr-enea-worker.mjs serve";

describe("Chrome APR persistente non e' un target arrestabile", () => {
  it("riconosce l'identita' Chrome CDP e rifiuta fail-closed ogni segnale diretto", () => {
    expect(APR_CHROME_KEEPALIVE_PROTECTION_RULE_ID).toBe("system-apr-chrome-keepalive-immortal-v1");
    expect(isAprEneaChromeKeepaliveProcess(chrome)).toBe(true);
    expect(() => classifyStoppableAprCohortProcess(9001, chrome)).toThrow("apr_chrome_keepalive_process_is_immortal:9001");
    expect(() => protectedCohortTerminate({ pid: 9001, command: chrome }, () => { throw new Error("unreachable"); })).toThrow("apr_chrome_keepalive_process_is_immortal:9001");
  });

  it("limita bootout e terminate ai soli ruoli di coorte dichiarati", () => {
    expect(() => assertAprCohortServiceMayStop("com.praticarapida.apr-enea-cohort600-worker")).not.toThrow();
    expect(() => assertAprCohortServiceMayStop("com.praticarapida.apr-enea-chrome-keepalive")).toThrow(/refused_service_stop/);
    expect(() => classifyStoppableAprCohortProcess(7001, worker)).not.toThrow();
    expect(() => classifyStoppableAprCohortProcess(7002, "/usr/local/bin/node unrelated.mjs")).toThrow(/refused_process_stop/);
  });

  it("quiescenza, arresto finale e residui non includono mai Chrome", async () => {
    let domain = "1 0 com.praticarapida.apr-enea-cohort600-worker";
    let ps = `7001 ${worker}\n9001 ${chrome}`;
    const bootouts: string[] = [];
    const signals: number[] = [];
    let observation = 0;
    await expect(quiescePreviousAprCohorts({
      launchctlDomain: () => domain,
      processList: () => observation++ < 2 ? ps : `9001 ${chrome}`,
      bootout: (label: string) => { bootouts.push(label); domain = ""; },
      terminate: (pid: number) => { signals.push(pid); ps = `9001 ${chrome}`; },
      wait: async () => {},
    })).resolves.toMatchObject({ stopped: true });
    expect(bootouts).toEqual(["com.praticarapida.apr-enea-cohort600-worker"]);
    expect(signals).toEqual([7001]);
  });

  it("l'audit statico vieta kill nel metodo operativo stop e impone detach+unref", () => {
    const cdp = readFileSync(path.join(root, "scripts/enea-shadow-runner/cdpClient.ts"), "utf8");
    const stopBody = cdp.slice(cdp.indexOf("async stop()"), cdp.indexOf("async disposeEphemeralFixtureForTest()"));
    expect(stopBody).not.toMatch(/\.kill\(|SIGTERM|SIGKILL/);
    expect(cdp).toContain('detached: true');
    expect(cdp).toContain("this.child.unref()");
    expect(cdp).toContain('if (!this.options.headless) throw new Error("apr_persistent_chrome_process_is_immortal")');
  });

  it("l'audit statico obbliga ogni arresto del sequencer a passare dalla policy centrale", () => {
    const sequencer = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs"), "utf8");
    const legacySequencer = readFileSync(path.join(root, "ops/apr-night50-2026-08-28/sequencer.mjs"), "utf8");
    const isolation = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerCohortIsolation.mjs"), "utf8");
    expect(sequencer).toContain("protectedCohortBootout(label");
    expect(legacySequencer).toContain("protectedCohortBootout(label");
    expect(isolation).toContain("protectedCohortTerminate(process, input.terminate)");
    expect(isolation).not.toMatch(/input\.terminate\(process\.pid\)/);
    expect(() => protectedCohortBootout("com.praticarapida.apr-enea-chrome-keepalive", () => {})).toThrow(/refused_service_stop/);
  });
});
