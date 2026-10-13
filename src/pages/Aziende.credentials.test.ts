import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(process.cwd(), "src/pages/Aziende.tsx"), "utf8");

describe("invio credenziali rivenditore", () => {
  it("recupera una sessione valida prima di modificare la password", () => {
    const resetStart = source.indexOf("const resetCredentials = useMutation");
    const getSession = source.indexOf("supabase.auth.getSession()", resetStart);
    const setPassword = source.indexOf('supabase.functions.invoke("set-company-password"', resetStart);

    expect(resetStart).toBeGreaterThan(0);
    expect(getSession).toBeGreaterThan(resetStart);
    expect(setPassword).toBeGreaterThan(getSession);
  });

  it("passa la sessione sia al reset password sia all'invio email", () => {
    const resetStart = source.indexOf("const resetCredentials = useMutation");
    const resetEnd = source.indexOf("// ── Elimina rivenditore", resetStart);
    const resetSource = source.slice(resetStart, resetEnd);

    expect(resetSource.match(/headers: authorization/g)).toHaveLength(2);
  });

  it("non dichiara l'email inviata quando la funzione restituisce un errore", () => {
    expect(source).toContain("if (emailError)");
    expect(source).toContain("Password impostata, ma email non inviata");
  });
});
