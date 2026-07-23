// Tipi UI per le "pratiche" e le relazioni joinate come tornano dalle query
// Supabase. Sono volutamente PERMISSIVI (campi opzionali) perché le varie
// query selezionano subset di colonne diversi: così evitiamo `any` senza
// costringere ogni query allo stesso identico shape.

import type { Tables } from "@/integrations/supabase/types";

/** Relazione cliente finale joinata (subset usato nella UI). */
export type ClienteFinaleRef = Partial<
  Pick<Tables<"clienti_finali">, "nome" | "cognome" | "email" | "telefono">
> | null;

/** Relazione azienda joinata (subset usato nella UI). */
export type CompanyRef = Partial<Pick<Tables<"companies">, "ragione_sociale">> | null;

/**
 * Pratica come consumata dalla UI: colonne della tabella (opzionali) più le
 * relazioni joinate. `dati_pratica` è Json — per leggerne i campi (es. brand)
 * usare un cast locale mirato.
 */
export type PraticaUI = Partial<Tables<"pratiche">> & {
  // Campi core sempre presenti nelle liste pratiche (richiesti dai helper di
  // stato/ordinamento). Il resto delle colonne resta opzionale.
  id: string;
  stato: Tables<"pratiche">["stato"];
  updated_at: Tables<"pratiche">["updated_at"];
  clienti_finali?: ClienteFinaleRef;
  companies?: CompanyRef;
};
