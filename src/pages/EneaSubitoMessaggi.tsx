/**
 * /eneasubito/messaggi — la chat del sito, dal lato di chi risponde.
 *
 * Chi scrive dal sito si aspetta la risposta **dove ha scritto**: qui si
 * digita, e il messaggio compare nella sua finestra entro pochi secondi.
 *
 * Pensata per il telefono quanto per il computer, perche' il Titolare non
 * deve restare davanti allo schermo per poter rispondere: una colonna sola,
 * niente tabelle larghe, il campo di scrittura sempre a portata di pollice.
 *
 * Sta nel CRM ma non si mescola con Pratica Rapida: pagina sua, voce sua, e
 * non tocca nessuna lavagna.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Conversazione {
  id: string;
  marchio: string;
  email: string | null;
  pagina: string | null;
  created_at: string;
  ultimo_at: string;
  chiusa_at: string | null;
}

interface Messaggio {
  id: string;
  conversazione_id: string;
  da: "cliente" | "operatore" | "automatico";
  testo: string;
  created_at: string;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EneaSubitoMessaggi() {
  const [scelta, setScelta] = useState<string | null>(null);
  const [testo, setTesto] = useState("");
  const [chiuse, setChiuse] = useState(false);
  const cache = useQueryClient();
  const { toast } = useToast();
  const fondo = useRef<HTMLDivElement>(null);

  const { data: conversazioni = [], isLoading } = useQuery({
    queryKey: ["chat-conversazioni", chiuse],
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("chat_conversazioni" as never)
        .select("*")
        .eq("marchio", "eneasubito")
        .order("ultimo_at", { ascending: false })
        .limit(100);
      if (!chiuse) q = q.is("chiusa_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Conversazione[];
    },
  });

  // Mentre una conversazione e' aperta si guarda spesso: chi sta scrivendo
  // dall'altra parte non deve aspettare che qualcuno ricarichi la pagina.
  const { data: messaggi = [] } = useQuery({
    queryKey: ["chat-messaggi", scelta],
    enabled: !!scelta,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messaggi" as never)
        .select("*")
        .eq("conversazione_id", scelta!)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Messaggio[];
    },
  });

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: "end" });
  }, [messaggi.length]);

  const rispondi = useMutation({
    mutationFn: async () => {
      const pulito = testo.trim();
      if (!scelta || !pulito) return;
      const { error } = await supabase
        .from("chat_messaggi" as never)
        .insert({ conversazione_id: scelta, da: "operatore", testo: pulito } as never);
      if (error) throw error;
      // Appena si risponde, la conversazione risulta vista.
      await supabase
        .from("chat_conversazioni" as never)
        .update({ visto_at: new Date().toISOString() } as never)
        .eq("id", scelta);
    },
    onSuccess: () => {
      setTesto("");
      void cache.invalidateQueries({ queryKey: ["chat-messaggi", scelta] });
      void cache.invalidateQueries({ queryKey: ["chat-conversazioni"] });
    },
    onError: () => toast({ variant: "destructive", title: "Non sono riuscito a mandarlo" }),
  });

  const chiudi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("chat_conversazioni" as never)
        .update({ chiusa_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setScelta(null);
      void cache.invalidateQueries({ queryKey: ["chat-conversazioni"] });
      void cache.invalidateQueries({ queryKey: ["chat-aperte-count"] });
    },
  });

  const corrente = conversazioni.find((c) => c.id === scelta) ?? null;

  // ── Una conversazione aperta ────────────────────────────────────────────
  if (corrente) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-2xl flex-col p-4">
        <header className="mb-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setScelta(null)}>
            ← Tutte
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {corrente.email ?? "Visitatore senza indirizzo"}
            </p>
            <p className="text-xs text-muted-foreground">
              dalle {quando(corrente.created_at)}
              {corrente.pagina ? ` · ${corrente.pagina}` : ""}
            </p>
          </div>
          {!corrente.chiusa_at && (
            <Button variant="outline" size="sm" onClick={() => chiudi.mutate(corrente.id)}>
              Chiudi
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-3">
          {messaggi.map((m) => (
            <div
              key={m.id}
              className={`mb-2 max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.da === "cliente"
                  ? "mr-auto rounded-bl-sm bg-background border"
                  : "ml-auto rounded-br-sm bg-primary text-primary-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.testo}</p>
              <p className="mt-1 text-[10px] opacity-60">{quando(m.created_at)}</p>
            </div>
          ))}
          <div ref={fondo} />
        </div>

        <div className="mt-3 flex gap-2">
          <textarea
            rows={2}
            className="flex-1 resize-none rounded-md border bg-background p-2 text-sm"
            placeholder="Scrivi la risposta…"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                rispondi.mutate();
              }
            }}
          />
          <Button
            disabled={!testo.trim() || rispondi.isPending}
            onClick={() => rispondi.mutate()}
          >
            Manda
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          La risposta compare nella chat del cliente entro pochi secondi.
        </p>
      </div>
    );
  }

  // ── L'elenco ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">EneaSubito — chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chi scrive dal sito aspetta la risposta lì, non per e-mail.
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        <Button variant={chiuse ? "outline" : "default"} size="sm" onClick={() => setChiuse(false)}>
          Aperte
        </Button>
        <Button variant={chiuse ? "default" : "outline"} size="sm" onClick={() => setChiuse(true)}>
          Tutte
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Un momento…</p>}

      {!isLoading && conversazioni.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nessuna conversazione aperta.
        </p>
      )}

      <ul className="space-y-2">
        {conversazioni.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="w-full rounded-lg border bg-card p-3 text-left hover:bg-accent"
              onClick={() => setScelta(c.id)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {c.email ?? "Visitatore senza indirizzo"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {quando(c.ultimo_at)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.chiusa_at ? "chiusa" : "aperta"}
                {c.pagina ? ` · da ${c.pagina}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
