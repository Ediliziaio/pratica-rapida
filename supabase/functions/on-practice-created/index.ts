import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function invoke(fnName: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  const { practice_id } = await req.json();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: practice } = await supabase
    .from("enea_practices")
    .select("*, companies:reseller_id(ragione_sociale, email)")
    .eq("id", practice_id)
    .single();

  if (!practice) return Response.json({ ok: false, error: "Practice not found" });

  const resellerEmail = (practice.companies as { email?: string })?.email;
  const resellerName = (practice.companies as { ragione_sociale?: string })?.ragione_sociale ?? "";

  const brandLabel = practice.brand === "enea" ? "ENEA" : "Conto Termico";

  // 1. Email di conferma al rivenditore
  if (resellerEmail) {
    await invoke("send-email", {
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
  if (practice.tipo_servizio === "servizio_completo") {
    if (practice.cliente_telefono) {
      const phone = practice.cliente_telefono.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
      await invoke("send-whatsapp", {
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
  }

  // 3. Email al cliente finale (solo servizio_completo)
  if (practice.tipo_servizio === "servizio_completo" && practice.cliente_email) {
    await invoke("send-email", {
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

  return Response.json({ ok: true });
});
