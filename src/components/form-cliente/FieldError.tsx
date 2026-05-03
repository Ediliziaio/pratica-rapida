// Helper minimale per mostrare un messaggio d'errore inline sotto un campo.
// Tenuto separato per evitare di duplicare la stessa stringa in ogni step.

import type { ErrorMap } from "./validation";

interface Props {
  errors: ErrorMap;
  field: string;
}

export function FieldError({ errors, field }: Props) {
  const msg = errors[field];
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}
