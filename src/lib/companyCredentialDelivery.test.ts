import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { resolveCredentialAddresses } from "./companyCredentialDelivery";

describe("destinatario delle credenziali azienda", () => {
  it("invia al contatto aziendale corrente ma conserva l'email Auth come login", () => {
    expect(resolveCredentialAddresses("groupedile@gmail.com", "amministrazione@serviscasa.com"))
      .toEqual({
        deliveryEmail: "groupedile@gmail.com",
        loginEmail: "amministrazione@serviscasa.com",
      });
  });

  it("usa l'email Auth anche come destinatario soltanto se manca il contatto aziendale", () => {
    expect(resolveCredentialAddresses(null, "accesso@example.it")).toEqual({
      deliveryEmail: "accesso@example.it",
      loginEmail: "accesso@example.it",
    });
  });

  it("non inventa un indirizzo quando mancano entrambe le fonti", () => {
    expect(resolveCredentialAddresses("  ", null)).toEqual({
      deliveryEmail: null,
      loginEmail: null,
    });
  });
});
