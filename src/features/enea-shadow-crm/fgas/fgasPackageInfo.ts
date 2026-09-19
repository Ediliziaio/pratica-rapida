// Copia 1:1 della funzione usata in supabase/functions/on-stage-changed/index.ts
// (Deno non è installato sul Mac: il test gira qui su Node con la stessa
// logica). Se cambia una, cambia anche l'altra: il test sul sorgente della
// funzione lo verifica.
export function fgasPackageInfo(datiForm: unknown): { requested: boolean; status: string | null; completionPaths: string[] } {
  const dati = datiForm && typeof datiForm === "object" && !Array.isArray(datiForm) ? datiForm as Record<string, unknown> : null;
  const fgas = dati?.fgas && typeof dati.fgas === "object" && !Array.isArray(dati.fgas) ? dati.fgas as Record<string, unknown> : null;
  if (!fgas || fgas.requested !== true) return { requested: false, status: null, completionPaths: [] };
  const raw = Array.isArray(fgas.completion_document_urls) ? fgas.completion_document_urls : [];
  const completionPaths = raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0 && !p.includes("..") && !p.startsWith("/"));
  return { requested: true, status: typeof fgas.status === "string" ? fgas.status : null, completionPaths };
}
