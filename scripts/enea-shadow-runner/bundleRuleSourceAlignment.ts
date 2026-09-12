import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION = "apr-bundle-rule-source-alignment-v1" as const;

/**
 * Il supervisore per coorte esegue una copia installata del bundle, che porta
 * dentro di se' una fotografia congelata del registro regole. Il sequencer
 * esegue i CLI dal sorgente corrente, quindi vede il registro vivo. Entrambi
 * scrivono lo stesso checkpoint e vi timbrano un marcatore di convergenza
 * derivato dal contenuto del registro (AUTO_CURRENT_VALIDATION_REVISION):
 * quando le due fotografie divergono, ciascuno considera mancante il
 * marcatore dell'altro e riscrive il checkpoint all'infinito, finche' il
 * watchdog non uccide una pratica sana.
 *
 * La divergenza e' gia' dichiarata: l'attestazione del bundle riporta il
 * fingerprint del registro con cui e' stato costruito. Confrontarlo con il
 * sorgente e' sufficiente a riconoscere la condizione prima di partire,
 * invece di scoprirla come timeout su una pratica per volta.
 */
export interface AprBundleRuleSourceAlignment {
  version: typeof APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION;
  aligned: boolean;
  sourceRuleFingerprint: string;
  bundleRuleFingerprint: string | null;
  bundlePath: string;
  reason: string;
}

export function resolveAprBundleRuleSourceAlignment(bundlePath: string): AprBundleRuleSourceAlignment {
  const attestationPath = path.join(path.resolve(bundlePath), "apr-rule-governance-attestation.json");
  const base = {
    version: APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION,
    sourceRuleFingerprint: ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH,
    bundlePath: path.resolve(bundlePath),
  } as const;
  if (!existsSync(attestationPath)) {
    return { ...base, aligned: false, bundleRuleFingerprint: null, reason: "Il bundle installato non dichiara alcun fingerprint del registro: impossibile stabilire se supervisore e sequencer applicano le stesse regole." };
  }
  let bundleRuleFingerprint: string | null = null;
  try {
    const attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as { ruleSourceFingerprint?: unknown };
    bundleRuleFingerprint = typeof attestation.ruleSourceFingerprint === "string" ? attestation.ruleSourceFingerprint : null;
  } catch {
    bundleRuleFingerprint = null;
  }
  if (!bundleRuleFingerprint) {
    return { ...base, aligned: false, bundleRuleFingerprint: null, reason: "Attestazione del bundle illeggibile o priva di ruleSourceFingerprint." };
  }
  if (bundleRuleFingerprint !== ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH) {
    return { ...base, aligned: false, bundleRuleFingerprint, reason: `Il bundle installato porta il registro ${bundleRuleFingerprint.slice(0, 16)} mentre il sorgente e' ${ENEA_OPERATIONAL_REGISTRY_CONTENT_HASH.slice(0, 16)}: supervisore e sequencer si contenderebbero lo stesso checkpoint con marcatori diversi.` };
  }
  return { ...base, aligned: true, bundleRuleFingerprint, reason: "Bundle installato e sorgente applicano lo stesso registro regole." };
}
