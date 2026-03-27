import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// -----------------------------------------------
// Google JWT auth via Service Account
// -----------------------------------------------
async function getGoogleToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  const unsigned = `${header}.${payload}`;

  // Import private key
  const pemBody = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await res.json();
  return access_token;
}

const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";

// -----------------------------------------------
// serve
// -----------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    const token = await getGoogleToken();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // ---- CREATE EVENT ----
    if (action === "create-event" && req.method === "POST") {
      const body = await req.json();
      const event = {
        summary: body.title,
        description: body.description ?? "",
        start: { dateTime: body.start_datetime, timeZone: "Europe/Rome" },
        end: { dateTime: body.end_datetime, timeZone: "Europe/Rome" },
        attendees: (body.attendees ?? []).map((e: string) => ({ email: e })),
        conferenceData: body.meet_link ? undefined : {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } }
        },
      };

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?conferenceDataVersion=1`,
        { method: "POST", headers, body: JSON.stringify(event) }
      );
      const created = await res.json();

      // Salva in DB
      const { data: saved } = await supabase.from("calendar_events").insert({
        pratica_id: body.pratica_id ?? null,
        client_id: body.client_id ?? null,
        google_event_id: created.id,
        title: body.title,
        description: body.description ?? null,
        start_datetime: body.start_datetime,
        end_datetime: body.end_datetime,
        attendees: body.attendees ?? [],
        meet_link: created.hangoutLink ?? body.meet_link ?? null,
        status: "confirmed",
      }).select().single();

      return Response.json({ success: true, event: saved }, { headers: CORS });
    }

    // ---- UPDATE EVENT ----
    if (action === "update-event" && req.method === "POST") {
      const body = await req.json();
      const { google_event_id, ...updates } = body;

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${google_event_id}`,
        { method: "PATCH", headers, body: JSON.stringify({
          summary: updates.title,
          description: updates.description,
          start: { dateTime: updates.start_datetime, timeZone: "Europe/Rome" },
          end: { dateTime: updates.end_datetime, timeZone: "Europe/Rome" },
        }) }
      );
      const updated = await res.json();

      await supabase.from("calendar_events")
        .update({ title: updates.title, start_datetime: updates.start_datetime, end_datetime: updates.end_datetime })
        .eq("google_event_id", google_event_id);

      return Response.json({ success: true, event: updated }, { headers: CORS });
    }

    // ---- DELETE EVENT ----
    if (action === "delete-event" && req.method === "DELETE") {
      const { google_event_id } = await req.json();

      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${google_event_id}`,
        { method: "DELETE", headers }
      );

      await supabase.from("calendar_events").update({ status: "cancelled" }).eq("google_event_id", google_event_id);

      return Response.json({ success: true }, { headers: CORS });
    }

    // ---- LIST EVENTS ----
    if (action === "list-events" && req.method === "GET") {
      const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
      const timeMin = `${month}-01T00:00:00Z`;
      const timeMax = new Date(new Date(timeMin).setMonth(new Date(timeMin).getMonth() + 1)).toISOString();

      const { data: events } = await supabase.from("calendar_events")
        .select("*")
        .gte("start_datetime", timeMin)
        .lt("start_datetime", timeMax)
        .order("start_datetime");

      return Response.json({ success: true, events }, { headers: CORS });
    }

    return Response.json({ error: "Azione non trovata" }, { status: 404, headers: CORS });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
