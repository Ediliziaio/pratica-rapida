#!/usr/bin/env node
import path from "node:path";
import { PersistentAprLearningBaseline } from "./aprLearningBaseline";
const index = process.argv.indexOf("--state-dir");
if (index < 0 || !process.argv[index + 1]) throw new Error("apr_learning_baseline_state_dir_missing");
process.stdout.write(`${JSON.stringify(new PersistentAprLearningBaseline(path.resolve(process.argv[index + 1])).freeze(), null, 2)}\n`);
