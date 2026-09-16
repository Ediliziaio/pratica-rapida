// CRM ombra: la stessa app, puntata su un secondo progetto Supabase, in cui
// lavora APR al posto dell'operatore. Si attiva SOLO con VITE_CRM_OMBRA=true
// (file .env.ombra, avvio con `vite --mode ombra`). In produzione è false.
export const CRM_OMBRA: boolean = import.meta.env.VITE_CRM_OMBRA === "true";

// Il server locale che legge le domande APR e scrive il ledger risposte
// (src/features/enea-shadow-crm/operator-answers/server.ts). Solo loopback.
export const CRM_OMBRA_DOMANDE_URL: string = (import.meta.env.VITE_CRM_OMBRA_DOMANDE_URL as string | undefined) ?? "http://127.0.0.1:8790";
