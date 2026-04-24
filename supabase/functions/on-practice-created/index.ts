import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[on-practice-created] Missing env: ${k}`);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function invoke(fnName: string, body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`invoke(${fnName}) failed: ${res.status} ${errText}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`invoke(${fnName}) threw:`, err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let practice_id: string | undefined;
  try {
    const body = await req.json();
    practice_id = body.practice_id;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!practice_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing practice_id" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: practice } = await supabase
    .from("enea_practices")
    .select("*, companies:reseller_id(ragione_sociale, email)")
    .eq("id", practice_id)
    .single();

  if (!practice) {
    return new Response(JSON.stringify({ ok: false, error: "Practice not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const resellerEmail = (practice.companies as { email?: string })?.email;
  const resellerName = (practice.companies as { ragione_sociale?: string })?.ragione_sociale ?? "";

  const brandLabel = practice.brand === "enea" ? "ENEA" : "Conto Termico";

  // Track per-step success so the caller can detect partial failure
  const steps: Record<string, boolean> = {};

  // 1. Email di conferma al rivenditore
  if (resellerEmail) {
    steps.reseller_email = await invoke("send-email", {
      to: resellerEmail,
      template: "pratica_ricevuta",
      data: {
        nome: resellerName,
        cliente_nome: practice.cliente_nome,
        cliente_cognome: practice.cliente_cognome,
        brand: brandLabel,
        practice_id,
      },
    });
  }

  // 2. Primo contatto WA al cliente privato
  if (practice.tipo_servizio === "servizio_completo" && practice.cliente_telefono) {
    const phone = practice.cliente_telefono.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
    steps.client_wa = await invoke("send-whatsapp", {
      to: phone,
      template_name: "contatta_cliente",
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: practice.cliente_nome },
          { type: "text", text: resellerName },
          { type: "text", text: `https://pratica-rapida.it/form/${practice.form_token}` },
        ],
      }],
      practice_id,
    });
  }

  // 3. Email al cliente finale (solo servizio_completo)
  if (practice.tipo_servizio === "servizio_completo" && practice.cliente_email) {
    steps.client_email = await invoke("send-email", {
      to: practice.cliente_email,
      template: "richiesta_form",
      data: {
        nome: practice.cliente_nome,
        reseller: resellerName,
        prodotto: practice.prodotto_installato ?? "prodotto installato",
        link: `https://pratica-rapida.it/form/${practice.form_token}`,
        practice_id,
      },
    });
  }

  const allOk = Object.values(steps).every(Boolean);
  return new Response(JSON.stringify({ ok: allOk, steps }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
