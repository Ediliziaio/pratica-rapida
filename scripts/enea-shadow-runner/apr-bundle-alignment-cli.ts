import { resolveAprBundleRuleSourceAlignment } from "./bundleRuleSourceAlignment";

/**
 * Guardia da eseguire una volta prima di avviare un lotto: se il bundle
 * installato e il sorgente non applicano lo stesso registro, il lotto non
 * deve partire. Scoprirlo qui costa un messaggio; scoprirlo dopo costa sette
 * minuti di watchdog per ogni pratica sana.
 */
const bundlePath = process.argv[2] ?? process.env.APR_CANONICAL_BUNDLES;
if (!bundlePath?.trim()) {
  process.stderr.write("apr_bundle_alignment_bundle_path_required\n");
  process.exit(2);
}

const alignment = resolveAprBundleRuleSourceAlignment(bundlePath);
process.stdout.write(`${JSON.stringify(alignment, null, 2)}\n`);
if (!alignment.aligned) {
  process.stderr.write(`ALLARME: ${alignment.reason}\n`);
  process.exit(3);
}
