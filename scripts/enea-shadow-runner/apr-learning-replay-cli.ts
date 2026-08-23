#!/usr/bin/env node
import { PersistentAprLearningReplay } from "./aprLearningReplay";
import { readFileSync } from "node:fs";
import type { AprDifferentialSnapshot } from "./aprDifferentialReport";
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const source = option("--source-state-dir"); const target = option("--target-state-dir"); const baselinePath = option("--baseline-snapshot"); const gitCommit = option("--git-commit");
if (!source || !target) throw new Error("apr_learning_replay_directories_missing");
if (!baselinePath || !gitCommit) throw new Error("apr_learning_replay_explicit_baseline_and_commit_required");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as AprDifferentialSnapshot;
const result = await new PersistentAprLearningReplay(source, target).run(new Date(), { baseline, gitCommit });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
