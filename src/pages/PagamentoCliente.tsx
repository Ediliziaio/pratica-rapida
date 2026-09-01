/**
 * /paga/:token — pagina di pagamento per il CLIENTE FINALE.
 *
 * Ci arriva chi ha ricevuto il link perché il rivenditore, caricando la
 * pratica, ha scelto "a carico del cliente finale". La pagina esiste al posto
 * di un link Stripe diretto per due motivi: le sessioni di Checkout scadono
 * (il link nell'email resterebbe morto dopo un giorno), e il cliente prima di
 * pagare deve capire cosa sta pagando e chi glielo ha proposto.
 *
 * Ci ripassa anche chi annulla il pagamento: `cancel_url` punta qui, così può
 * riprovare senza dover ricompilare o richiedere un nuovo link.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Loader2, AlertCircle, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";

interface Pagamento {
  cliente_nome: string | null;
  cliente_cognome: string | null;
  prodotto_installato: string | null;
  tipo_servizio: string | null;
  tipo_fatturazione: string | null;
  pagamento_stato: string | null;
  reseller_name: string | null;
  archived_at: string | null;
  // Prezzo risolto dalla RPC per QUESTA pratica (listino del rivenditore se
  // ha condizioni sue, altrimenti standard). Assenti finche' in produzione
  // gira la versione precedente della RPC: in quel caso fallback al listino
  // di piattaforma letto a parte.
  imponibile_cents?: number | null;
  iva_percent?: number | null;
  totale_cents?: number | null;
}

const euro = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

function Riquadro({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 pt-24 pb-20">
      <div className="max-w-xl mx-auto px-4">
        <div className="rounded-xl border bg-card p-6 sm:p-8 space-y-5">{children}</div>
      </div>
    </main>
  );
}

export default function PagamentoCliente() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const esito = params.get("pagamento"); // "ok" | "annullato" | null

  const [dati, setDati] = useState<Pagamento | null>(null);
  const [prezzo, setPrezzo] = useState<{
    imponibileCents: number;
    ivaPercent: number;
    totaleCents: number;
  } | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [avvio, setAvvio] = useState(false);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    (async () => {
      const [praticaRes, prezzoRes] = await Promise.all([
        supabase.rpc("get_pagamento_by_form_token", { p_token: token }),
        supabase.from("platform_settings").select("value").eq("key", "prezzo_privato_enea").maybeSingle(),
      ]);
      if (!vivo) return;

      const riga = (praticaRes.data as Pagamento[] | null)?.[0] ?? null;
      if (praticaRes.error) {
        // Token inesistente e RPC mancante danno lo stesso schermo: senza log
        // una migration non applicata sembrerebbe un link sbagliato.
        console.error("get_pagamento_by_form_token:", praticaRes.error);
      }
      if (!riga) {
        setErrore("Link non valido o scaduto. Se pensi sia un errore scrivici e controlliamo noi.");
      } else {
        setDati(riga);
      }

      // Il prezzo giusto per QUESTA pratica arriva dalla RPC (tiene conto del
      // listino personalizzato del rivenditore). Il listino di piattaforma
      // resta come fallback finche' la RPC vecchia e' in circolazione.
      if (riga?.totale_cents && riga.imponibile_cents) {
        setPrezzo({
          imponibileCents: riga.imponibile_cents,
          ivaPercent: Number(riga.iva_percent ?? 0),
          totaleCents: riga.totale_cents,
        });
      } else {
        const v = (prezzoRes.data?.value ?? {}) as { imponibile_cents?: number; iva_percent?: number };
        const imponibile = v.imponibile_cents ?? 0;
        const iva = v.iva_percent ?? 0;
        setPrezzo(
          imponibile > 0
            ? {
                imponibileCents: imponibile,
                ivaPercent: iva,
                totaleCents: Math.round(imponibile * (1 + iva / 100)),
              }
            : null,
        );
      }
      setCaricamento(false);
    })();
    return () => { vivo = false; };
  }, [token]);

  const vaiAlPagamento = async () => {
    if (!token || !dati) return;
    setAvvio(true);
    setErrore(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          form_token: token,
          pricing_key: "prezzo_privato_enea",
          // Col servizio completo dopo il pagamento deve compilare il modulo;
          // con i documenti forniti dal rivenditore non c'è nulla da compilare.
          success: dati.tipo_servizio === "documenti_forniti" ? "pagamento" : "form",
          descrizione: `Pratica ENEA — ${dati.prodotto_installato ?? "intervento"}`,
        },
      });
      if (error) {
        // supabase-js sugli status non-2xx non espone il body: senza leggerlo
        // dal Response allegato si vedrebbe "non-2xx status code".
        let msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try { msg = (await ctx.json())?.error ?? msg; } catch { /* body non JSON */ }
        }
        throw new Error(msg);
      }
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("Non riusciamo ad aprire la pagina di pagamento.");
      window.location.href = url;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Qualcosa non ha funzionato. Riprova tra poco.");
      setAvvio(false);
    }
  };

  const contatti = (
    <p className="text-xs text-muted-foreground">
      Per qualsiasi dubbio scrivici a{" "}
      <a href="mailto:modulistica@praticarapida.it" className="text-primary underline">
        modulistica@praticarapida.it
      </a>{" "}
      oppure su{" "}
      <a href="https://wa.me/390398682691" target="_blank" rel="noopener noreferrer" className="text-primary underline">
        WhatsApp
      </a>.
    </p>
  );

  let contenuto: React.ReactNode;

  if (caricamento) {
    contenuto = (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Caricamento…
      </div>
    );
  } else if (!dati) {
    contenuto = (
      <>
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-bold">Link non valido</h1>
        <p className="text-sm text-muted-foreground">{errore}</p>
        {contatti}
      </>
    );
  } else if (dati.archived_at && dati.pagamento_stato !== "pagata") {
    // Pratica annullata/archiviata: il link vecchio non deve incassare soldi
    // per un lavoro che nessuno fara'. (Anche stripe-checkout la rifiuta:
    // questo schermo evita solo di far arrivare l'utente fino all'errore.)
    contenuto = (
      <>
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-bold">Pratica non più attiva</h1>
        <p className="text-sm text-muted-foreground">
          Questa pratica è stata chiusa e non richiede nessun pagamento. Se pensi sia un
          errore, scrivici e controlliamo subito.
        </p>
        {contatti}
      </>
    );
  } else if (dati.pagamento_stato === "pagata" || esito === "ok") {
    // `esito === "ok"` copre la finestra fra il ritorno da Stripe e l'arrivo
    // del webhook: il cliente ha pagato davvero, non ha senso mostrargli
    // ancora il pulsante.
    const servizioCompleto = dati.tipo_servizio !== "documenti_forniti";
    contenuto = (
      <>
        <CheckCircle className="h-10 w-10 text-green-500" />
        <h1 className="text-xl font-bold">Pagamento ricevuto</h1>
        <p className="text-sm text-muted-foreground">
          Grazie{dati.cliente_nome ? ` ${dati.cliente_nome}` : ""}, abbiamo registrato il pagamento.
          Ti arriva anche la ricevuta via email.
        </p>
        {servizioCompleto ? (
          <>
            <p className="text-sm">
              Ultimo passaggio: ci servono ancora alcuni dati sull'immobile e sull'impianto.
              Sono circa 5 minuti.
            </p>
            <Button asChild className="w-full">
              {/* ?pagamento=ok: il webhook potrebbe non aver ancora scritto
                  "pagata" — senza il param il form rimbalzerebbe alla cassa. */}
              <Link to={`/form/${token}?pagamento=ok`}>Completa la pratica</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm">
            Non devi fare altro: {dati.reseller_name} ci ha già consegnato tutta la
            documentazione. Prepariamo la pratica e ti avvisiamo appena è pronta.
          </p>
        )}
        {contatti}
      </>
    );
  } else if (dati.tipo_fatturazione !== "cliente_finale") {
    // Pratica a carico del rivenditore: al cliente non va chiesto nulla.
    contenuto = (
      <>
        <CheckCircle className="h-10 w-10 text-green-500" />
        <h1 className="text-xl font-bold">Nessun pagamento richiesto</h1>
        <p className="text-sm text-muted-foreground">
          Per questa pratica non devi pagare nulla: il servizio è a carico di{" "}
          {dati.reseller_name}.
        </p>
        {contatti}
      </>
    );
  } else {
    const documentiForniti = dati.tipo_servizio === "documenti_forniti";
    // "la tua azienda installatrice" e' la stringa di RIPIEGO della RPC quando
    // dietro non c'e' un rivenditore reale — in pratica: il privato che ha
    // comprato la pratica dal sito e ci ripassa dopo aver annullato Stripe.
    // Per lui "X ci ha incaricati... come da accordi presi con lui" e' falso:
    // ha deciso tutto da solo.
    const senzaRivenditore = dati.reseller_name === "la tua azienda installatrice";
    contenuto = (
      <>
        <div>
          <h1 className="text-xl font-bold">
            Pratica ENEA{dati.cliente_nome ? ` di ${dati.cliente_nome} ${dati.cliente_cognome ?? ""}`.trimEnd() : ""}
          </h1>
          {dati.prodotto_installato && (
            <p className="text-sm text-muted-foreground mt-1">{dati.prodotto_installato}</p>
          )}
        </div>

        {/* Stessa struttura dell'email richiesta_pagamento_cliente: chi ci ha
            incaricati, a cosa serve la pratica (la detrazione e' SUA), cosa
            facciamo in concreto, cosa succede dopo. Persuasione per chiarezza
            del beneficio, mai per pressione. */}
        <p className="text-sm leading-relaxed">
          {senzaRivenditore ? (
            <>Hai chiesto a <strong>Pratica Rapida</strong> di occuparci della tua pratica ENEA.</>
          ) : documentiForniti ? (
            <>
              <strong>{dati.reseller_name}</strong> ci ha incaricati di occuparci della tua pratica ENEA
              e ci ha già consegnato tutti i documenti necessari: non dovrai fornirci nient'altro.
            </>
          ) : (
            <>
              <strong>{dati.reseller_name}</strong> ci ha incaricati di occuparci della tua pratica ENEA.
            </>
          )}
        </p>

        <p className="text-sm leading-relaxed">
          La comunicazione ENEA è il passaggio necessario per accedere alla{" "}
          <strong>detrazione fiscale</strong> sui lavori che hai fatto: va preparata con i dati
          corretti e trasmessa all'ente. È esattamente quello che facciamo ogni giorno.
        </p>

        <div className="text-sm leading-relaxed">
          <p className="font-medium mb-1.5">Ecco cosa faremo per te:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>prepariamo la comunicazione ENEA e verifichiamo che i dati siano corretti;</li>
            <li>la trasmettiamo noi all'ente, senza che tu debba registrarti da nessuna parte;</li>
            <li>ti consegniamo la documentazione completa, pronta da dare al commercialista o al CAF per la dichiarazione dei redditi.</li>
          </ul>
        </div>

        <p className="text-sm leading-relaxed">
          {senzaRivenditore ? (
            <>Qui sotto trovi il riepilogo del costo, che puoi saldare quando preferisci.</>
          ) : (
            <>Come da accordi presi con {dati.reseller_name}, il costo del servizio è a tuo
            carico. Qui sotto trovi il riepilogo e puoi procedere quando preferisci.</>
          )}{" "}
          {documentiForniti ? (
            <>Dopo il pagamento non dovrai fare nient'altro: prepariamo la pratica e ti
            avvisiamo appena è pronta.</>
          ) : (
            <>Dopo il pagamento ti chiediamo gli ultimi dati sull'immobile con un breve modulo
            online — bastano circa 5 minuti — e da lì in poi pensiamo a tutto noi.</>
          )}
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 flex items-baseline justify-between gap-3">
          <div>
            <span className="text-sm text-muted-foreground">Costo del servizio</span>
            {prezzo && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {euro(prezzo.imponibileCents)} + IVA {prezzo.ivaPercent}%
              </p>
            )}
          </div>
          <span className="text-lg font-bold">
            {prezzo ? euro(prezzo.totaleCents) : "—"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">Totale, IVA inclusa</p>

        {esito === "annullato" && (
          <p className="text-sm rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            Il pagamento non è stato completato. Puoi riprovare quando vuoi: questo link resta valido.
          </p>
        )}
        {errore && (
          <p className="text-sm rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
            {errore}
          </p>
        )}

        <Button className="w-full" size="lg" onClick={vaiAlPagamento} disabled={avvio || !prezzo}>
          {avvio ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Un attimo…</>
          ) : prezzo ? (
            `Prosegui — ${euro(prezzo.totaleCents)}`
          ) : (
            "Pagamento non disponibile"
          )}
        </Button>

        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Il pagamento avviene su Stripe. I dati della carta non passano dai nostri sistemi.
        </p>
        {contatti}
      </>
    );
  }

  return (
    <>
      <SEO
        title="Pagamento pratica ENEA | Pratica Rapida"
        description="Completa il pagamento della tua pratica ENEA."
        canonical={`/paga/${token ?? ""}`}
        noindex
      />
      <Navbar />
      <Riquadro>{contenuto}</Riquadro>
      <Footer />
    </>
  );
}
