/**
 * RichiestaPubblicaForm — form interno di richiesta pratica per le pagine
 * pubbliche /area-riservata-vecchia/* (sostituisce gli iframe GoHighLevel).
 *
 * Nessun login: l'azienda si identifica con ragione sociale + email
 * aziendale; poi inserisce i dati del cliente finale. L'edge function
 * `richiesta-pubblica` abbina l'azienda per email (o la mette "da
 * abbinare") e fa partire il link di compilazione al cliente.
 *
 * Anti-spam: honeypot (campo "website" invisibile).
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, CheckCircle2, Building2, User, Receipt, Paperclip, X, FileText, Sparkles, FolderUp, UserCircle } from "lucide-react";

interface Props {
  /** Slug del modulo, es. "pratica-enea" (va nei log/nota della pratica) */
  modulo: string;
  /** Prodotto fisso (moduli mono-prodotto, es. "Visura catastale") */
  prodottoFisso?: string;
  /** Prodotti selezionabili (modulo ENEA multi-prodotto) */
  prodotti?: string[];
  /**
   * Mostra la scelta Servizio Completo / Documenti Forniti (solo moduli
   * ENEA: con "documenti forniti" l'azienda compila subito il modulo
   * cliente completo). Default: false → sempre servizio_completo.
   */
  conTipoServizio?: boolean;
  /**
   * Mostra la scelta "Sei un'azienda/rivenditore o un cliente privato?" in cima.
   * Se scelgono "privato": nasconde i dati aziendali, imposta fatturazione
   * automaticamente a "cliente_finale" e usa i dati personali come intestatario.
   * Utile per servizi B2C come la visura catastale.
   */
  conTipoRichiedente?: boolean;
  /**
   * Campi extra specifici del servizio (es. POD per GSE, foglio/particella per
   * visura catastale). Vengono aggiunti alla nota della pratica per lo staff.
   */
  extraFields?: { key: string; label: string; required?: boolean; placeholder?: string }[];
  /** Nota di costo mostrata in cima (servizi a pagamento, es. visura catastale). */
  priceNote?: string;
  /** Servizio a pagamento: dopo l'invio reindirizza a Stripe Checkout. */
  requiresPayment?: boolean;
  /** Importo in centesimi (es. 3000 = 30€). Default 3000. */
  priceCents?: number;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[hsl(152_65%_38%)] focus:ring-2 focus:ring-[hsl(152_65%_38%)]/20";

const labelCls = "block text-xs font-semibold text-gray-700 mb-1.5";

export default function RichiestaPubblicaForm({ modulo, prodottoFisso, prodotti, conTipoServizio = false, conTipoRichiedente = false, extraFields, priceNote, requiresPayment = false, priceCents = 3000 }: Props) {
  const navigate = useNavigate();
  const [tipoRichiedente, setTipoRichiedente] = useState<"azienda" | "privato">("azienda");
  const isPrivato = tipoRichiedente === "privato";
  const [tipoServizio, setTipoServizio] = useState<"servizio_completo" | "documenti_forniti">("servizio_completo");
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [aziendaEmail, setAziendaEmail] = useState("");
  const [aziendaTelefono, setAziendaTelefono] = useState("");
  const [prodotto, setProdotto] = useState(prodottoFisso ?? "");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [tipoFatturazione, setTipoFatturazione] = useState<"rivenditore" | "cliente_finale" | "">("");
  const [tipoSoggetto, setTipoSoggetto] = useState<"persona_fisica" | "azienda_piva" | "">("");
  const [fatture, setFatture] = useState<File[]>([]);
  const [documenti, setDocumenti] = useState<File[]>([]);
  const fattureRef = useRef<HTMLInputElement>(null);
  const documentiRef = useRef<HTMLInputElement>(null);
  const [privacy, setPrivacy] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    // Dati aziendali richiesti solo se NON è un cliente privato
    (isPrivato || (
      ragioneSociale.trim().length >= 2 &&
      /\S+@\S+\.\S+/.test(aziendaEmail) &&
      aziendaTelefono.replace(/\D/g, "").length >= 8
    )) &&
    nome.trim().length >= 2 &&
    cognome.trim().length >= 2 &&
    telefono.replace(/\D/g, "").length >= 8 &&
    (prodottoFisso || !prodotti || prodotto) &&
    tipoFatturazione !== "" &&
    tipoSoggetto !== "" &&
    (extraFields ?? []).every((f) => !f.required || (extra[f.key] ?? "").trim().length > 0) &&
    privacy;

  const addFiles = (list: FileList | null, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.size <= 10 * 1024 * 1024);
    if (incoming.length < list.length) setError("Alcuni file superano i 10MB e sono stati esclusi");
    setter((prev) => [...prev, ...incoming].slice(0, 5)); // max 5 per categoria
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        website, // honeypot
        modulo,
        prodotto: prodottoFisso ?? prodotto,
        tipo_servizio: tipoServizio,
        requires_payment: requiresPayment || undefined,
        tipo_fatturazione: tipoFatturazione,
        tipo_soggetto: tipoSoggetto,
        // Cliente privato: usa i dati personali come intestatario azienda
        azienda: isPrivato ? {
          ragione_sociale: `${nome.trim()} ${cognome.trim()}`,
          email: email.trim() || undefined,
          telefono: telefono.trim(),
        } : {
          ragione_sociale: ragioneSociale.trim(),
          email: aziendaEmail.trim(),
          telefono: aziendaTelefono.trim(),
        },
        cliente: {
          nome: nome.trim(),
          cognome: cognome.trim(),
          telefono: telefono.trim(),
          email: email.trim() || undefined,
        },
        // Campi specifici del servizio (POD, foglio/particella, ecc.) → in nota
        // così lo staff li vede sulla pratica.
        note: [
          ...(extraFields ?? [])
            .map((f) => (extra[f.key] ?? "").trim() ? `${f.label}: ${extra[f.key].trim()}` : null)
            .filter(Boolean),
          note.trim() || null,
        ].filter(Boolean).join("\n") || undefined,
      };

      // Con allegati → multipart; senza → JSON semplice
      let body: FormData | typeof payload;
      if (fatture.length || documenti.length) {
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        fatture.forEach((f) => fd.append("fatture", f));
        documenti.forEach((f) => fd.append("documenti", f));
        body = fd;
      } else {
        body = payload;
      }

      const { data, error: fnError } = await supabase.functions.invoke("richiesta-pubblica", { body });
      if (fnError) throw new Error(fnError.message);
      const res = data as { success: boolean; error?: string; form_token?: string | null; practice_id?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");

      // Servizio a pagamento → Stripe Checkout: la pratica è creata "in attesa
      // pagamento", ora reindirizziamo a Stripe; il webhook la segnerà pagata.
      if (requiresPayment && res.practice_id) {
        const { data: ck, error: ckErr } = await supabase.functions.invoke("stripe-checkout", {
          body: {
            practice_id: res.practice_id,
            amount_cents: priceCents,
            descrizione: prodottoFisso ?? "Servizio Pratica Rapida",
            email: aziendaEmail.trim() || email.trim() || undefined,
          },
        });
        const url = (ck as { url?: string } | null)?.url;
        if (ckErr || !url) throw new Error("Pagamento non disponibile al momento. Riprova o contattaci.");
        window.location.href = url; // redirect a Stripe
        return;
      }

      // Documenti forniti: l'azienda compila SUBITO il modulo completo
      // (stessa esperienza del form interno rivenditore)
      if (tipoServizio === "documenti_forniti" && res.form_token) {
        navigate(`/form/${res.form_token}`);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto mb-4" style={{ color: "hsl(152 65% 38%)" }} />
        <h3 className="text-xl font-bold text-gray-900 mb-2">Richiesta inviata! 🎉</h3>
        <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
          Abbiamo ricevuto la tua richiesta. Il cliente riceverà a breve il link
          per completare i suoi dati, e ti terremo aggiornato sull'avanzamento
          della pratica.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6">
      {priceNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          💶 {priceNote}
        </div>
      )}
      {/* ── Tipo richiedente: azienda/rivenditore oppure cliente privato ── */}
      {conTipoRichiedente && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserCircle className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
            <h3 className="text-sm font-bold text-gray-900">Chi effettua la richiesta?</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setTipoRichiedente("azienda"); setTipoFatturazione(""); }}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                !isPrivato
                  ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
                <span className="text-sm font-bold text-gray-900">Azienda / Rivenditore</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Stai richiedendo per conto di un'azienda, studio o come rivenditore.
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setTipoRichiedente("privato"); setTipoFatturazione("cliente_finale"); }}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                isPrivato
                  ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-900">Cliente privato</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Stai richiedendo per te stesso, come persona fisica o professionista.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Honeypot: invisibile agli umani, i bot lo compilano */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute opacity-0 h-0 w-0 pointer-events-none"
      />

      {/* ── Tipo di servizio (solo moduli ENEA) ── */}
      {conTipoServizio && (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
          <h3 className="text-sm font-bold text-gray-900">Tipo di servizio</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTipoServizio("servizio_completo")}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
              tipoServizio === "servizio_completo"
                ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
              <span className="text-sm font-bold text-gray-900">Servizio Completo</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: "hsl(152 65% 32%)", borderColor: "hsl(152 65% 38% / 0.4)" }}>
                Consigliato
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Inserisci solo i dati del cliente e la fattura. <strong>Pratica Rapida contatta il cliente</strong>, raccoglie i documenti e gestisce tutto.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTipoServizio("documenti_forniti")}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
              tipoServizio === "documenti_forniti"
                ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <FolderUp className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-bold text-gray-900">Documenti Forniti</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Fornisci tu <strong>tutti i documenti</strong>: dopo l'invio compili subito il modulo completo. Pratica Rapida prepara e invia la pratica direttamente.
            </p>
          </button>
        </div>
      </div>
      )}

      {/* ── Sezione azienda (nascosta per clienti privati) ── */}
      {!isPrivato && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
            <h3 className="text-sm font-bold text-gray-900">I tuoi dati (azienda / rivenditore)</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Ragione sociale *</label>
              <input className={inputCls} value={ragioneSociale} onChange={(e) => setRagioneSociale(e.target.value)} placeholder="Es. Serramenti Rossi S.r.l." required />
            </div>
            <div>
              <label className={labelCls}>Email aziendale *</label>
              <input type="email" className={inputCls} value={aziendaEmail} onChange={(e) => setAziendaEmail(e.target.value)} placeholder="info@azienda.it" required />
              <p className="text-[11px] text-gray-400 mt-1">Se sei già registrato, usa la stessa email del portale: la pratica apparirà nella tua area.</p>
            </div>
            <div>
              <label className={labelCls}>Telefono azienda *</label>
              <input type="tel" className={inputCls} value={aziendaTelefono} onChange={(e) => setAziendaTelefono(e.target.value)} placeholder="es. 333 1234567" required />
            </div>
          </div>
        </div>
      )}

      {/* ── Prodotto (solo se selezionabile) ── */}
      {!prodottoFisso && prodotti && prodotti.length > 0 && (
        <div>
          <label className={labelCls}>Prodotto installato *</label>
          <select className={inputCls} value={prodotto} onChange={(e) => setProdotto(e.target.value)} required>
            <option value="" disabled>Seleziona il prodotto…</option>
            {prodotti.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Sezione cliente finale / dati personali ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
          <h3 className="text-sm font-bold text-gray-900">
            {isPrivato ? "I tuoi dati" : "Dati del cliente finale"}
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nome *</label>
            <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Mario" required />
          </div>
          <div>
            <label className={labelCls}>Cognome *</label>
            <input className={inputCls} value={cognome} onChange={(e) => setCognome(e.target.value)} placeholder="Bianchi" required />
          </div>
          <div>
            <label className={labelCls}>{isPrivato ? "Il tuo telefono *" : "Telefono cliente *"}</label>
            <input type="tel" className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="333 1234567" required />
            {!isPrivato && <p className="text-[11px] text-gray-400 mt-1">Il cliente riceverà qui il link per completare i suoi dati.</p>}
          </div>
          <div>
            <label className={labelCls}>{isPrivato ? "La tua email" : "Email cliente"}</label>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opzionale" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea className={`${inputCls} min-h-[70px] resize-y`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Eventuali dettagli utili (opzionale)" />
          </div>
        </div>
      </div>

      {/* ── Campi specifici del servizio (es. POD, foglio/particella) ── */}
      {extraFields && extraFields.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
            <h3 className="text-sm font-bold text-gray-900">Dati del servizio</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {extraFields.map((f) => (
              <div key={f.key}>
                <label className={labelCls}>{f.label}{f.required && " *"}</label>
                <input
                  className={inputCls}
                  value={extra[f.key] ?? ""}
                  onChange={(e) => setExtra((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder ?? ""}
                  required={f.required}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fatturazione + tipo soggetto ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
          <h3 className="text-sm font-bold text-gray-900">Fatturazione</h3>
        </div>
        <div className={`grid gap-3 ${!isPrivato ? "sm:grid-cols-2" : ""}`}>
          {/* "A chi fatturiamo?" — solo per aziende/rivenditori */}
          {!isPrivato && (
            <div>
              <label className={labelCls}>A chi fatturiamo il servizio? *</label>
              <div className="space-y-2">
                {([
                  { v: "rivenditore", label: "Alla mia azienda (rivenditore)" },
                  { v: "cliente_finale", label: "Al cliente finale" },
                ] as const).map((o) => (
                  <label key={o.v} className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${tipoFatturazione === o.v ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="fatturazione" checked={tipoFatturazione === o.v} onChange={() => setTipoFatturazione(o.v)} className="accent-[hsl(152_65%_38%)]" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>
              {isPrivato ? "Sei una persona fisica o hai P.IVA? *" : "Il cliente finale è… *"}
            </label>
            <div className="space-y-2">
              {([
                { v: "persona_fisica", label: "Privato (persona fisica)" },
                { v: "azienda_piva", label: "Azienda con P.IVA" },
              ] as const).map((o) => (
                <label key={o.v} className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${tipoSoggetto === o.v ? "border-[hsl(152_65%_38%)] bg-[hsl(152_65%_38%)]/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <input type="radio" name="soggetto" checked={tipoSoggetto === o.v} onChange={() => setTipoSoggetto(o.v)} className="accent-[hsl(152_65%_38%)]" />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Allegati (opzionali) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className="w-4 h-4" style={{ color: "hsl(152 65% 38%)" }} />
          <h3 className="text-sm font-bold text-gray-900">Allegati <span className="font-normal text-gray-400">(opzionali — max 10MB l'uno)</span></h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            { key: "fatture", label: "Fatture", files: fatture, setter: setFatture, ref: fattureRef },
            { key: "documenti", label: "Altri documenti", files: documenti, setter: setDocumenti, ref: documentiRef },
          ] as const).map((slot) => (
            <div key={slot.key}>
              <input
                ref={slot.ref}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => { addFiles(e.target.files, slot.setter); e.target.value = ""; }}
              />
              <button
                type="button"
                onClick={() => slot.ref.current?.click()}
                className="w-full rounded-lg border border-dashed border-gray-300 px-3.5 py-3 text-sm text-gray-500 hover:border-[hsl(152_65%_38%)] hover:text-gray-700 transition-colors"
              >
                + {slot.label}
              </button>
              {slot.files.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {slot.files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button type="button" onClick={() => slot.setter((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Privacy + submit ── */}
      <label className="flex items-start gap-2.5 text-xs text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          className="mt-0.5 accent-[hsl(152_65%_38%)]"
          required
        />
        <span>
          {isPrivato
            ? "Acconsento al trattamento dei miei dati personali ai sensi del GDPR per la gestione della pratica."
            : "Dichiaro di aver informato il cliente finale e acconsento al trattamento dei dati ai sensi del GDPR per la gestione della pratica."
          }
          {tipoFatturazione === "rivenditore" && (
            <> In qualità di soggetto pagante, <strong>accetto di corrispondere a Pratica Rapida S.r.l.s. il compenso pattuito a pratica completata</strong>.</>
          )}
          {" *"}
        </span>
      </label>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white py-3 px-7 rounded-full transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "hsl(152 65% 38%)" }}
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {submitting
          ? "Invio in corso…"
          : requiresPayment
            ? `Vai al pagamento — € ${(priceCents / 100).toFixed(2)}`
            : conTipoServizio && tipoServizio === "documenti_forniti"
              ? "Invia e compila il modulo"
              : "Invia la richiesta"}
      </button>
    </form>
  );
}
