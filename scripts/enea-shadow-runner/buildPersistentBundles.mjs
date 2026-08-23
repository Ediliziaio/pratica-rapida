#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const outputDirectory = path.resolve(process.argv[2] ?? ".artifacts/apr-persistent-bundles");
mkdirSync(outputDirectory, { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["scripts/enea-shadow-runner/supervisor-cli.ts"],
  outfile: path.join(outputDirectory, "apr-supervisor.mjs"),
});

await build({
  ...common,
  entryPoints: ["scripts/enea-shadow-runner/apr-enea-worker-cli.ts"],
  outfile: path.join(outputDirectory, "apr-enea-worker.mjs"),
  // `ws` usa ancora require() per alcuni moduli Node. Il bundle ESM
  // persistente deve creare un require locale, altrimenti il LaunchAgent
  // termina prima di poter riprendere il checkpoint.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

await build({
  ...common,
  entryPoints: ["scripts/enea-shadow-runner/apr-watchdog-cli.ts"],
  outfile: path.join(outputDirectory, "apr-watchdog.mjs"),
});

process.stdout.write(`${JSON.stringify({ outputDirectory, bundles: ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] })}\n`);
