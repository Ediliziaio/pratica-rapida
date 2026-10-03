import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-monthly-invoices/index.ts"),
  "utf8",
);

describe("fatturazione mensile FIC settembre 2026", () => {
  it("usa settembre ed esclude i due fornitori, i CF e le pratiche interne", () => {
    expect(source).toContain('const DESCRIPTION = "Gestione pratiche ENEA Settembre 2026"');
    expect(source).toContain('providerKey.includes("brianza serramenti")');
    expect(source).toContain('providerKey.includes("vans")');
    expect(source).toContain('=== "cliente_finale"');
    expect(source).toContain('emailKey.endsWith("@praticarapida.it")');
  });

  it("non invia e rappresenta gli omaggi con sconto totale", () => {
    expect(source).not.toContain("/email");
    expect(source).not.toContain("/e_invoice/send");
    expect(source).toContain('description: "Prima pratica omaggio"');
    expect(source).toContain("discount: 100");
  });

  it("blocca la creazione se intestatari, prezzi o duplicati non superano il controllo", () => {
    expect(source).toContain('action === "preview"');
    expect(source).toContain('action === "create" && blockers.length');
    expect(source).toContain("existing_invoice_id");
    expect(source).toContain("row.unitPrice <= 0");
    expect(source).toContain('action === "create_ready"');
  });
});
