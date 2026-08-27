import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = resolve(process.cwd(), "scripts/enea-shadow-runner/aprEneaPureMapper.ts");
const FORBIDDEN = [
  "localInvoiceSegmentation",
  "localInvoiceFinancialEvidence",
  "invoiceParser",
  "financialReconciliation",
  "bankTransferEvidence",
  "infissiAutomaticDocumentEvidence",
  "infissiTechnicalSources",
  "pdfjs",
  "tesseract",
  "ocr",
] as const;

function imports(source: string) {
  return [
    ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

function resolveLocalImport(importer: string, specifier: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(process.cwd(), "src", specifier.slice(2))
    : resolve(dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`apr_l4_architecture_unresolved_import:${specifier}`);
}

function dependencyGraph(entry: string) {
  const visited = new Set<string>();
  const edges: Array<{ importer: string; specifier: string; resolved: string | null }> = [];
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const specifier of imports(readFileSync(file, "utf8"))) {
      const resolved = resolveLocalImport(file, specifier);
      edges.push({ importer: file, specifier, resolved });
      if (resolved) visit(resolved);
    }
  };
  visit(entry);
  return { visited, edges };
}

describe("APR Slice 4 architecture boundary", () => {
  it("impedisce dipendenze dirette o transitive da parser, OCR, fonti e resolver vietati", () => {
    const graph = dependencyGraph(ENTRY);
    const violations = graph.edges.filter(({ specifier, resolved }) =>
      FORBIDDEN.some((fragment) => `${specifier}|${resolved ?? ""}`.toLowerCase().includes(fragment.toLowerCase())),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect([...graph.visited].some((file) => file.endsWith("aprLevelSeparationContracts.ts"))).toBe(true);
    expect([...graph.visited].some((file) => file.endsWith("aprMonotonicArtifacts.ts"))).toBe(true);
});
  it("mantiene una sola sorgente dati nel contratto pubblico del mapper", () => {
    const source = readFileSync(ENTRY, "utf8");
    expect(source).toMatch(/mapBusinessDecisionArtifactToEnea\(decisionsArtifact:\s*AprBusinessDecisionsArtifact\)/);
    expect(source).not.toMatch(/mapBusinessDecisionArtifactToEnea\([^)]*,/);
  });
});
