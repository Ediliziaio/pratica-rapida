import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runsDirectory } from "./paths.ts";

// Giro corrente di APR: il checkpoint in runs/*/checkpoint.json con updatedAt
// più recente. Le sue coorti sono apr-pilot-<cohort>-global-controller-<customerKey>,
// una per voce di results[]. Le domande delle coorti vecchie non sono del giro.
export interface RunCheckpoint {
  version?: string;
  status?: string;
  updatedAt?: string;
  results?: Array<{ cohort?: number | string; customerKey?: string }>;
}

export interface CurrentRun { runId: string; updatedAt: string; status: string | null; cohorts: string[] }

export const cohortDirectoryName = (cohort: number | string, customerKey: string) => `apr-pilot-${cohort}-global-controller-${customerKey}`;

// Pura: sceglie il run più recente e ne elenca le coorti.
export function selectCurrentRun(runs: ReadonlyArray<{ runId: string; checkpoint: RunCheckpoint | null }>): CurrentRun | null {
  let latest: { runId: string; checkpoint: RunCheckpoint } | null = null;
  for (const run of runs) {
    const updatedAt = run.checkpoint?.updatedAt;
    if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) continue;
    if (!latest || updatedAt.localeCompare(latest.checkpoint.updatedAt!) > 0) latest = { runId: run.runId, checkpoint: run.checkpoint! };
  }
  if (!latest) return null;
  const cohorts = (latest.checkpoint.results ?? [])
    .filter((result) => result.customerKey && result.cohort !== undefined && result.cohort !== null)
    .map((result) => cohortDirectoryName(result.cohort!, result.customerKey!));
  return { runId: latest.runId, updatedAt: latest.checkpoint.updatedAt!, status: latest.checkpoint.status ?? null, cohorts: [...new Set(cohorts)] };
}

export function readCurrentRun(root: string): CurrentRun | null {
  const runsDir = runsDirectory(root);
  if (!existsSync(runsDir)) return null;
  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(runsDir, entry.name, "checkpoint.json");
      let checkpoint: RunCheckpoint | null = null;
      if (existsSync(file)) { try { checkpoint = JSON.parse(readFileSync(file, "utf8")); } catch { checkpoint = null; } }
      return { runId: entry.name, checkpoint };
    });
  return selectCurrentRun(runs);
}
