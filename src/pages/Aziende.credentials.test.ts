import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(path.resolve(process.cwd(), "src/pages/Aziende.tsx"), "utf8");
const detailSource = readFileSync(
  path.resolve(process.cwd(), "src/components/aziende/ChangeCompanyPasswordDialog.tsx"),
  "utf8",
);
const deliverySource = readFileSync(
  path.resolve(process.cwd(), "src/lib/companyCredentialDelivery.ts"),
  "utf8",
);

describe("invio credenziali rivenditore", () => {
  it("recupera una sessione valida prima di modificare la password", () => {
    const getSession = deliverySource.indexOf("supabase.auth.getSession()");
    const setPassword = deliverySource.indexOf('supabase.functions.invoke("set-company-password"');

    expect(getSession).toBeGreaterThan(0);
    expect(setPassword).toBeGreaterThan(getSession);
  });

  it("passa la sessione sia al reset password sia all'invio email", () => {
    expect(deliverySource.match(/headers: authorization/g)).toHaveLength(2);
  });

  it("non dichiara l'email inviata quando la funzione restituisce un errore", () => {
    expect(deliverySource).toContain("if (emailError)");
    expect(deliverySource).toContain("emailResult?.success !== true");
    expect(deliverySource).toContain("Password impostata, ma email non inviata");
  });

  it("usa lo stesso flusso verificato sia dalla lista sia dal dettaglio azienda", () => {
    expect(listSource).toContain("updateCompanyCredentials({");
    expect(detailSource).toContain("updateCompanyCredentials({ company, password, sendEmail })");
    expect(detailSource).toContain("Imposta password e invia email");
  });
});
