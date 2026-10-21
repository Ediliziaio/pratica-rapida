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
const appunti = execSync("pbpaste").toString();
execSync("pbcopy < /dev/null");
// Copiata dalla tabella di Stripe la chiave va a capo su tre righe: si
// tolgono spazi e a capo e la si cerca dentro tutto il testo.
const compatto = appunti.replace(/\s+/g, "");
const chiave = (compatto.match(/(?:sk|rk)_test_[A-Za-z0-9]+/) ?? [""])[0];
if (!chiave) {
  const tipo = compatto.slice(0, 3).replace(/[A-Za-z0-9]/g, "x");
  console.log(`FERMO: negli appunti non c'è una chiave di PROVA. Ho trovato ${compatto.length} caratteri${compatto.includes("live") ? ", con la parola «live»: è il conto VERO" : ""} (inizio: ${tipo}...). Non ho usato niente e ho svuotato gli appunti.`);
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
    customer_creation: "always",
    customer_email: "prova@eneasubito.it",
    "payment_intent_data[capture_method]": "manual",
    "payment_intent_data[receipt_email]": "prova@eneasubito.it",
    "custom_text[submit][message]":
      "Nessun addebito adesso: i 99 € vengono addebitati solo quando la tua pratica è stata inviata all'ENEA. Se non riusciamo a inviarla, non paghi niente.",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": "9900",
    "line_items[0][price_data][product_data][name]": "EneaSubito — Pratica ENEA (PROVA)",
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

  // La fattura non puo' nascere dalla cassa con la carta bloccata (Stripe lo
  // vieta): la si fa all'incasso, gia' saldata, e se ne manda il PDF.
  const cliente = incassato.customer ?? fatta.customer;
  const fattura0 = await stripe("POST", "invoices", {
    customer: cliente,
    currency: "eur",
    collection_method: "send_invoice",
    days_until_due: "0",
    auto_advance: "false",
    description: "Pratica ENEA. Compilazione e trasmissione al portale ENEA.",
    footer: "EneaSubito è un servizio di PR Consulting LLC",
    "metadata[pagamento]": incassato.id,
  });
  await stripe("POST", "invoiceitems", {
    customer: cliente,
    invoice: fattura0.id,
    currency: "eur",
    amount: String(incassato.amount_received),
    description: "EneaSubito — Pratica ENEA (PROVA)",
  });
  await stripe("POST", `invoices/${fattura0.id}/finalize`, {});
  const pagata = await stripe("POST", `invoices/${fattura0.id}/pay`, { paid_out_of_band: "true" });
  console.log(`4) Fattura fatta all'incasso: ${pagata.status === "paid" ? "SÌ, saldata" : "NO (" + pagata.status + ")"} — numero ${pagata.number ?? "?"}, importo ${pagata.total / 100} €`);
  console.log(`5) PDF della fattura disponibile: ${pagata.invoice_pdf ? "SÌ" : "NO"}`);
  console.log("\nFINE PROVA");
} catch (e) {
  console.log(`\nERRORE: ${e.message}`);
}
