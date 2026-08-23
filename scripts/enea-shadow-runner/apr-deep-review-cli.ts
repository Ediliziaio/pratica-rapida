#!/usr/bin/env node
import path from "node:path";
import { PersistentAprDeepCaseReview } from "./deepCaseReview";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const command = process.argv[2] ?? "status";
const review = new PersistentAprDeepCaseReview(rootDirectory);
const result = command === "run" ? review.runToCompletion() : command === "tick" ? review.tick() : review.snapshot();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
