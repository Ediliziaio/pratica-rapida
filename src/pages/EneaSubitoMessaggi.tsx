/**
 * /eneasubito/messaggi — le domande arrivate dalla chat di EneaSubito.
 *
 * Esiste perche' una promessa fatta a un cliente dev'essere mantenuta da
 * qualcuno: la chat scrive «ti rispondiamo per mail entro poche ore», e
 * finche' quelle domande stavano solo in una tabella la promessa era a nome
 * di nessuno. La mail di avviso arriva gia' in casella; questa pagina serve a
 * vedere **cosa e' rimasto senza risposta**, che e' un'altra cosa.
 *
 * Sta nel CRM ma non si mescola con Pratica Rapida: e' una pagina sua, in una
 * voce sua, e non tocca nessuna lavagna.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Messaggio {
  id: string;
  testo: string;
  email: string;
  pagina: string | null;
  created_at: string;
  letto_at: string | null;
  risposto_at: string | null;
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
  const [soloAperti, setSoloAperti] = useState(true);
  const cache = useQueryClient();
  const { toast } = useToast();

  const { data: messaggi = [], isLoading } = useQuery({
    queryKey: ["eneasubito-messaggi", soloAperti],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("eneasubito_chat_messaggi" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (soloAperti) q = q.is("risposto_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Messaggio[];
    },
  });

  const segna = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("eneasubito_chat_messaggi" as never)
        .update({ risposto_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["eneasubito-messaggi"] });
      void cache.invalidateQueries({ queryKey: ["eneasubito-messaggi-aperti"] });
    },
    onError: () =>
      toast({ variant: "destructive", title: "Non sono riuscito a segnarlo" }),
  });

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">EneaSubito — messaggi dalla chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chi scrive dal sito si aspetta una risposta per e-mail. Qui resta solo quello a cui non
          hai ancora risposto.
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        <Button
          variant={soloAperti ? "default" : "outline"}
          size="sm"
          onClick={() => setSoloAperti(true)}
        >
          Da rispondere
        </Button>
        <Button
          variant={soloAperti ? "outline" : "default"}
          size="sm"
          onClick={() => setSoloAperti(false)}
        >
          Tutti
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Un momento…</p>}

      {!isLoading && messaggi.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {soloAperti ? "Nessun messaggio in attesa di risposta." : "Nessun messaggio."}
        </p>
      )}

      <ul className="space-y-3">
        {messaggi.map((m) => (
          <li key={m.id} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{quando(m.created_at)}</span>
              <span>·</span>
              <a href={`mailto:${m.email}`} className="font-medium text-foreground hover:underline">
                {m.email}
              </a>
              {m.pagina && (
                <>
                  <span>·</span>
                  <span>da {m.pagina}</span>
                </>
              )}
              {m.risposto_at && (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5">
                  risposto {quando(m.risposto_at)}
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap text-sm">{m.testo}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(
                    "Risposta alla tua domanda — EneaSubito",
                  )}`}
                >
                  Rispondi
                </a>
              </Button>
              {!m.risposto_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={segna.isPending}
                  onClick={() => segna.mutate(m.id)}
                >
                  Segna come risposto
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
