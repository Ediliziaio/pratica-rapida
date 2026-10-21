// Prova del «paghi dopo» di EneaSubito sul conto di PROVA di Stripe.
//
// Prende la chiave di prova dagli appunti (e li svuota subito), rifiuta
// qualunque chiave che non sia di prova, apre una cassa con la carta
// bloccata come quella vera, aspetta che si paghi con la carta finta
// 4242 4242 4242 4242, poi incassa e dice se Stripe ha fatto la fattura.
// Non stampa mai la chiave.
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

// La chiave si prende dagli appunti DOPO che la prova e' partita: cosi' chi
// la lancia copia il comando, poi copia la chiave, e non deve scrivere niente.
const domanda = createInterface({ input: process.stdin, output: process.stdout });
await domanda.question("\nCopia ora la chiave di PROVA di Stripe (sk_test_...), poi torna qui e premi Invio... ");
domanda.close();
const chiave = execSync("pbpaste").toString().trim();
execSync("pbcopy < /dev/null");
if (!chiave.startsWith("sk_test_") && !chiave.startsWith("rk_test_")) {
  console.log("FERMO: negli appunti non c'è una chiave di PROVA (deve cominciare con sk_test_). Non ho usato niente e ho svuotato gli appunti.");
  process.exit(1);
}

async function stripe(metodo, percorso, campi) {
  const r = await fetch(`https://api.stripe.com/v1/${percorso}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${chiave}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
    },
    body: campi ? new URLSearchParams(campi).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${percorso}: ${d?.error?.message ?? r.status}`);
  return d;
}

try {
  const sessione = await stripe("POST", "checkout/sessions", {
    mode: "payment",
    "payment_method_types[0]": "card",
    customer_email: "prova@eneasubito.it",
    "payment_intent_data[capture_method]": "manual",
    "payment_intent_data[receipt_email]": "prova@eneasubito.it",
    "custom_text[submit][message]":
      "Nessun addebito adesso: i 99 € vengono addebitati solo quando la tua pratica è stata inviata all'ENEA. Se non riusciamo a inviarla, non paghi niente.",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": "9900",
    "line_items[0][price_data][product_data][name]": "EneaSubito — Pratica ENEA (PROVA)",
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][footer]": "EneaSubito è un servizio di PR Consulting LLC",
    success_url: "https://www.eneasubito.it/",
    cancel_url: "https://www.eneasubito.it/",
  });
  console.log("\n1) La cassa con la carta bloccata si apre: SÌ");
  console.log("\nApri questo indirizzo, paga con la carta 4242 4242 4242 4242, scadenza 12/34, CVC 123:");
  console.log(sessione.url);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("\nQuando hai pagato, torna qui e premi Invio... ");
  rl.close();

  const fatta = await stripe("GET", `checkout/sessions/${sessione.id}`);
  const pi = await stripe("GET", `payment_intents/${fatta.payment_intent}`);
  console.log(`\n2) Dopo il pagamento la carta è bloccata e non addebitata: ${pi.status === "requires_capture" ? "SÌ" : "NO (" + pi.status + ")"}`);
  console.log(`   Fattura prima dell'incasso: ${fatta.invoice ? "creata" : "nessuna"}`);

  const incassato = await stripe("POST", `payment_intents/${pi.id}/capture`, {});
  console.log(`3) L'incasso riesce: ${incassato.status === "succeeded" ? "SÌ (" + incassato.amount_received / 100 + " €)" : "NO (" + incassato.status + ")"}`);

  await new Promise((r) => setTimeout(r, 4000));
  const dopo = await stripe("GET", `checkout/sessions/${sessione.id}`);
  let fattura = null;
  if (dopo.invoice) fattura = await stripe("GET", `invoices/${dopo.invoice}`);
  console.log(`4) Fattura dopo l'incasso: ${fattura ? `${fattura.status} (${fattura.number ?? "senza numero"})` : "NESSUNA"}`);
  console.log("\nFINE PROVA");
} catch (e) {
  console.log(`\nERRORE: ${e.message}`);
}
