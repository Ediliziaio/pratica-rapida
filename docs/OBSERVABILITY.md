# Observability — Sentry

Pratica Rapida is wired for Sentry error reporting in both the React frontend and
the Supabase edge functions. The integration is a **no-op until the DSN env vars
are set**, so nothing needs to change in code once you create the Sentry account.

## 1. Create the Sentry account and projects

1. Sign up for a free account at <https://sentry.io>.
2. Create two projects in your Sentry org:
   - **Project A — React** (platform: `React` or `JavaScript`). Used by the
     browser app. Copy its DSN → this is `VITE_SENTRY_DSN`.
   - **Project B — Edge functions** (platform: `Deno` if available,
     otherwise `JavaScript`/generic). Used by the Supabase functions. Copy its
     DSN → this is `SENTRY_DSN_EDGE`.

Keeping them separate lets you filter/alert on browser vs. backend issues.

## 2. Frontend — `VITE_SENTRY_DSN`

The React app reads `import.meta.env.VITE_SENTRY_DSN` at startup
(`src/lib/sentry.ts`). When it is unset, `initSentry()` simply returns and
nothing is reported.

Add the DSN in three places:

- **Local development** — `.env` (or `.env.local`), not committed:
  ```
  VITE_SENTRY_DSN=https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>
  ```
- **GitHub Secrets** — repository settings → Secrets and variables → Actions.
  Add `VITE_SENTRY_DSN` so CI/Preview builds pick it up.
- **Cloudflare Pages** — Project → Settings → Environment variables. Add
  `VITE_SENTRY_DSN` for both Production and Preview environments. Vite inlines
  `VITE_*` variables at build time, so a redeploy is required after setting it.

## 3. Edge functions — `SENTRY_DSN_EDGE`

The edge functions use a tiny helper (`supabase/functions/_shared/error.ts`)
that POSTs to the Sentry store endpoint only when `SENTRY_DSN_EDGE` is set —
no SDK is pulled in so cold-start latency stays flat.

Set the secret on Supabase:

```sh
supabase secrets set SENTRY_DSN_EDGE="https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>" \
  --project-ref xmkjrhwmmuzaqjqlvzxm
```

Then redeploy the affected functions (or they will pick it up on the next
deploy):

```sh
for fn in on-practice-created on-stage-changed process-automations send-email send-whatsapp whatsapp-webhook; do
  supabase functions deploy "$fn" --project-ref xmkjrhwmmuzaqjqlvzxm --no-verify-jwt
done
```

## 4. Verifying

- Frontend: in a build with the DSN set, open DevTools → Network and trigger an
  error inside an `ErrorBoundary`-wrapped component — you should see a POST to
  `*.ingest.sentry.io`.
- Edge: call any of the six wired functions with intentionally bad input, then
  check the Sentry project's Issues stream. The `fn` tag in the extra context
  tells you which function reported the error.

## 5. What is already wired

Frontend (`src/lib/sentry.ts`, `src/main.tsx`, `src/components/ErrorBoundary.tsx`,
`src/hooks/useAuth.tsx`):

- `initSentry()` is called at startup with browser tracing + session replay on
  errors. All no-ops without a DSN.
- `ErrorBoundary.componentDidCatch` forwards uncaught render errors.
- `useAuth` syncs `Sentry.setUser({ id, email })` whenever the Supabase user
  changes, and clears it on logout.

Edge functions (`supabase/functions/_shared/error.ts`):

- `on-practice-created`, `on-stage-changed`, `process-automations`,
  `send-email`, `send-whatsapp`, `whatsapp-webhook` all call `reportError` from
  their catch blocks and top-level handler wraps. Legacy functions
  (`notify-cliente`, `send-reminders`, `elevenlabs-call`, `google-calendar`,
  `create-user`, `create-company-user`) are intentionally skipped.
