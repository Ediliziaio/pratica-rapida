import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_SOURCE_FINGERPRINT } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

export const APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION = "apr-bundle-rule-source-alignment-v2" as const;

/**
 * Il supervisore per coorte esegue una copia installata del bundle, che porta
 * dentro di se' una fotografia congelata del registro regole. Il sequencer
 * esegue i CLI dal sorgente corrente, quindi vede il registro vivo. Entrambi
 * scrivono lo stesso checkpoint e vi timbrano un marcatore di convergenza.
 *
 * Finche' il marcatore e' derivato dal contenuto del registro, le due
 * fotografie non possono coincidere se non nell'istante della build: ogni
 * regola aggiunta allontana i due scrittori, ciascuno considera mancante il
 * marcatore dell'altro e riscrive il checkpoint, finche' il watchdog uccide
 * una pratica sana (Buracchi, 2026-09-13). Piu' regole si scrivono, peggio va.
 *
 * Decisione del titolare (2026-09-13): comanda il bundle installato. Il
 * marcatore non si calcola piu' dal registro che il processo si trova in
 * mano, ma si legge dall'attestazione che il bundle installato porta con se':
 * un fatto osservabile identico per entrambi gli scrittori, che cambia
 * soltanto quando si installa un bundle nuovo.
 */
export interface AprBundleRuleSourceAlignment {
  version: typeof APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION;
  aligned: boolean;
  sourceRuleFingerprint: string;
  bundleRuleFingerprint: string | null;
  bundlePath: string;
  reason: string;
}

function readBundleRuleFingerprint(bundlePath: string): string | null {
  const attestationPath = path.join(path.resolve(bundlePath), "apr-rule-governance-attestation.json");
  if (!existsSync(attestationPath)) return null;
  try {
    const attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as { ruleSourceFingerprint?: unknown };
    return typeof attestation.ruleSourceFingerprint === "string" && attestation.ruleSourceFingerprint.trim()
      ? attestation.ruleSourceFingerprint
      : null;
  } catch {
    return null;
  }
}

/**
 * Marcatore di convergenza da timbrare sui checkpoint: deriva dal bundle che
 * governa davvero l'esecuzione, non dal registro del processo chiamante.
 */
export function resolveAprGoverningValidationRevision(bundlePath: string): string {
  const fingerprint = readBundleRuleFingerprint(bundlePath);
  if (!fingerprint) throw new Error("apr_governing_bundle_rule_fingerprint_unavailable");
  return `auto-registry-${fingerprint}`;
}

export function resolveAprBundleRuleSourceAlignment(bundlePath: string): AprBundleRuleSourceAlignment {
  const base = {
    version: APR_BUNDLE_RULE_SOURCE_ALIGNMENT_VERSION,
    sourceRuleFingerprint: APR_RULE_SOURCE_FINGERPRINT,
    bundlePath: path.resolve(bundlePath),
  } as const;
  const bundleRuleFingerprint = readBundleRuleFingerprint(bundlePath);
  if (!bundleRuleFingerprint) {
    return { ...base, aligned: false, bundleRuleFingerprint: null, reason: "Il bundle installato non dichiara alcun fingerprint del registro: impossibile stabilire quali regole governino l'esecuzione." };
  }
  if (bundleRuleFingerprint !== APR_RULE_SOURCE_FINGERPRINT) {
    return {
      ...base,
      aligned: false,
      bundleRuleFingerprint,
      reason: `Il bundle installato applica il registro ${bundleRuleFingerprint.slice(0, 16)}, il sorgente e' a ${APR_RULE_SOURCE_FINGERPRINT.slice(0, 16)}: le regole scritte dopo la build del bundle non verrebbero applicate. Ricostruire e installare il bundle prima di avviare il lotto.`,
    };
  }
  return { ...base, aligned: true, bundleRuleFingerprint, reason: "Bundle installato e sorgente applicano lo stesso registro regole." };
}

/** Fermarsi qui costa un messaggio; scoprirlo dopo costa sette minuti per pratica sana. */
export function assertAprBundleRuleSourceAlignment(bundlePath: string): AprBundleRuleSourceAlignment {
  const alignment = resolveAprBundleRuleSourceAlignment(bundlePath);
  if (!alignment.aligned) throw new Error(`apr_bundle_rule_source_divergence:${alignment.reason}`);
  return alignment;
}
