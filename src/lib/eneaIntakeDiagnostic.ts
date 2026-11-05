/** Diagnostica del form ENEA: solo codici e conteggi, mai dati del cliente o file. */
export type EneaIntakeEvent = "question_shown" | "validation_failed" | "submit_failed";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export function intakeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const value = error as { code?: unknown; statusCode?: unknown; status?: unknown };
  const raw = value.code ?? value.statusCode ?? value.status;
  return typeof raw === "string" || typeof raw === "number"
    ? String(raw).slice(0, 48) : "unknown";
}

export function intakeDiagnosticDetails(input: {
  event: EneaIntakeEvent;
  attemptId?: string;
  phase: string;
  code?: string;
  fields?: string[];
  service: string | null;
  documentsMode: string | null;
  product: string | null;
  route: string;
  selectedFiles: Record<string, number>;
}) {
  return {
    event: input.event,
    attempt_id: input.attemptId && /^[0-9a-f-]{36}$/i.test(input.attemptId) ? input.attemptId : null,
    phase: input.phase.slice(0, 40),
    code: (input.code ?? "none").slice(0, 48),
    fields: (input.fields ?? []).filter((field) => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(field)).slice(0, 30),
    service: input.service,
    documents_mode: input.documentsMode,
    product: input.product,
    route: input.route.slice(0, 100),
    main_asset: typeof document === "undefined" ? null :
      document.querySelector('script[type="module"][src]')?.getAttribute("src")?.slice(0, 120) ?? null,
    selected_files: input.selectedFiles,
  };
}

/** Non blocca mai l'invio. Il server associa l'evento a un'azienda nota senza salvare l'email. */
export function recordPublicIntakeDiagnostic(companyEmail: string, companyName: string, details: ReturnType<typeof intakeDiagnosticDetails>): void {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) return;
  void fetch(`${SUPABASE_URL}/functions/v1/enea-intake-diagnostic`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
    body: JSON.stringify({ company_email: companyEmail.trim(), company_name: companyName.trim(), details }),
    keepalive: true,
  }).catch(() => {});
}
