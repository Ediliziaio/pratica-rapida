import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveAprDocumentedProductRouting } from "../../src/features/enea-shadow-crm/documentedProductRouting";

const root = path.resolve(process.argv[2] ?? "");
if (!root || !existsSync(path.join(root, "crm-acquisition", "checkpoint.json"))) {
  process.stderr.write("usage: vite-node apr-product-routing-audit-cli.ts <cohort-root>\n");
  process.exitCode = 2;
} else {
  const acquisition = JSON.parse(readFileSync(path.join(root, "crm-acquisition", "checkpoint.json"), "utf8")) as {
    items?: Array<{ customerKey?: string; displayName?: string; productModule?: string }>;
  };
  const analysis = JSON.parse(readFileSync(path.join(root, "crm-document-analysis", "checkpoint.json"), "utf8")) as {
    items?: Array<{ customerKey?: string; documentKey?: string; state?: string; textPath?: string }>;
  };
  const rows = (acquisition.items ?? []).map((item) => {
    const declaredModule = item.productModule === "infissi" ? "infissi" as const : "screening" as const;
    const sources = (analysis.items ?? []).filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && source.textPath)
      .map((source) => ({ sourceId: source.documentKey ?? "unknown", text: readFileSync(source.textPath!, "utf8") }));
    const result = resolveAprDocumentedProductRouting({ declaredModule, sources });
    return {
      customerKey: item.customerKey,
      displayName: item.displayName,
      declaredModule,
      resolvedModule: result.module,
      source: result.source,
      screeningEvidence: result.screeningEvidence,
      infissiEvidence: result.infissiEvidence,
      appliedRuleIds: result.appliedRuleIds,
    };
  });
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
