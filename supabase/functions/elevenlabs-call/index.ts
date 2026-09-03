import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { puoContattareCliente } from "../_shared/contatto-cliente.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const DEFAULT_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WA_ELEVENLABS_PHONE_ID")!;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0039")) return "+" + digits.slice(4);
  if (digits.startsWith("39") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0")) return "+39" + digits.slice(1);
  return "+" + digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { practice_id: string; agent_id?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { practice_id, agent_id, language } = body;

  if (!practice_id) {
    return Response.json({ success: false, error: "practice_id is required" }, { status: 400 });
  }

  // Fetch the practice
  const { data: practice, error: practiceError } = await supabase
    .from("enea_practices")
    .select("id, cliente_telefono, cliente_nome, brand, tipo_servizio")
    .eq("id", practice_id)
    .single();

  if (practiceError || !practice) {
    return Response.json(
      { success: false, error: practiceError?.message ?? "Practice not found" },
      { status: 404 }
    );
  }

  if (!practice.cliente_telefono) {
    return Response.json(
      { success: false, error: "Practice has no phone number" },
      { status: 422 }
    );
  }

  // Con "documenti forniti" il cliente finale non va contattato su NESSUN
  // canale, e una telefonata a sorpresa e' il contatto piu' invadente di tutti:
  // quel cliente non ci ha chiesto niente, ha comprato dal rivenditore e
  // spesso non sa nemmeno che esistiamo. Il blocco sta qui e non nel chiamante
  // perche' questa function e' raggiungibile sia dalle automazioni
  // (action type elevenlabs_call) sia a mano dal CRM.
  if (!puoContattareCliente(practice)) {
    return Response.json(
      {
        success: false,
        error:
          "Pratica con documenti forniti dal rivenditore: il cliente finale non va contattato.",
      },
      { status: 422 }
    );
  }

  const toNumber = normalizePhone(practice.cliente_telefono);
  const resolvedAgentId = agent_id || DEFAULT_AGENT_ID;

  const callPayload = {
    agent_id: resolvedAgentId,
    agent_phone_number_id: PHONE_NUMBER_ID,
    to_number: toNumber,
    conversation_initiation_client_data: {
      conversation_config_override: {
        agent: {
          first_message:
            "Ciao {{nome}}, sono l'assistente di Pratica Rapida. La chiamo per la sua pratica ENEA. Ha un momento?",
        },
      },
      dynamic_variables: {
        nome: practice.cliente_nome ?? "",
        brand: practice.brand ?? "",
      },
    },
  };

  const response = await fetch(
    "https://api.elevenlabs.io/v1/convai/conversations/outbound_call",
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(callPayload),
    }
  );

  const result = await response.json();
  const success = response.ok;
  const call_id: string | null = result?.conversation_id ?? result?.call_id ?? null;
  const error_message: string | null = result?.detail ?? result?.error ?? null;

  // Log the call in communication_log
  await supabase.from("communication_log").insert({
    practice_id,
    channel: "phone",
    direction: "outbound",
    recipient: toNumber,
    body_preview: `ElevenLabs AI call — agent: ${resolvedAgentId}`,
    status: success ? "sent" : "failed",
    wa_message_id: call_id ?? null,
    error_message: error_message ?? null,
  });

  return Response.json({ success, call_id });
});
