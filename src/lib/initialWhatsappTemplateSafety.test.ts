import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/on-practice-created/index.ts"),
  "utf8",
);

describe("initial WhatsApp template safety", () => {
  it("usa il template Meta approvato con nome e link soltanto", () => {
    const initialWhatsappBlock = source.slice(
      source.indexOf("// 2. Primo contatto WA"),
      source.indexOf("// 3. Email al cliente finale"),
    );

    expect(initialWhatsappBlock).toContain('template_name: "modulo_cliente_enea"');
    expect(initialWhatsappBlock).toContain('{ type: "text", text: practice.cliente_nome }');
    expect(initialWhatsappBlock).toContain('`https://app.praticarapida.it/form/${practice.form_token}`');
    expect(initialWhatsappBlock).not.toContain('template_name: "contatta_cliente"');
    expect(initialWhatsappBlock).not.toContain('{ type: "text", text: resellerName }');
  });
});
