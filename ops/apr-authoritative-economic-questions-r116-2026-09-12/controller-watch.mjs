import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const controllerScreen = "apr_r116_target21_then_76";
const statePath = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-authoritative-economic-questions-r116-2026-09-12/runtime-orchestration/state.json";
const logPath = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-authoritative-economic-questions-r116-2026-09-12/runtime-orchestration/watch.log";
const ntfy = "https://ntfy.sh/apr-giuliano-x7q2m9";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
const phase = () => {
  try { return JSON.parse(readFileSync(statePath, "utf8")).phase ?? "unknown"; }
  catch { return "unknown"; }
};

log("monitor_started");
while (true) {
  const screens = spawnSync("/usr/bin/screen", ["-ls"], { encoding: "utf8" });
  if (`${screens.stdout ?? ""}${screens.stderr ?? ""}`.includes(`.${controllerScreen}`)) {
    await sleep(20_000);
    continue;
  }
  await sleep(5_000);
  const currentPhase = phase();
  if (["completed", "stopped_below_threshold", "controller_failed"].includes(currentPhase)) {
    log(`monitor_completed:${currentPhase}`);
    process.exit(0);
  }
  log(`controller_missing:${currentPhase}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try { await fetch(ntfy, { method: "POST", body: `ALLARME APR r116: processo controller scomparso durante la fase ${currentPhase}.`, signal: controller.signal }); }
  catch (error) { log(`alert_failed:${error instanceof Error ? error.message : String(error)}`); }
  finally { clearTimeout(timeout); }
  process.exit(2);
}

