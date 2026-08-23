#!/usr/bin/env node
import { PersistentAprLearningReplay } from "./aprLearningReplay";
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const source = option("--source-state-dir"); const target = option("--target-state-dir");
if (!source || !target) throw new Error("apr_learning_replay_directories_missing");
const result = await new PersistentAprLearningReplay(source, target).run();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
