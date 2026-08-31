/**
 * richiesta-pubblica — riceve le richieste dai form pubblici del sito
 * (/area-riservata-vecchia/*) SENZA login, al posto dei vecchi iframe
 * GoHighLevel. Parità di funzioni col form interno rivenditore:
 * fatturazione, tipo soggetto, upload fatture/documenti.
 *
 * Flusso:
 *  1. L'azienda si identifica con ragione sociale + email aziendale
 *  2. Abbinamento azienda:
 *     a. match per email su `companies` (case-insensitive)
 *     b. match per ragione sociale esatta (evita duplicati se l'email è diversa)
 *     c. nessun match → CREA automaticamente l'azienda (solo anagrafica:
 *        ragione sociale, email, telefono — NIENTE credenziali di accesso,
 *        quelle le invia lo staff dopo verifica)
 *  3. Insert in enea_practices (stage "inviata") + upload eventuali file
 *  4. Trigger on-practice-created → link compilazione al cliente finale
 *  5. Notifica in-app ai super_admin (segnala se l'azienda è nuova)
 *
 * Body: JSON puro, oppure multipart/form-data con:
 *   - campo "payload": JSON string
 *   - file "fatture" (multipli), file "documenti" (multipli)
 *
 * Anti-spam: honeypot ("website"). Limiti upload: 10 file, 10MB l'uno.
 * Deploy con --no-verify-jwt (form pubblico).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { PLACEHOLDER_COMPANY, PRIVATI_COMPANY } from "../_shared/reseller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_BUCKET = "enea-documents";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Payload {
  website?: string; // honeypot
  modulo?: string;
  prodotto?: string;
  // servizio_completo → noi contattiamo il cliente (stage "inviata")
  // documenti_forniti → il rivenditore ci dà tutto lui; il cliente NON va MAI
  //   contattato. Sotto-modalità in documenti_mode:
  //     · moduli_cartacei → tutto allegato → stage "pronte_da_fare" (niente form)
  //     · form_online     → il rivenditore compila lui il /form → stage
  //                         "attesa_compilazione" (poi promosso a pronte_da_fare)
  tipo_servizio?: "servizio_completo" | "documenti_forniti";
  documenti_mode?: "moduli_cartacei" | "form_online";
  // Solo con documenti_forniti: il rivenditore ha chiesto che la pratica
  // conclusa venga inviata anche al suo cliente (altrimenti non lo contattiamo
  // mai). Letto da on-stage-changed allo stage "da_inviare".
  invia_pratica_al_cliente?: boolean;
  // Servizio a pagamento diretto (es. visura catastale): non invia il link
  // "completa i tuoi dati" al cliente — il cliente sta già pagando.
  requires_payment?: boolean;
  // Chi sta compilando il form pubblico:
  //  · "rivenditore" (default) → dichiara la sua azienda, paga a fine mese
  //  · "privato" → è il cliente finale che chiede la pratica per sé e la paga
  //    subito con carta. Niente ragione sociale, niente invito rivenditore.
  richiedente_tipo?: "rivenditore" | "privato";
  tipo_fatturazione?: "rivenditore" | "cliente_finale";
  tipo_soggetto?: "persona_fisica" | "azienda_piva";
  azienda?: { ragione_sociale?: string; email?: string; telefono?: string };
  cliente?: { nome?: string; cognome?: string; telefono?: string; email?: string; cf?: string; indirizzo?: string };
  note?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Parse: JSON puro o multipart (payload + files) ──
  let p: Payload;
  // Categorie file (stesse del form interno): fattura sempre, doc_extra
  // (certificati/misure), libretto (pompe di calore), moduli_raccolta
  // (documenti forniti). "fatture"/"documenti" mantenute per retrocompat.
  let fattureFiles: File[] = [];
  let docExtraFiles: File[] = [];
  let librettoFiles: File[] = [];
  let moduliFiles: File[] = [];
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      p = JSON.parse((form.get("payload") as string) ?? "{}");
      const grab = (k: string) => form.getAll(k).filter((f): f is File => f instanceof File);
      fattureFiles = [...grab("fattura"), ...grab("fatture")];
      docExtraFiles = [...grab("doc_extra"), ...grab("documenti")];
      librettoFiles = grab("libretto");
      moduliFiles = grab("moduli_raccolta");
    } else {
      p = await req.json();
    }
  } catch {
    return json({ success: false, error: "Richiesta malformata" }, 400);
  }

  // Honeypot: finto success, nessun side-effect
  if (p.website && p.website.trim() !== "") {
    return json({ success: true });
  }

  // ── Validazione ──
  // Il privato richiede la pratica per sé: non ha un'azienda da dichiarare,
  // quindi la ragione sociale non è obbligatoria (e non va cercata in anagrafica).
  const isPrivato = p.richiedente_tipo === "privato";
  const ragione = p.azienda?.ragione_sociale?.trim() ?? "";
  const aziendaEmail = isPrivato ? "" : (p.azienda?.email?.trim().toLowerCase() ?? "");
  const nome = p.cliente?.nome?.trim() ?? "";
  const cognome = p.cliente?.cognome?.trim() ?? "";
  const telefono = p.cliente?.telefono?.trim() ?? "";
  const clienteEmail = p.cliente?.email?.trim() ?? "";
  if (!isPrivato && ragione.length < 2) return json({ success: false, error: "Ragione sociale obbligatoria" }, 400);
  // Al privato la ricevuta Stripe e il link per completare i dati arrivano via
  // email: senza, il pagamento sarebbe un vicolo cieco.
  if (isPrivato && !EMAIL_RE.test(clienteEmail)) {
    return json({ success: false, error: "Email obbligatoria per i clienti privati" }, 400);
  }
  // Email aziendale opzionale per clienti privati (campo vuoto ammesso).
  if (aziendaEmail && !EMAIL_RE.test(aziendaEmail)) return json({ success: false, error: "Email aziendale non valida" }, 400);
  if (nome.length < 2 || cognome.length < 2) return json({ success: false, error: "Nome e cognome del cliente obbligatori" }, 400);
  if (telefono.replace(/\D/g, "").length < 8) return json({ success: false, error: "Telefono del cliente non valido" }, 400);

  const allFiles = [...fattureFiles, ...docExtraFiles, ...librettoFiles, ...moduliFiles];
  if (allFiles.length > MAX_FILES) return json({ success: false, error: `Massimo ${MAX_FILES} file` }, 400);
  for (const f of allFiles) {
    if (f.size > MAX_FILE_SIZE) return json({ success: false, error: `File "${f.name}" troppo grande (max 10MB)` }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // ── 1. Abbinamento azienda: email → ragione sociale → crea ──
    let companyId: string | null = null;
    let matchType: "email" | "telefono" | "ragione_sociale" | "creata" | "privato" = "creata";

    // Contenitore di sistema (segnaposto / privati): lo riusiamo se esiste,
    // altrimenti lo creiamo al volo. Nessuna credenziale di accesso.
    const ensureSystemCompany = async (nome: string): Promise<string> => {
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("ragione_sociale", nome)
        .limit(1)
        .maybeSingle();
      if (existing) return existing.id;
      const { data: created, error: createErr } = await supabase
        .from("companies")
        .insert({ ragione_sociale: nome, settore: "sistema" })
        .select("id")
        .single();
      if (createErr || !created) throw createErr ?? new Error("Creazione contenitore fallita");
      return created.id;
    };

    // Cliente privato: non c'è nessun rivenditore da cercare in anagrafica.
    // La pratica va nel contenitore dedicato ai privati.
    if (isPrivato) {
      matchType = "privato";
      companyId = await ensureSystemCompany(PRIVATI_COMPANY);
    }

    if (!companyId && aziendaEmail) {
      const { data: byEmail } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .ilike("email", aziendaEmail)
        .limit(1)
        .maybeSingle();
      if (byEmail) {
        companyId = byEmail.id;
        matchType = "email";
      }
    }

    // Match per TELEFONO del rivenditore (oltre all'email). Confronta sulle
    // ultime 9 cifre per tollerare prefissi/spazi diversi.
    const aziendaTel = (p.azienda?.telefono ?? "").replace(/\D/g, "");
    if (!companyId && aziendaTel.length >= 6) {
      const last9 = aziendaTel.slice(-9);
      const { data: byPhone } = await supabase
        .from("companies")
        .select("id, ragione_sociale, telefono")
        .ilike("telefono", `%${last9}%`)
        .limit(1)
        .maybeSingle();
      if (byPhone) {
        companyId = byPhone.id;
        matchType = "telefono";
      }
    }

    if (!companyId) {
      const { data: byName } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .ilike("ragione_sociale", ragione)
        .limit(1)
        .maybeSingle();
      if (byName) {
        companyId = byName.id;
        matchType = "ragione_sociale";
      }
    }

    if (!companyId) {
      // Email/ragione sconosciute → NON creiamo né azienda né accessi
      // automatici. La pratica va nel contenitore di sistema "Da abbinare":
      // lo staff verifica e la riassegna (o crea l'azienda manualmente).
      matchType = "creata"; // "da abbinare"
      companyId = await ensureSystemCompany(PLACEHOLDER_COMPANY);
    }

    // ── 2. Stage iniziale (stage di sistema, come il form interno) ──
    //  - servizio_completo            → "inviata" (aspettiamo che il cliente compili)
    //  - documenti_forniti + cartacei → "pronte_da_fare": il rivenditore ci ha
    //    già allegato TUTTO → pronta per lo staff.
    //  - documenti_forniti + online   → "attesa_compilazione": il rivenditore
    //    compila lui il /form; al submit submit_form_by_token promuove a
    //    "pronte_da_fare".
    //  In OGNI caso documenti_forniti il CLIENTE NON va MAI contattato: i guard
    //  tipo_servizio==='documenti_forniti' in on-stage-changed e
    //  process-automations bloccano ogni messaggio/email al privato.
    const tipoServizio = p.tipo_servizio === "documenti_forniti" ? "documenti_forniti" : "servizio_completo";
    const targetStageType =
      tipoServizio === "servizio_completo"
        ? "inviata"
        : p.documenti_mode === "form_online"
          ? "attesa_compilazione"
          : "pronte_da_fare";
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .is("reseller_id", null)
      .eq("stage_type", targetStageType)
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    // ── 3. Nota di audit ──
    const matchLabel = {
      email: "✅ Abbinata per email",
      telefono: "✅ Abbinata per telefono",
      ragione_sociale: "✅ Abbinata per ragione sociale",
      creata: "⚠️ AZIENDA NON TROVATA — pratica DA ABBINARE (invito registrazione inviato al rivenditore)",
      privato: "👤 CLIENTE PRIVATO — nessun rivenditore, paga direttamente con carta",
    }[matchType];
    const declared = [
      isPrivato
        ? `📥 RICHIESTA DAL SITO — CLIENTE PRIVATO (modulo: ${p.modulo ?? "?"})`
        : `📥 RICHIESTA DAL SITO (modulo: ${p.modulo ?? "?"})`,
      isPrivato ? null : `Azienda dichiarata: ${ragione} · ${aziendaEmail}`,
      isPrivato ? null : (p.azienda?.telefono ? `Telefono azienda: ${p.azienda.telefono}` : null),
      matchLabel,
      p.note?.trim() ? `Note: ${p.note.trim()}` : null,
    ].filter(Boolean).join("\n");

    // ── 4. Crea la pratica ──
    const { data: practice, error: insertErr } = await supabase
      .from("enea_practices")
      .insert({
        reseller_id: companyId,
        brand: "enea",
        current_stage_id: stage?.id ?? null,
        tipo_servizio: tipoServizio,
        // Vale solo per documenti_forniti: nel servizio completo il cliente
        // riceve comunque la pratica, quindi il flag non c'entra.
        invia_pratica_al_cliente:
          tipoServizio === "documenti_forniti" && p.invia_pratica_al_cliente === true,
        tipo_fatturazione: p.tipo_fatturazione === "cliente_finale" ? "cliente_finale" : "rivenditore",
        tipo_soggetto: p.tipo_soggetto === "azienda_piva" ? "azienda_piva" : "persona_fisica",
        prodotto_installato: p.prodotto?.trim() || (p.modulo ?? "Richiesta sito"),
        // Ragione sociale dichiarata dal rivenditore: sul segnaposto "Da
        // abbinare" è questo il nome che i template mostrano al cliente finale
        // (vedi _shared/reseller.ts) e che il CRM affianca al badge.
        // Per il privato resta vuota: non c'è nessuna azienda che ci ha
        // incaricato, è lui stesso il committente.
        azienda_dichiarata: isPrivato ? null : ragione,
        cliente_nome: nome,
        cliente_cognome: cognome,
        cliente_telefono: normalizePhone(telefono),
        cliente_email: p.cliente?.email?.trim() || null,
        cliente_cf: p.cliente?.cf?.trim() || null,
        cliente_indirizzo: p.cliente?.indirizzo?.trim() || null,
        note: declared,
        fatture_urls: [],
        documenti_enea_urls: [],
        documenti_aggiuntivi_urls: [],
        documenti_mancanti: [],
      })
      .select("id, form_token")
      .single();
    if (insertErr || !practice) throw insertErr ?? new Error("Insert pratica fallito");

    // ── 5. Upload file (stessa convenzione del form interno) ──
    const uploadAll = async (files: File[], tipo: string): Promise<string[]> => {
      const paths: string[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
        const path = `${practice.id}/${tipo}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
        if (error) console.warn(`[richiesta-pubblica] upload failed ${f.name}:`, error.message);
        else paths.push(path);
      }
      return paths;
    };
    const [fattureUrls, docExtraUrls, librettoUrls, moduliUrls] = await Promise.all([
      uploadAll(fattureFiles, "fattura"),
      uploadAll(docExtraFiles, "doc_extra"),
      uploadAll(librettoFiles, "libretto"),
      uploadAll(moduliFiles, "moduli_raccolta"),
    ]);
    const aggiuntivi = [...docExtraUrls, ...librettoUrls, ...moduliUrls];
    if (fattureUrls.length || aggiuntivi.length) {
      await supabase.from("enea_practices").update({
        fatture_urls: fattureUrls,
        documenti_aggiuntivi_urls: aggiuntivi,
      }).eq("id", practice.id);
    }

    // ── 6. Trigger automazioni — SOLO per servizio_completo (come il form
    // interno): con documenti_forniti è l'azienda a compilare subito il
    // modulo, niente messaggio al cliente.
    // Con requires_payment il cliente paga direttamente su Stripe: non
    // mandiamo nessun link "completa i tuoi dati" perché è lui stesso che
    // ha appena compilato il form.
    // Col servizio a carico del cliente finale la chiamata serve anche su
    // "documenti forniti": non per il modulo (i dati li ha dati il rivenditore)
    // ma perche' al cliente deve arrivare il link di pagamento.
    const cfDalSito = p.tipo_fatturazione === "cliente_finale" && !p.requires_payment;
    if ((tipoServizio === "servizio_completo" && !p.requires_payment) || cfDalSito) {
      fetch(`${SUPABASE_URL}/functions/v1/on-practice-created`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_id: practice.id,
          // Su "documenti forniti" il cliente non va contattato per i
          // documenti: passa solo la richiesta di pagamento, che in
          // on-practice-created non e' gated su reseller_only.
          reseller_only: tipoServizio === "documenti_forniti",
        }),
      }).catch((e) => console.warn("[richiesta-pubblica] on-practice-created failed:", e));
    }

    // ── 6b. Azienda NON trovata → email di invito al rivenditore ──
    // Nessun account creato: invitiamo il rivenditore a registrarsi per seguire
    // la pratica. (Per le aziende già abbinate la pratica appare nel loro portale.)
    if (matchType === "creata" && aziendaEmail) {
      fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: aziendaEmail,
          template: "rivenditore_invito",
          data: {
            ragione_sociale: ragione || "Rivenditore",
            cliente: `${nome} ${cognome}`.trim(),
            servizio: p.prodotto?.trim() || p.modulo || "pratica",
            login_url: "https://pannello.praticarapida.it/auth",
          },
        }),
      }).catch((e) => console.warn("[richiesta-pubblica] invito email failed:", e));
    }

    // ── 7. Notifica super_admin ──
    try {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");
      if (admins && admins.length > 0) {
        await supabase.from("notifications").insert(
          admins.map((a) => ({
            user_id: a.user_id,
            tipo: "richiesta_pubblica",
            titolo: matchType === "privato"
              ? `👤 Richiesta dal sito — CLIENTE PRIVATO (${nome} ${cognome})`
              : matchType === "creata"
                ? `⚠️ Richiesta dal sito — azienda DA ABBINARE (${ragione})`
                : `📥 Nuova richiesta dal sito — ${ragione}`,
            messaggio: `${nome} ${cognome} · ${p.prodotto ?? p.modulo ?? ""}${allFiles.length ? ` · ${allFiles.length} file` : ""}${matchType === "creata" ? " — azienda non trovata: invito inviato al rivenditore, verifica e abbina la pratica" : ""}${matchType === "privato" ? " — in attesa del pagamento con carta" : ""}`,
            link: `/pratiche/${practice.id}`,
          })),
        );
      }
    } catch (notifErr) {
      console.warn("[richiesta-pubblica] notify failed:", notifErr);
    }

    return json({
      success: true,
      matched: matchType !== "creata",
      company_created: matchType === "creata",
      // practice_id: usato dal frontend per avviare il checkout Stripe sui
      // servizi a pagamento (es. visura catastale).
      practice_id: practice.id,
      // Con documenti_forniti il frontend reindirizza l'azienda al modulo
      // completo da compilare subito (pagina pubblica tokenizzata).
      // Al privato il token serve dopo il pagamento: `stripe-checkout` lo
      // rilegge da sé per costruire la success_url, qui lo restituiamo solo
      // perché il frontend possa mostrare un fallback se Stripe non parte.
      form_token:
        tipoServizio === "documenti_forniti" || isPrivato ? (practice.form_token ?? null) : null,
    });
  } catch (err) {
    await reportError(err, { fn: "richiesta-pubblica", modulo: p.modulo });
    return json({ success: false, error: "Errore interno, riprova tra poco" }, 500);
  }
});
