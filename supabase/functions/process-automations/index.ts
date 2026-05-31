import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";
import { normalizePhone } from "../_shared/phone.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[process-automations] Missing env: ${k}`);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isBusinessHour(): boolean {
  // Use Intl to correctly handle Rome timezone (CET=+1, CEST=+2 during DST).
  const romeHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  return romeHour >= 9 && romeHour < 18;
}

function buildFormLink(token: string): string {
  return `https://app.praticarapida.it/form/${token}`;
}

/**
 * Invoca una edge function interna. Controlla che la risposta sia 2xx,
 * altrimenti throw — così il chiamante può decidere se ritentare o
 * lasciare la pratica "non claimed" per il prossimo cron tick.
 *
 * Prima del fix: questa funzione faceva fire-and-forget — un 4xx/5xx
 * dell'edge function veniva ignorato e il flow continuava marcando
 * `ultimo_sollecito_*` come se fosse partito (perdita di sollecito).
 */
async function invoke(
  supabase: ReturnType<typeof createClient>,
  fnName: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`invoke ${fnName} failed: HTTP ${res.status} — ${JSON.stringify(json)}`);
  }
  // Anche con 2xx, l'edge function può ritornare { success: false } nel body
  // (es. send-whatsapp con token scaduto risponde 200 + success:false).
  if (json && typeof json === "object" && "success" in json && json.success === false) {
    throw new Error(`invoke ${fnName} returned success:false — ${JSON.stringify(json)}`);
  }
  return json as Record<string, unknown>;
}

// ============================================================
// Condition evaluator — applica i filtri della rule alla pratica
// ============================================================
//
// L'admin nella UI può configurare condizioni AND tipo:
//   - prodotto_tipo = "infissi"
//   - brand = "ENEA"
//   - tipo_servizio = "servizio_completo"
//   - pagamento_stato != "pagata"
//
// Prima del fix: il cron leggeva la rule MA ignorava il campo
// `trigger_config.conditions` → la rule veniva applicata a TUTTE le
// pratiche del trigger, anche quelle che non matchavano i filtri.
// Risultato: messaggi inviati a clienti sbagliati.
//
// Adesso: per ogni pratica candidata valuta tutte le conditions in AND.
// Se anche UNA fallisce, skip della pratica. Fail-open: campi non
// riconosciuti (es. cliente_provincia non ancora supportato) loggano
// warn e considerano la condition come passed (non bloccano la rule).

interface RuleCondition {
  id?: string;
  field: string;
  operator: string;
  value: string;
}

/**
 * Estrae le conditions dalla rule. La UI le salva sotto
 * `trigger_config.conditions` come array. Le rules legacy (senza
 * conditions o con conditions vuote) → array vuoto = sempre match.
 */
function getRuleConditions(rule: Record<string, unknown>): RuleCondition[] {
  const cfg = rule.trigger_config as { conditions?: RuleCondition[] } | null;
  if (!cfg || !Array.isArray(cfg.conditions)) return [];
  return cfg.conditions.filter((c) => c && typeof c.field === "string");
}

/**
 * Legge il valore del campo dalla pratica. Mappa nome-condition →
 * proprietà della pratica (oppure derived value).
 */
function readFieldValue(
  field: string,
  practice: Record<string, unknown>,
  stage?: { name?: string; stage_type?: string } | null,
): string | number | boolean | null {
  switch (field) {
    case "brand": {
      const b = (practice.brand as string | undefined)?.toLowerCase();
      if (b === "enea") return "ENEA";
      if (b === "conto_termico" || b === "ct") return "CT";
      return b ?? null;
    }
    case "prodotto_tipo": {
      // Match flessibile sul testo libero `prodotto_installato`
      // (es. "Infissi / Serramenti" → "infissi", "Caldaia gas" → "caldaia")
      const p = (practice.prodotto_installato as string | undefined)?.toLowerCase() ?? "";
      if (p.includes("infissi") || p.includes("serramenti")) return "infissi";
      if (p.includes("schermatur")) return "schermature";
      if (p.includes("caldaia")) return "caldaia";
      if (p.includes("termic") || p.includes("pompa di calore")) return "impianto_termico";
      if (p.includes("fotovoltaic") || p.includes("solare")) return "fotovoltaico";
      return p || null;
    }
    case "tipo_servizio":
      return (practice.tipo_servizio as string | undefined) ?? null;
    case "tipo_intervento":
      return (practice.tipo_intervento as string | undefined) ?? null;
    case "stage_name":
      return stage?.name ?? null;
    case "stage_type":
      return stage?.stage_type ?? null;
    case "priorita":
      return (practice.priorita as string | undefined) ?? null;
    case "pagamento_stato":
      return (practice.pagamento_stato as string | undefined) ?? "non_pagata";
    case "is_free":
      return !!practice.is_free;
    case "form_compilato":
      return !!practice.form_compilato_at;
    case "has_all_documents": {
      const mancanti = practice.documenti_mancanti as string[] | undefined;
      return !mancanti || mancanti.length === 0;
    }
    case "cliente_ha_email":
      return !!practice.cliente_email;
    case "cliente_ha_whatsapp":
      return !!practice.cliente_telefono;
    case "prezzo_netto":
      return (practice.prezzo_netto as number | undefined) ?? 0;
    case "giorni_da_creazione": {
      const created = practice.created_at as string | undefined;
      if (!created) return 0;
      return Math.floor((Date.now() - new Date(created).getTime()) / (1000 * 60 * 60 * 24));
    }
    default:
      // Field non riconosciuto (es. cliente_provincia, tag_contains).
      // Ritorniamo `undefined` → l'evaluator lo tratta come "skip non
      // bloccante" così le rules continuano a funzionare anche con
      // filtri non ancora cablati.
      return undefined as unknown as null;
  }
}

/**
 * Valuta una singola condition contro la pratica. Ritorna true se
 * match, false se non match. Campi sconosciuti → true (non bloccante).
 */
function evaluateCondition(
  condition: RuleCondition,
  practice: Record<string, unknown>,
  stage?: { name?: string; stage_type?: string } | null,
): boolean {
  const fieldValue = readFieldValue(condition.field, practice, stage);
  // FAIL-CLOSED: campo non cablato → consideriamo la condizione NON soddisfatta.
  // Comportamento precedente: ritornava true (fail-open) → la regola scattava su
  // TUTTE le pratiche del trigger anche quando il filtro era pensato per
  // colpirne pochissime, spammando clienti fuori flusso (es. mail a Moroni di
  // FV Tende). Meglio non inviare che inviare al destinatario sbagliato.
  if (fieldValue === undefined) {
    console.warn(`[evaluateCondition] field "${condition.field}" not supported — failing condition closed (no send)`);
    return false;
  }
  const targetValue = condition.value;
  switch (condition.operator) {
    case "eq":
      // Caso booleano: "true"/"false" → confronto bool
      if (targetValue === "true") return fieldValue === true;
      if (targetValue === "false") return fieldValue === false || fieldValue === null;
      return String(fieldValue ?? "").toLowerCase() === targetValue.toLowerCase();
    case "neq":
      return String(fieldValue ?? "").toLowerCase() !== targetValue.toLowerCase();
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(targetValue.toLowerCase());
    case "not_contains":
      return !String(fieldValue ?? "").toLowerCase().includes(targetValue.toLowerCase());
    case "gte":
      return Number(fieldValue ?? 0) >= Number(targetValue);
    case "lte":
      return Number(fieldValue ?? 0) <= Number(targetValue);
    default:
      // FAIL-CLOSED: operatore sconosciuto → condizione NON soddisfatta.
      console.warn(`[evaluateCondition] operator "${condition.operator}" not supported — failing condition closed (no send)`);
      return false;
  }
}

/**
 * Valuta tutte le conditions di una rule contro una pratica (AND).
 * Se non ci sono conditions → match per default (backward compat).
 */
function rulePassesConditions(
  rule: Record<string, unknown>,
  practice: Record<string, unknown>,
  stage?: { name?: string; stage_type?: string } | null,
): boolean {
  const conditions = getRuleConditions(rule);
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, practice, stage));
}

serve(async () => {
  if (!isBusinessHour()) {
    return Response.json({ processed: 0, reason: "outside_business_hours" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_enabled", true)
    .order("order_index");

  if (!rules?.length) return Response.json({ processed: 0 });

  let processed = 0;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const rule of rules) {
    try {
      const romeHour = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Europe/Rome",
          hour: "numeric",
          hour12: false,
        }).format(new Date()),
        10,
      );
      const ruleMin = (rule as { min_hour?: number }).min_hour ?? 9;
      const ruleMax = (rule as { max_hour?: number }).max_hour ?? 18;
      if (romeHour < ruleMin || romeHour >= ruleMax) continue; // skip rule outside its window

      switch (rule.trigger_event) {

        case "days_waiting_7": {
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale)")
            .eq("tipo_servizio", "servizio_completo")
            .is("archived_at", null)
            .is("form_compilato_at", null)
            .or(`ultimo_sollecito_privato.is.null,ultimo_sollecito_privato.lt.${sevenDaysAgo}`);

          for (const p of practices ?? []) {
            // Applica filtri condition della rule (es. solo infissi, solo ENEA, ecc.).
            // Skippa la pratica se non match. Backward compat: rules senza
            // conditions (legacy) restituiscono true e procedono normalmente.
            if (!rulePassesConditions(rule as Record<string, unknown>, p as Record<string, unknown>)) {
              continue;
            }
            // Per-practice try/catch: se un invio fallisce vogliamo loggare
            // e continuare con le altre, non bloccare l'intero loop. La
            // pratica fallita verrà riprovata al prossimo cron tick perché
            // `ultimo_sollecito_privato` non viene aggiornato.
            try {
              if (rule.channel === "email" && p.cliente_email) {
                await invoke(supabase, "send-email", {
                  to: p.cliente_email,
                  // rule.template_id è il nome del template salvato dall'admin
                  // in /admin/automazioni. Fallback a "sollecito_privato" se
                  // mancante (regola legacy senza template configurato).
                  template: (rule as { template_id?: string }).template_id ?? "sollecito_privato",
                  data: {
                    nome: p.cliente_nome,
                    link: buildFormLink(p.form_token),
                    practice_id: p.id,
                    trigger_event: rule.trigger_event, // per dedup metadata-based
                  },
                });
              }
              if (rule.channel === "whatsapp" && p.cliente_telefono) {
                await invoke(supabase, "send-whatsapp", {
                  to: normalizePhone(p.cliente_telefono),
                  // Idem per WhatsApp: usa template_id dalla rule. L'admin può
                  // remappare il template senza dover ridepoyare l'edge function.
                  template_name: (rule as { template_id?: string }).template_id ?? "sollecito_compilazione",
                  components: [{
                    type: "body",
                    parameters: [
                      { type: "text", text: p.cliente_nome },
                      { type: "text", text: buildFormLink(p.form_token) },
                      { type: "text", text: "30 giorni" },
                    ],
                  }],
                  practice_id: p.id,
                });
              }
              // Solo se l'invio è andato a buon fine aggiorniamo il marker
              // di idempotency. Altrimenti la pratica resta "eligible" per
              // il prossimo cron tick.
              await supabase.from("enea_practices").update({
                ultimo_sollecito_privato: new Date().toISOString(),
                conteggio_solleciti: (p.conteggio_solleciti ?? 0) + 1,
              }).eq("id", p.id);
            } catch (sendErr) {
              console.error(`[days_waiting_7] practice ${p.id} send failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
                channel: rule.channel,
              });
            }
          }
          processed++;
          break;
        }

        case "days_waiting_fornitore_30":
        case "days_waiting_fornitore_60":
        case "days_waiting_fornitore_90": {
          const days = parseInt(rule.trigger_event.split("_").pop() ?? "30");
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          // Idempotency: require that either no fornitore sollecito has ever been sent,
          // OR the last one is older than `days` — so a second cron tick in the same
          // hour/day won't re-send for practices that already received a reminder.
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale, email)")
            .is("archived_at", null)
            .is("form_compilato_at", null)
            .lt("created_at", cutoff)
            .or(`ultimo_sollecito_fornitore.is.null,ultimo_sollecito_fornitore.lt.${cutoff}`);

          for (const p of practices ?? []) {
            // Applica filtri condition della rule (es. solo infissi, solo ENEA, ecc.).
            // Skippa la pratica se non match. Backward compat: rules senza
            // conditions (legacy) restituiscono true e procedono normalmente.
            if (!rulePassesConditions(rule as Record<string, unknown>, p as Record<string, unknown>)) {
              continue;
            }
            const resellerEmail = (p.companies as { email?: string })?.email;
            if (!resellerEmail) continue;
            try {
              await invoke(supabase, "send-email", {
                to: resellerEmail,
                template: (rule as { template_id?: string }).template_id ?? "sollecito_fornitore",
                data: {
                  giorni: String(days),
                  cliente_nome: p.cliente_nome,
                  cliente_cognome: p.cliente_cognome,
                  stato: "In attesa",
                  tentativi: String(p.conteggio_solleciti),
                  practice_id: p.id,
                  trigger_event: rule.trigger_event, // per dedup metadata-based
                },
              });
              // Mark to prevent duplicate sends on subsequent cron ticks
              await supabase
                .from("enea_practices")
                .update({ ultimo_sollecito_fornitore: new Date().toISOString() })
                .eq("id", p.id);
            } catch (sendErr) {
              console.error(`[days_waiting_fornitore_${days}] practice ${p.id} failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
              });
            }
          }
          processed++;
          break;
        }

        case "recensione_7d_followup": {
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*")
            .is("archived_at", null)
            .is("recensione_ricevuta_at", null)
            .lt("recensione_richiesta_at", sevenDaysAgo);

          for (const p of practices ?? []) {
            // Applica filtri condition della rule (es. solo infissi, solo ENEA, ecc.).
            // Skippa la pratica se non match. Backward compat: rules senza
            // conditions (legacy) restituiscono true e procedono normalmente.
            if (!rulePassesConditions(rule as Record<string, unknown>, p as Record<string, unknown>)) {
              continue;
            }
            try {
              // Skip if we already sent a review follow-up.
              // PRIMA: si faceva match testuale `subject ILIKE %recensione%` OR
              // `body_preview ILIKE %sollecito_recensione%`. Era FRAGILE: quando
              // il template scelto era inesistente, il subject sparato dal
              // fallback era "Notifica da Pratica Rapida" e il body non
              // conteneva "sollecito_recensione" — la dedup NON matchava mai
              // e il cron rispediva la stessa mail vuota ogni giorno per
              // settimane (loop infinito). Vedi Moroni FV Tende.
              // ADESSO: match esatto su metadata->>'trigger_event' = trigger
              // corrente, scritto da send-email per ogni invio.
              const { data: alreadySent } = await supabase
                .from("communication_log")
                .select("id")
                .eq("practice_id", p.id)
                .in("channel", ["email", "whatsapp"])
                .eq("status", "sent")
                .filter("metadata->>trigger_event", "eq", rule.trigger_event)
                .limit(1)
                .maybeSingle();
              if (alreadySent) continue;

              if (p.cliente_email) {
                await invoke(supabase, "send-email", {
                  to: p.cliente_email,
                  // Rispetta rule.template_id se configurato; fallback al
                  // template di default "recensione" (per compatibilità
                  // con regole legacy).
                  template: rule.channel === "email"
                    ? ((rule as { template_id?: string }).template_id ?? "recensione")
                    : "recensione",
                  data: {
                    nome: p.cliente_nome,
                    token: p.form_token,
                    base_url: "https://app.praticarapida.it",
                    practice_id: p.id,
                    trigger_event: rule.trigger_event, // per dedup metadata-based
                  },
                });
              }
              if (p.cliente_telefono) {
                // Fallback "sollecito_recensione" era un nome template LEGACY
                // non più in getDefaultTemplates() v3. Inviarlo a Meta torna
                // #132001. Fallback corretto v3: pratica_inviata_recensione
                // (che include sia notifica invio sia richiesta recensione).
                await invoke(supabase, "send-whatsapp", {
                  to: normalizePhone(p.cliente_telefono),
                  template_name: rule.channel === "whatsapp"
                    ? ((rule as { template_id?: string }).template_id ?? "pratica_inviata_recensione")
                    : "pratica_inviata_recensione",
                  components: [{
                    type: "body",
                    parameters: [
                      { type: "text", text: p.cliente_nome },
                      { type: "text", text: p.cliente_email ?? "—" },
                    ],
                  }],
                  practice_id: p.id,
                });
              }
            } catch (sendErr) {
              console.error(`[recensione_7d_followup] practice ${p.id} failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
              });
            }
          }
          processed++;
          break;
        }

        // ============================================================
        // pratica_pagata: invio thank-you / richiesta recensione quando
        // una pratica viene marcata come pagata. Polling-based: cerca
        // pratiche pagate nelle ultime 48h che non hanno ancora ricevuto
        // il template di ringraziamento (matching via communication_log).
        // ============================================================
        case "pratica_pagata": {
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale)")
            .eq("pagamento_stato", "pagata")
            .gte("data_incasso", twoDaysAgo);

          for (const p of practices ?? []) {
            if (!rulePassesConditions(rule as Record<string, unknown>, p as Record<string, unknown>)) {
              continue;
            }
            // Idempotency: skip se questa rule è già scattata su questa pratica
            // dopo la data di incasso.
            // PRIMA: si faceva `body_preview ILIKE %templateId%` ma il
            // body_preview NON contiene il nome del template (solo i primi 200
            // caratteri dell'HTML), quindi non matchava mai → re-inviava ad
            // ogni cron tick per ~48h.
            // ADESSO: match esatto su metadata->>'trigger_event' = 'pratica_pagata'
            // scoped sul canale e su sent_at >= data_incasso.
            const templateId = (rule as { template_id?: string }).template_id;
            if (p.data_incasso) {
              const { data: alreadySent } = await supabase
                .from("communication_log")
                .select("id")
                .eq("practice_id", p.id)
                .eq("channel", rule.channel)
                .eq("status", "sent")
                .filter("metadata->>trigger_event", "eq", rule.trigger_event)
                .gte("sent_at", p.data_incasso)
                .limit(1)
                .maybeSingle();
              if (alreadySent) continue;
            }

            try {
              if (rule.channel === "email" && p.cliente_email) {
                await invoke(supabase, "send-email", {
                  to: p.cliente_email,
                  template: templateId ?? "pratica_inviata",
                  data: {
                    nome: p.cliente_nome,
                    cognome: p.cliente_cognome,
                    practice_id: p.id,
                    link: p.form_token
                      ? `https://app.praticarapida.it/recensione/${p.form_token}`
                      : "",
                    trigger_event: rule.trigger_event, // per dedup metadata-based
                  },
                });
              }
              if (rule.channel === "whatsapp" && p.cliente_telefono) {
                // Fallback "pratica_completata" era LEGACY (5 template vecchi),
                // sostituito dal v3 "pratica_inviata_recensione" che include
                // notifica chiusura + email destinazione + richiesta recensione.
                // Senza questo fix: cron tentava invio template inesistente → #132001.
                await invoke(supabase, "send-whatsapp", {
                  to: normalizePhone(p.cliente_telefono),
                  template_name: templateId ?? "pratica_inviata_recensione",
                  components: [{
                    type: "body",
                    parameters: [
                      { type: "text", text: p.cliente_nome },
                      { type: "text", text: p.cliente_email ?? "—" },
                    ],
                  }],
                  practice_id: p.id,
                });
              }
            } catch (sendErr) {
              console.error(`[pratica_pagata] practice ${p.id} failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
              });
            }
          }
          processed++;
          break;
        }
      }
    } catch (err) {
      console.error(`Error processing rule ${rule.name}:`, err);
      await reportError(err, {
        fn: "process-automations",
        rule_name: rule.name,
        rule_id: (rule as { id?: string }).id,
        trigger_event: rule.trigger_event,
      });
    }
  }

  return Response.json({ processed });
});
