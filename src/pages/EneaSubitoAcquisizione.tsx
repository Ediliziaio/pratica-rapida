/**
 * /eneasubito/acquisizione — il cruscotto da cui si governa la crescita.
 *
 * Risponde a tre domande, e sono le uniche tre che contano:
 *
 *   1. quante pratiche sono entrate questo mese, e se siamo sul passo dei
 *      tre al giorno che il Titolare si e' dato;
 *   2. da dove sono arrivate;
 *   3. quanto e' costata ciascuna, rispetto al tetto di 20 €.
 *
 * La spesa pubblicitaria la inserisce lui qui dentro, un numero per gruppo.
 * Google e ChatGPT non parlano con il nostro database e non c'e' modo di
 * saperlo da soli: dove il numero manca, il costo resta vuoto invece di essere
 * stimato — su quella cifra si decide dove mettere i soldi.
 *
 * Il metodo d'uso (ogni quanto guardarlo, cosa fare dei numeri) sta scritto in
 * docs/ENEASUBITO_ACQUISIZIONE.md.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  andamento,
  CHIAVE_SPESA,
  costoMedio,
  cruscotto,
  meseCorrente,
  meseLeggibile,
  PRATICHE_AL_GIORNO,
  spesaTotale,
  TETTO_COSTO_PRATICA,
  type SpesaPubblicitaria,
} from "@/lib/eneasubito-acquisizione";
import { raggruppa, type Gruppo, type ProvenienzaGrezza } from "@/lib/eneasubito-provenienza";
import type { Json } from "@/integrations/supabase/types";

interface PraticaRiga {
  id: string;
  cliente_nome: string | null;
  cliente_cognome: string | null;
  prezzo: number | null;
  pagamento_stato: string | null;
  created_at: string | null;
  provenienza: ProvenienzaGrezza | null;
}

/** Gli ultimi dodici mesi, dal piu' recente. */
function mesiDisponibili(adesso = new Date()): string[] {
  const mesi: string[] = [];
  for (let indietro = 0; indietro < 12; indietro += 1) {
    const d = new Date(adesso.getFullYear(), adesso.getMonth() - indietro, 1);
    mesi.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return mesi;
}

function estremiDelMese(mese: string): { da: string; a: string } {
  const [anno, numero] = mese.split("-").map(Number);
  return {
    da: new Date(Date.UTC(anno, numero - 1, 1)).toISOString(),
    a: new Date(Date.UTC(anno, numero, 1)).toISOString(),
  };
}

const euro = (n: number) => `€ ${n.toFixed(2)}`;

/**
 * Il motivo leggibile di un guasto.
 *
 * Supabase non restituisce un `Error` ma un oggetto con dentro `message`:
 * passarlo a `String()` stampa «[object Object]», che e' peggio di niente
 * perche' sembra un messaggio e non dice nulla.
 */
export function motivo(guasto: unknown): string {
  if (!guasto) return "";
  if (guasto instanceof Error) return guasto.message;
  if (typeof guasto === "string") return guasto;
  if (typeof guasto === "object" && "message" in guasto) {
    const m = (guasto as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  try {
    return JSON.stringify(guasto);
  } catch {
    return "guasto non identificato";
  }
}

export default function EneaSubitoAcquisizione() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mese, setMese] = useState(() => meseCorrente());
  const [bozzaSpesa, setBozzaSpesa] = useState<Record<string, string>>({});

  const { da, a } = useMemo(() => estremiDelMese(mese), [mese]);

  // Le pratiche del mese. Si contano per data di creazione e non per data di
  // incasso: quello che si misura qui e' l'acquisizione, cioe' quante persone
  // sono arrivate, non quando hanno pagato.
  const { data: pratiche = [], isLoading, error: erroreLettura } = useQuery<PraticaRiga[]>({
    queryKey: ["eneasubito-acquisizione", mese],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enea_practices_public")
        .select("id,cliente_nome,cliente_cognome,prezzo,pagamento_stato,created_at,provenienza")
        .eq("canale", "eneasubito")
        .gte("created_at", da)
        .lt("created_at", a);
      if (error) throw error;
      return (data ?? []) as unknown as PraticaRiga[];
    },
  });

  const { data: spesa = {} } = useQuery<SpesaPubblicitaria>({
    queryKey: ["eneasubito-spesa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", CHIAVE_SPESA)
        .maybeSingle();
      if (error) throw error;
      return ((data?.value as SpesaPubblicitaria | null) ?? {}) as SpesaPubblicitaria;
    },
  });

  const salvaSpesa = useMutation({
    mutationFn: async (nuova: SpesaPubblicitaria) => {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({ key: CHIAVE_SPESA, value: nuova as unknown as Json }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eneasubito-spesa"] });
      setBozzaSpesa({});
      toast({ title: "Spesa aggiornata" });
    },
    onError: (e) =>
      toast({
        title: "Non sono riuscito a salvare",
        description: motivo(e),
        variant: "destructive",
      }),
  });

  const righe = useMemo(() => {
    const gruppi = raggruppa(
      pratiche.map((p) => ({
        cliente_nome: p.cliente_nome,
        cliente_cognome: p.cliente_cognome,
        prezzo: p.prezzo,
        pagamento_stato: p.pagamento_stato,
        provenienza: p.provenienza,
      })),
    );
    return cruscotto(gruppi, spesa[mese]);
  }, [pratiche, spesa, mese]);

  const passo = useMemo(() => andamento(pratiche.length, mese), [pratiche.length, mese]);
  const medio = costoMedio(righe);
  const totaleSpeso = spesaTotale(spesa[mese]);
  const incassato = righe.reduce((s, r) => s + r.incassato, 0);

  function scriviSpesa(gruppo: Gruppo, valore: string) {
    setBozzaSpesa((b) => ({ ...b, [gruppo]: valore }));
  }

  function salva() {
    const delMese: Partial<Record<Gruppo, number>> = { ...(spesa[mese] ?? {}) };
    for (const [gruppo, testo] of Object.entries(bozzaSpesa)) {
      const numero = Number(testo.replace(",", "."));
      if (testo.trim() === "") delete delMese[gruppo as Gruppo];
      else if (Number.isFinite(numero) && numero >= 0) delMese[gruppo as Gruppo] = numero;
    }
    salvaSpesa.mutate({ ...spesa, [mese]: delMese });
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">EneaSubito — da dove arrivano i clienti</h1>
          <p className="text-sm text-muted-foreground">
            Obiettivo: {PRATICHE_AL_GIORNO} pratiche al giorno, con al massimo {TETTO_COSTO_PRATICA} €
            di pubblicità per pratica.
          </p>
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={mese}
          onChange={(e) => {
            setMese(e.target.value);
            setBozzaSpesa({});
          }}
          aria-label="Mese"
        >
          {mesiDisponibili().map((m) => (
            <option key={m} value={m}>{meseLeggibile(m)}</option>
          ))}
        </select>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Riquadro
          titolo="Pratiche del mese"
          valore={String(passo.pratiche)}
          nota={`Per stare sul passo ne servivano ${passo.atteseAOggi}`}
          allarme={!passo.inPari && passo.pratiche > 0}
        />
        <Riquadro
          titolo="Media al giorno"
          valore={passo.mediaAlGiorno.toFixed(1)}
          nota={`Obiettivo ${PRATICHE_AL_GIORNO},0`}
          allarme={!passo.inPari && passo.pratiche > 0}
        />
        <Riquadro
          titolo="Costo per pratica"
          valore={medio === null ? "—" : euro(medio)}
          nota={medio === null ? "Inserisci la spesa qui sotto" : `Tetto ${TETTO_COSTO_PRATICA} €`}
          allarme={medio !== null && medio > TETTO_COSTO_PRATICA}
        />
        <Riquadro
          titolo="Incassato · speso"
          valore={`${euro(incassato)}`}
          nota={totaleSpeso > 0 ? `Pubblicità ${euro(totaleSpeso)}` : "Nessuna spesa dichiarata"}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Sto leggendo…</p>}

      {/* Il motivo vero, non una frase generica. Se la migrazione della
          provenienza non e' stata applicata, qui compare «column provenienza
          does not exist» invece di un rassicurante «nessuna pratica», che
          sarebbe una bugia. */}
      {erroreLettura && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">Non riesco a leggere le pratiche.</p>
          <p className="mt-1">{motivo(erroreLettura)}</p>
          <p className="mt-2 text-xs">
            Se parla di una colonna «provenienza» che non esiste, manca la migrazione
            <code className="mx-1">20261013020000_provenienza.sql</code>: va eseguita nel SQL editor
            di Supabase.
          </p>
        </div>
      )}

      {!isLoading && !erroreLettura && pratiche.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
          Nessuna pratica EneaSubito in {meseLeggibile(mese)}.
        </div>
      )}

      {righe.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Da dove</th>
                <th className="text-right font-semibold px-3 py-2">Pratiche</th>
                <th className="text-right font-semibold px-3 py-2">Incassato</th>
                <th className="text-right font-semibold px-3 py-2">Speso</th>
                <th className="text-right font-semibold px-3 py-2">Costo a pratica</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.gruppo} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.etichetta}</div>
                    {r.clienti.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">{r.clienti.join(" · ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.pratiche}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{euro(r.incassato)}</td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      className="h-8 w-24 text-right tabular-nums ml-auto"
                      inputMode="decimal"
                      placeholder="—"
                      value={bozzaSpesa[r.gruppo] ?? (r.spesa !== null ? String(r.spesa) : "")}
                      onChange={(e) => scriviSpesa(r.gruppo, e.target.value)}
                      aria-label={`Spesa per ${r.etichetta}`}
                    />
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      r.sopraIlTetto ? "text-red-600 dark:text-red-400" : ""
                    }`}
                  >
                    {r.costo === null ? "—" : euro(r.costo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Scrivi quanto hai speso in ogni riga, poi salva. Dove non lo scrivi, il costo resta
              vuoto: non lo stimo.
            </p>
            <Button
              size="sm"
              onClick={salva}
              disabled={Object.keys(bozzaSpesa).length === 0 || salvaSpesa.isPending}
            >
              {salvaSpesa.isPending ? "Salvo…" : "Salva la spesa"}
            </Button>
          </div>
        </div>
      )}

      {righe.some((r) => r.gruppo === "sconosciuta") && (
        <p className="text-xs text-muted-foreground">
          «Non so da dove arriva» sono pratiche nate prima che registrassimo la provenienza, oppure
          di chi ha ricaricato la pagina perdendo il riferimento. È normale che ce ne siano alcune:
          se diventano la maggioranza, qualcosa si è rotto.
        </p>
      )}
    </div>
  );
}

function Riquadro({
  titolo,
  valore,
  nota,
  allarme,
}: {
  titolo: string;
  valore: string;
  nota?: string;
  allarme?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{titolo}</div>
      <div className={`text-xl font-bold ${allarme ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {valore}
      </div>
      {nota && <div className="text-[11px] text-muted-foreground mt-0.5">{nota}</div>}
    </div>
  );
}
