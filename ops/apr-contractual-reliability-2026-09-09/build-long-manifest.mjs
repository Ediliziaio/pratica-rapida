import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const originalPath = path.join(root, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const targetedPath = path.join(root, "ops/apr-contractual-reliability-2026-09-09/manifest-targeted-r100.json");
const r99ReportPath = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-r99-governed-20260909/report.json";
const outputPath = path.join(root, "ops/apr-contractual-reliability-2026-09-09/manifest-long-r101.json");
const hashPath = `${outputPath}.sha256`;

const original = JSON.parse(readFileSync(originalPath, "utf8"));
const targeted = JSON.parse(readFileSync(targetedPath, "utf8"));
const r99 = JSON.parse(readFileSync(r99ReportPath, "utf8"));

// Il perimetro concordato nasce dai primi 94 casi osservati nel report r99;
// Fabrizio Pelizzari (95) sostituisce il caso interno Smaj escluso fail-closed.
const admittedOrdinals = new Set(Array.from({ length: 95 }, (_, index) => index + 1));
const excluded = new Set([
  // Fattura materialmente assente, verificata manualmente.
  "filippo-bigalli",
  "alessandro-zaniboni",
  "rocco-giacotto",
  "paolino-bellini",
  "gabriele-girelli",
  // Procedibilita oltre termine.
  "ida-gigliotti",
  "vito-fusillo",
  "caterina-claudia-garbato",
  // Linea Sole Potito: lavorazione manuale prevista.
  "riccardo-coda",
  "diego-mario-mocenighi",
  "liliana-gloria",
  "elena-marcella-berti",
  // Esclusioni permanenti o casi interni.
  "massimiliano-montemorra",
  "prova-rivenditore-1-30-04",
  "smaj-hhhhh",
]);

const eligible = original.cases.filter((item, index) => admittedOrdinals.has(index + 1) && !excluded.has(item.customerKey));
if (eligible.length !== 80) throw new Error(`contractual_denominator_not_80:${eligible.length}`);

const eligibleKeys = new Set(eligible.map((item) => item.customerKey));
const targetedKeys = new Set(targeted.cases.map((item) => item.customerKey));
for (const key of targetedKeys) if (!eligibleKeys.has(key)) throw new Error(`targeted_not_in_denominator:${key}`);

const historicalSavedKeys = new Set(
  r99.cases
    .slice(0, 94)
    .filter((item) => item.state === "saved" && eligibleKeys.has(item.customerKey) && !targetedKeys.has(item.customerKey))
    .map((item) => item.customerKey),
);
if (historicalSavedKeys.size !== 31) throw new Error(`historical_saved_not_31:${historicalSavedKeys.size}`);

const remaining = eligible.filter((item) => !targetedKeys.has(item.customerKey));
if (remaining.length !== 63) throw new Error(`remaining_not_63:${remaining.length}`);
const historicalFirst = remaining.filter((item) => historicalSavedKeys.has(item.customerKey));
const remainingOther = remaining.filter((item) => !historicalSavedKeys.has(item.customerKey));
const ordered = [...historicalFirst, ...remainingOther];
if (new Set(ordered.map((item) => item.practiceId)).size !== 63) throw new Error("remaining_practice_identity_not_unique");

const manifest = {
  ...original,
  version: "apr-contractual-reliability-long-r101-v1",
  authorizationId: "user-authorized-r101-contractual-long-replay-2026-09-09",
  authorizedAt: "2026-09-09",
  selection: {
    ...original.selection,
    total: 63,
    sourceTotal: 100,
    contractualDenominator: 80,
    targetedCompletedFirst: 17,
    historicalSavedFirst: 31,
    remainingOther: 32,
    excludedCustomerKeys: [...excluded],
    ordering: "31_historical_saved_then_32_remaining",
    selectionRule: "80 contractual cases = original ordinals 1-95, replacing excluded internal Smaj with ordinal 95 Fabrizio Pelizzari; minus 17 targeted cases",
  },
  cases: ordered.map((item, index) => ({
    ...item,
    cohort: index + 1,
    group: historicalSavedKeys.has(item.customerKey) ? "historical_saved_regression" : "remaining_contractual",
  })),
};

const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(outputPath, bytes);
writeFileSync(hashPath, `${sha256}  ${path.basename(outputPath)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, sha256, total: ordered.length, historicalSavedFirst: historicalFirst.length, remainingOther: remainingOther.length })}\n`);
