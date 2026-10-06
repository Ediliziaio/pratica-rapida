import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-create-payment/index.ts"),
  "utf8",
);
const formSource = readFileSync(
  path.resolve(process.cwd(), "src/pages/FormPubblico.tsx"),
  "utf8",
);
const completionCopySource = readFileSync(
  path.resolve(process.cwd(), "src/lib/formCompletionCopy.ts"),
  "utf8",
);

describe("recupero delle sessioni Stripe scadute", () => {
  it("controlla la sessione prima di restituire l'URL memorizzato", () => {
    const retrieve = source.indexOf("stripe.checkout.sessions.retrieve(previousSessionId)");
    const openSession = source.indexOf('previousSession.status === "open"');
    const staleUrlFallback = source.indexOf("if (existingUrl && !resetExistingStripeOrder)");

    expect(retrieve).toBeGreaterThan(0);
    expect(openSession).toBeGreaterThan(retrieve);
    expect(staleUrlFallback).toBeGreaterThan(openSession);
  });

  it("blocca un secondo pagamento e rinnova solo le sessioni non pagate", () => {
    expect(source).toContain('previousSession.payment_status === "paid"');
    expect(source).toContain("const renewedSession = await stripe.checkout.sessions.create");
    expect(source).toContain("-renew-${previousSessionId}");
    expect(source).toContain("refreshed: true");
  });

  it("non riusa dal form pubblico un URL Stripe memorizzato e potenzialmente scaduto", () => {
    expect(formSource).not.toContain('setPaymentUrl(isPaymentConfirmed(row) ? "" : row.payment_url ?? "")');
    expect(formSource).toContain('setPaymentUrl("")');
    expect(formSource).toContain("await startRequiredPayment(paymentRequired)");
  });

  it("spiega al cliente cosa accade dopo il pagamento senza promettere una conferma indefinita", () => {
    expect(formSource).toContain("questa pagina si aggiornerà automaticamente");
    expect(formSource).not.toContain("Stiamo verificando la conferma del pagamento");
    expect(formSource).not.toContain("attendendo la conferma definitiva del pagamento");
    expect(completionCopySource).toContain("La fattura è stata inviata allo SDI e all’indirizzo e-mail indicato. Grazie.");
  });
});
