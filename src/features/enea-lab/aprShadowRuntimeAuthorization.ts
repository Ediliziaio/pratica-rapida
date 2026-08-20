import type { AprGlobalShadowUserAuthorization } from "./aprShadowAuthorization";

/**
 * Bridge auditabile tra il gate espresso nella Cabina di Regia e il runtime
 * ENEA Lab. Deve restare undefined finche l'utente non comunica esattamente
 * "APR operativo ombra". L'attivazione futura richiede una modifica esplicita,
 * piccola e reversibile su questo solo file, dopo il preflight del ramo.
 *
 * Nessun default, variabile ambiente o toggle UI puo concedere il gate.
 */
export const APR_SHADOW_RUNTIME_AUTHORIZATION: AprGlobalShadowUserAuthorization | undefined = undefined;
