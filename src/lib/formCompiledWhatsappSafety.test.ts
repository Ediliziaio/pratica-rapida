import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/on-stage-changed/index.ts"),
  "utf8",
);

describe("form compiled WhatsApp safety", () => {
  it("usa il template Meta approvato con i due parametri previsti", () => {
    const formCompiledCase = source.slice(
      source.indexOf('case "pronte_da_fare"'),
      source.indexOf('case "recensione"'),
    );

    expect(formCompiledCase).toContain('template_name: "compilazione_avvenuta"');
    expect(formCompiledCase).toContain('{ type: "text", text: practice.cliente_nome }');
    expect(formCompiledCase).toContain('{ type: "text", text: practice.cliente_email ?? "—" }');
    expect(formCompiledCase).toContain('trigger_event: "form_compiled"');
    expect(formCompiledCase).not.toContain('template_name: "conferma_dati_ricevuti"');
  });
});
