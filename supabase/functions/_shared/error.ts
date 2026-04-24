// Lightweight error reporter for Supabase edge functions.
// - Always logs to console (captured by Supabase logs)
// - Additionally POSTs to Sentry via the store API if SENTRY_DSN_EDGE is set
// Designed to avoid pulling the full Sentry SDK (which adds cold-start latency).

const DSN = Deno.env.get("SENTRY_DSN_EDGE");

export async function reportError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[error] ${message}`, { ...context, stack });

  if (!DSN) return;

  try {
    // Parse Sentry DSN format: https://<key>@<host>/<project>
    const match = DSN.match(/https:\/\/([^@]+)@([^/]+)\/(\d+)/);
    if (!match) return;
    const [, key, host, project] = match;
    const url = `https://${host}/api/${project}/store/`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7,sentry_key=${key}`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        platform: "javascript",
        timestamp: new Date().toISOString(),
        extra: { ...context, stack },
      }),
    });
  } catch (_) {
    // swallow — don't let Sentry failures mask the original error
  }
}
