export interface AprGlobalShadowUserAuthorization {
  source: "user";
  phrase: "APR operativo ombra";
}

/**
 * Unica semantica runtime per il gate globale APR OMBRA.
 * Nessun booleano legacy, default o frase simile viene considerato equivalente
 * all'autorizzazione esplicita dell'utente.
 */
export function hasExplicitAprShadowAuthorization(
  authorization: unknown,
): authorization is AprGlobalShadowUserAuthorization {
  const value = authorization as {
    source?: unknown;
    phrase?: unknown;
  } | null | undefined;

  return value?.source === "user"
    && value.phrase === "APR operativo ombra";
}
