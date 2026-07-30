import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Passaggio pratiche chiuse al cruscotto economico esterno (UlberetaWay).
 *
 * Il cruscotto è un'app separata su un altro dominio, SENZA login e senza
 * accesso al database: non può interrogare Supabase da solo. Il travaso
 * avviene quindi da finestra a finestra:
 *
 *   1. l'utente (già autenticato qui) clicca "Cruscotto" in sidebar
 *   2. apriamo il cruscotto con window.open
 *   3. il cruscotto, appena pronto, ci manda "ready" allegando gli id che
 *      ha già importato in passato
 *   4. marchiamo quelli come consumati, leggiamo la coda e gli passiamo
 *      le pratiche ancora pendenti
 *   5. dopo l'import il cruscotto ci risponde "consumed" con gli id
 *
 * Nessun dato passa dall'URL e nessuna credenziale esce da qui: la lettura
 * della coda avviene con la sessione dell'utente corrente, e i dati
 * viaggiano solo verso l'origin esatto del cruscotto.
 */

const CRUSCOTTO_URL =
  import.meta.env.VITE_CRUSCOTTO_URL ?? "https://ulberetaway.vercel.app";
const CRUSCOTTO_ORIGIN = new URL(CRUSCOTTO_URL).origin;

const QUEUE_FIELDS =
  "practice_id,reseller_id,reseller_nome,cliente_nome,cliente_cognome,closed_at";

async function markConsumed(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("cruscotto_sync_queue")
    .update({ consumed_at: new Date().toISOString() })
    .in("practice_id", ids)
    .is("consumed_at", null);
  if (error) console.error("[cruscotto] markConsumed:", error.message);
}

export function useCruscottoHandoff() {
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== CRUSCOTTO_ORIGIN) return;

      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      const reply = event.source as Window | null;

      if (msg.type === "cruscotto:ready") {
        // Auto-riparazione: il cruscotto dichiara cosa ha già importato,
        // così le marcature perse (tab CRM chiusa a metà giro) rientrano.
        if (Array.isArray(msg.imported) && msg.imported.length) {
          await markConsumed(msg.imported.filter((id: unknown) => typeof id === "string"));
        }

        const { data, error } = await supabase
          .from("cruscotto_sync_queue")
          .select(QUEUE_FIELDS)
          .is("consumed_at", null)
          .order("closed_at", { ascending: true });

        if (error) console.error("[cruscotto] lettura coda:", error.message);
        reply?.postMessage(
          { type: "cruscotto:pratiche", rows: data ?? [] },
          CRUSCOTTO_ORIGIN,
        );
        return;
      }

      if (msg.type === "cruscotto:consumed" && Array.isArray(msg.ids)) {
        await markConsumed(msg.ids.filter((id: unknown) => typeof id === "string"));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Nome finestra fisso: riclicare riporta a fuoco quella già aperta
  // invece di aprirne una seconda con dati duplicati.
  return useCallback(() => {
    window.open(CRUSCOTTO_URL, "cruscotto-ulberetaway");
  }, []);
}
