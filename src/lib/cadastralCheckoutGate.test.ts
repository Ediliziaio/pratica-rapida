import { describe, expect, it } from "vitest";

import { shouldStartCadastralCheckout } from "./cadastralCheckoutGate";

describe("blocco pagamento servizio catastale", () => {
  it("ferma il rivenditore che richiede il servizio nella sessione corrente", () => {
    expect(shouldStartCadastralCheckout({
      isCadastralStep: true,
      serviceRequested: true,
      billingType: "rivenditore",
      paymentConfirmed: false,
    })).toBe(true);
  });

  it("non permette di usare un pagamento non confermato come sblocco", () => {
    expect(shouldStartCadastralCheckout({
      isCadastralStep: true,
      serviceRequested: true,
      billingType: "rivenditore",
      paymentConfirmed: false,
    })).toBe(true);
  });

  it("sblocca soltanto dopo un pagamento confermato", () => {
    expect(shouldStartCadastralCheckout({
      isCadastralStep: true,
      serviceRequested: true,
      billingType: "rivenditore",
      paymentConfirmed: true,
    })).toBe(false);
  });

  it("lascia il pagamento completo dei CF alla fine del modulo", () => {
    expect(shouldStartCadastralCheckout({
      isCadastralStep: true,
      serviceRequested: true,
      billingType: "cliente_finale",
      paymentConfirmed: false,
    })).toBe(false);
  });

  it("non interviene fuori dallo step Catasto o senza servizio richiesto", () => {
    expect(shouldStartCadastralCheckout({
      isCadastralStep: false,
      serviceRequested: true,
      billingType: "rivenditore",
      paymentConfirmed: false,
    })).toBe(false);
    expect(shouldStartCadastralCheckout({
      isCadastralStep: true,
      serviceRequested: false,
      billingType: "rivenditore",
      paymentConfirmed: false,
    })).toBe(false);
  });
});
