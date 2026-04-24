import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";

type TipoModulo = "schermature-solari" | "infissi" | "impianto-termico" | "vepa";

interface TokenInfo {
  token_id: string;
  pratica_id: string;
  tipo_modulo: TipoModulo;
  stato: string;
  expires_at: string;
  nome_cliente: string;
}

// ── Form state types ─────────────────────────────────────────────────────────

interface FormSchermature {
  // Dati personali
  nome_cliente: string;
  cognome_cliente: string;
  data_nascita: string;
  comune_nascita: string;
  provincia_nascita: string;
  codice_fiscale: string;
  email: string;
  telefono: string;
  // Cointestatario
  cointestatario_nome: string;
  cointestatario_cognome: string;
  cointestatario_cf: string;
  // Residenza
  comune_residenza: string;
  provincia_residenza: string;
  indirizzo_residenza: string;
  civico_residenza: string;
  cap_residenza: string;
  // Appartamento (luogo lavori)
  comune_appartamento: string;
  provincia_appartamento: string;
  indirizzo_appartamento: string;
  civico_appartamento: string;
  cap_appartamento: string;
  // Catasto
  catasto_foglio: string;
  catasto_mappale: string;
  catasto_subalterno: string;
  tipo_conduzione: string;
  // Impianto termico esistente
  impianto_tipo: string;
  impianto_combustibile: string;
  impianto_tipo_caldaia: string;
  impianto_condizionamento: string;
  // Schermatura
  tipologia_schermatura: string;
  produttore: string;
  orientamento: string;
  larghezza_cm: string;
  altezza_cm: string;
  numero_unita: string;
  motorizzato: string;
  colore: string;
  // Fattura
  costo_totale_iva: string;
  note: string;
}

interface FormInfissi {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  tipologia_infisso: string;
  materiale: string;
  numero_infissi: string;
  larghezza_cm: string;
  altezza_cm: string;
  trasmittanza_vecchio: string;
  trasmittanza_nuovo: string;
  note: string;
}

interface FormImpianto {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  tipo_impianto_vecchio: string;
  tipo_impianto_nuovo: string;
  potenza_kw: string;
  anno_installazione: string;
  classe_energetica: string;
  note: string;
}

// ── Shared helper: advance practice to "pronte_da_fare" after form submission ─
// Mirrors the flow in FormPubblico.tsx: marks form_compilato_at, moves stage,
// and fires on-stage-changed so Messaggio 3 (email + WA conferma) goes out.
async function advancePracticeToPronteDaFare(praticaId: string): Promise<void> {
  // Load practice to discover its brand (needed to find the correct pipeline_stage)
  const { data: practice, error: praticaError } = await supabase
    .from("enea_practices")
    .select("id, brand, current_stage_id")
    .eq("id", praticaId)
    .maybeSingle();

  if (praticaError || !practice) {
    console.error("advancePracticeToPronteDaFare: practice not found", praticaError);
    return;
  }

  // Find the system-level "pronte_da_fare" stage for this practice's brand
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .is("reseller_id", null)
    .eq("stage_type", "pronte_da_fare")
    .eq("brand", practice.brand)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("enea_practices")
    .update({
      form_compilato_at: new Date().toISOString(),
      current_stage_id: stage?.id ?? practice.current_stage_id,
    })
    .eq("id", praticaId);

  if (updateError) {
    console.error("advancePracticeToPronteDaFare: update failed", updateError);
    return;
  }

  // Fire Messaggio 3 confirmation (email + WA) via on-stage-changed.
  // The edge function guards on tipo_servizio === "servizio_completo" and form_compilato_at.
  supabase.functions
    .invoke("on-stage-changed", {
      body: {
        practice_id: praticaId,
        new_stage_type: "pronte_da_fare",
      },
    })
    .catch(console.error);
}

// ── Shared field component ────────────────────────────────────────────────────

function Field({
  label, id, value, onChange, type = "text", placeholder, required,
}: {
  label: string; id: string; value: string;
  onChange: (v: string) => void; type?: string;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-11 text-base"
      />
    </div>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="note" className="text-sm font-medium">Note aggiuntive</Label>
      <Textarea
        id="note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Eventuali note o osservazioni..."
        className="text-base min-h-[80px] resize-none"
      />
    </div>
  );
}

function SelectField({
  label, id, value, onChange, options, required, placeholder = "Seleziona...",
}: {
  label: string; id: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 text-base">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function Section({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1.5">{description}</p>}
    </div>
  );
}

// ── Form: Schermature Solari ──────────────────────────────────────────────────

const EMPTY_SCHERMATURE: FormSchermature = {
  nome_cliente: "", cognome_cliente: "", data_nascita: "", comune_nascita: "",
  provincia_nascita: "", codice_fiscale: "", email: "", telefono: "",
  cointestatario_nome: "", cointestatario_cognome: "", cointestatario_cf: "",
  comune_residenza: "", provincia_residenza: "", indirizzo_residenza: "",
  civico_residenza: "", cap_residenza: "",
  comune_appartamento: "", provincia_appartamento: "", indirizzo_appartamento: "",
  civico_appartamento: "", cap_appartamento: "",
  catasto_foglio: "", catasto_mappale: "", catasto_subalterno: "", tipo_conduzione: "",
  impianto_tipo: "", impianto_combustibile: "", impianto_tipo_caldaia: "", impianto_condizionamento: "",
  tipologia_schermatura: "", produttore: "", orientamento: "",
  larghezza_cm: "", altezza_cm: "", numero_unita: "", motorizzato: "", colore: "",
  costo_totale_iva: "", note: "",
};

function FormSchermatureView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormSchermature>({
    ...EMPTY_SCHERMATURE,
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
  });

  const set = (k: keyof FormSchermature) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_schermature").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        data_nascita: form.data_nascita || null,
        comune_nascita: form.comune_nascita || null,
        provincia_nascita: form.provincia_nascita || null,
        codice_fiscale: form.codice_fiscale || null,
        email: form.email || null,
        telefono: form.telefono || null,
        cointestatario_nome: form.cointestatario_nome || null,
        cointestatario_cognome: form.cointestatario_cognome || null,
        cointestatario_cf: form.cointestatario_cf || null,
        comune_residenza: form.comune_residenza || null,
        provincia_residenza: form.provincia_residenza || null,
        indirizzo_residenza: form.indirizzo_residenza || null,
        civico_residenza: form.civico_residenza || null,
        cap_residenza: form.cap_residenza || null,
        comune_appartamento: form.comune_appartamento || null,
        provincia_appartamento: form.provincia_appartamento || null,
        indirizzo_appartamento: form.indirizzo_appartamento || null,
        civico_appartamento: form.civico_appartamento || null,
        cap_appartamento: form.cap_appartamento || null,
        catasto_foglio: form.catasto_foglio || null,
        catasto_mappale: form.catasto_mappale || null,
        catasto_subalterno: form.catasto_subalterno || null,
        tipo_conduzione: form.tipo_conduzione || null,
        impianto_tipo: form.impianto_tipo || null,
        impianto_combustibile: form.impianto_combustibile || null,
        impianto_tipo_caldaia: form.impianto_tipo_caldaia || null,
        impianto_condizionamento: form.impianto_condizionamento || null,
        tipologia_schermatura: form.tipologia_schermatura || null,
        produttore: form.produttore || null,
        orientamento: form.orientamento || null,
        larghezza_cm: form.larghezza_cm ? Number(form.larghezza_cm) : null,
        altezza_cm: form.altezza_cm ? Number(form.altezza_cm) : null,
        numero_unita: form.numero_unita ? Number(form.numero_unita) : null,
        motorizzato: form.motorizzato ? form.motorizzato === "si" : null,
        colore: form.colore || null,
        costo_totale_iva: form.costo_totale_iva ? Number(form.costo_totale_iva) : null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;

      // Advance linked enea_practice to "pronte_da_fare" and fire Messaggio 3
      await advancePracticeToPronteDaFare(praticaId);
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">

      {/* ── 1. Dati personali ── */}
      <Section title="Dati del richiedente" description="Inserisci i dati anagrafici del beneficiario della detrazione." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comune di nascita" id="comune_nascita" value={form.comune_nascita} onChange={set("comune_nascita")} required />
        <Field label="Provincia di nascita" id="prov_nascita" value={form.provincia_nascita} onChange={set("provincia_nascita")} placeholder="Es. MI" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data di nascita" id="data_nascita" value={form.data_nascita} onChange={set("data_nascita")} type="date" required />
        <Field label="Codice Fiscale" id="cf" value={form.codice_fiscale} onChange={set("codice_fiscale")} placeholder="RSSMRA80A01H501Z" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" id="email" value={form.email} onChange={set("email")} type="email" required />
        <Field label="Telefono" id="tel" value={form.telefono} onChange={set("telefono")} type="tel" />
      </div>

      {/* ── 2. Cointestatario ── */}
      <Section title="Cointestatario" description="Compila solo se l'immobile è intestato a più persone." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome cointestatario" id="co_nome" value={form.cointestatario_nome} onChange={set("cointestatario_nome")} />
        <Field label="Cognome cointestatario" id="co_cognome" value={form.cointestatario_cognome} onChange={set("cointestatario_cognome")} />
      </div>
      <Field label="Codice Fiscale cointestatario" id="co_cf" value={form.cointestatario_cf} onChange={set("cointestatario_cf")} placeholder="RSSMRA80A01H501Z" />

      {/* ── 3. Residenza ── */}
      <Section title="Indirizzo di residenza" description="Indirizzo di residenza del beneficiario." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comune di residenza" id="com_res" value={form.comune_residenza} onChange={set("comune_residenza")} required />
        <Field label="Provincia" id="prov_res" value={form.provincia_residenza} onChange={set("provincia_residenza")} placeholder="Es. MI" required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Indirizzo" id="ind_res" value={form.indirizzo_residenza} onChange={set("indirizzo_residenza")} placeholder="Via/Piazza..." required />
        </div>
        <Field label="N° civico" id="civ_res" value={form.civico_residenza} onChange={set("civico_residenza")} required />
      </div>
      <Field label="CAP" id="cap_res" value={form.cap_residenza} onChange={set("cap_residenza")} placeholder="20100" required />

      {/* ── 4. Appartamento (luogo lavori) ── */}
      <Section title="Dati dell'appartamento dove sono stati effettuati i lavori"
        description="Se diverso dalla residenza, inserisci l'indirizzo dove è stato eseguito l'intervento." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comune" id="com_app" value={form.comune_appartamento} onChange={set("comune_appartamento")} required />
        <Field label="Provincia" id="prov_app" value={form.provincia_appartamento} onChange={set("provincia_appartamento")} placeholder="Es. MI" required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Indirizzo" id="ind_app" value={form.indirizzo_appartamento} onChange={set("indirizzo_appartamento")} placeholder="Via/Piazza..." required />
        </div>
        <Field label="N° civico" id="civ_app" value={form.civico_appartamento} onChange={set("civico_appartamento")} required />
      </div>
      <Field label="CAP" id="cap_app" value={form.cap_appartamento} onChange={set("cap_appartamento")} placeholder="20100" required />

      {/* ── 5. Dati catastali ── */}
      <Section title="Dati catastali" description="Dati catastali dell'unità immobiliare oggetto dell'intervento." />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Foglio" id="foglio" value={form.catasto_foglio} onChange={set("catasto_foglio")} required />
        <Field label="Mappale/Particella" id="mappale" value={form.catasto_mappale} onChange={set("catasto_mappale")} required />
        <Field label="Subalterno" id="subalter" value={form.catasto_subalterno} onChange={set("catasto_subalterno")} />
      </div>
      <SelectField
        label="Tipo di conduzione"
        id="conduzione"
        value={form.tipo_conduzione}
        onChange={set("tipo_conduzione")}
        options={[
          { value: "proprietario", label: "Proprietario" },
          { value: "inquilino", label: "Inquilino" },
          { value: "nudo_proprietario", label: "Nudo proprietario" },
          { value: "usufruttario", label: "Usufruttario" },
          { value: "comodatario", label: "Comodatario" },
        ]}
      />

      {/* ── 6. Impianto termico esistente ── */}
      <Section title="Impianto termico esistente"
        description="Indica le caratteristiche dell'impianto di riscaldamento presente nell'appartamento." />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo di impianto"
          id="imp_tipo"
          value={form.impianto_tipo}
          onChange={set("impianto_tipo")}
          options={[
            { value: "centralizzato", label: "Centralizzato" },
            { value: "autonomo", label: "Autonomo" },
            { value: "assente", label: "Assente" },
          ]}
          required
        />
        <SelectField
          label="Combustibile"
          id="combustibile"
          value={form.impianto_combustibile}
          onChange={set("impianto_combustibile")}
          options={[
            { value: "gas_metano", label: "Gas metano" },
            { value: "gpl", label: "GPL" },
            { value: "gasolio", label: "Gasolio" },
            { value: "elettrico", label: "Elettrico" },
            { value: "pompa_calore", label: "Pompa di calore" },
            { value: "altro", label: "Altro" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo di caldaia"
          id="caldaia"
          value={form.impianto_tipo_caldaia}
          onChange={set("impianto_tipo_caldaia")}
          options={[
            { value: "tradizionale", label: "Tradizionale" },
            { value: "a_condensazione", label: "A condensazione" },
            { value: "a_bassa_temperatura", label: "A bassa temperatura" },
            { value: "non_presente", label: "Non presente" },
          ]}
        />
        <SelectField
          label="È presente un impianto di condizionamento?"
          id="condizionamento"
          value={form.impianto_condizionamento}
          onChange={set("impianto_condizionamento")}
          options={[
            { value: "si", label: "Sì" },
            { value: "no", label: "No" },
          ]}
          required
        />
      </div>

      {/* ── 7. Dati schermature ── */}
      <Section title="Dati delle schermature solari"
        description="Indica le caratteristiche del prodotto installato. Inserisci il totale dell'intervento al netto delle tasse per avere una stima del totale delle fatture." />
      <SelectField
        label="Tipologia schermatura"
        id="tipo_schermatura"
        value={form.tipologia_schermatura}
        onChange={set("tipologia_schermatura")}
        options={[
          { value: "tenda_da_sole", label: "Tenda da sole" },
          { value: "tenda_a_rullo", label: "Tenda a rullo" },
          { value: "veneziana", label: "Veneziana" },
          { value: "persiana", label: "Persiana" },
          { value: "scuro_avvolgibile", label: "Scuro/Avvolgibile" },
          { value: "frangisole", label: "Frangisole" },
          { value: "altro", label: "Altro" },
        ]}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Produttore" id="produttore" value={form.produttore} onChange={set("produttore")} placeholder="Es. Somfy, Griesser..." required />
        <SelectField
          label="Orientamento"
          id="orientamento"
          value={form.orientamento}
          onChange={set("orientamento")}
          options={[
            { value: "nord", label: "Nord" },
            { value: "nord_est", label: "Nord-Est" },
            { value: "est", label: "Est" },
            { value: "sud_est", label: "Sud-Est" },
            { value: "sud", label: "Sud" },
            { value: "sud_ovest", label: "Sud-Ovest" },
            { value: "ovest", label: "Ovest" },
            { value: "nord_ovest", label: "Nord-Ovest" },
          ]}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Larghezza (cm)" id="larghezza" value={form.larghezza_cm} onChange={set("larghezza_cm")} type="number" placeholder="0" required />
        <Field label="Altezza (cm)" id="altezza" value={form.altezza_cm} onChange={set("altezza_cm")} type="number" placeholder="0" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Numero di unità" id="num_unita" value={form.numero_unita} onChange={set("numero_unita")} type="number" placeholder="1" required />
        <SelectField
          label="Il prodotto è motorizzato?"
          id="motorizzato"
          value={form.motorizzato}
          onChange={set("motorizzato")}
          options={[
            { value: "si", label: "Sì" },
            { value: "no", label: "No" },
          ]}
          required
        />
      </div>
      <Field label="Colore" id="colore" value={form.colore} onChange={set("colore")} placeholder="Es. Bianco, Grigio antracite..." />

      {/* ── 8. Fattura ── */}
      <Section title="Fattura" description="Inserisci il costo totale dell'intervento comprensivo di IVA." />
      <Field
        label="Costo totale dell'intervento (comprensivo IVA) €"
        id="costo"
        value={form.costo_totale_iva}
        onChange={set("costo_totale_iva")}
        type="number"
        placeholder="0.00"
        required
      />
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Form: Infissi ─────────────────────────────────────────────────────────────

function FormInfissiView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormInfissi>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    tipologia_infisso: "",
    materiale: "",
    numero_infissi: "",
    larghezza_cm: "",
    altezza_cm: "",
    trasmittanza_vecchio: "",
    trasmittanza_nuovo: "",
    note: "",
  });

  const set = (k: keyof FormInfissi) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_infissi").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        tipologia_infisso: form.tipologia_infisso || null,
        materiale: form.materiale || null,
        numero_infissi: form.numero_infissi ? Number(form.numero_infissi) : null,
        larghezza_cm: form.larghezza_cm ? Number(form.larghezza_cm) : null,
        altezza_cm: form.altezza_cm ? Number(form.altezza_cm) : null,
        trasmittanza_vecchio: form.trasmittanza_vecchio ? Number(form.trasmittanza_vecchio) : null,
        trasmittanza_nuovo: form.trasmittanza_nuovo ? Number(form.trasmittanza_nuovo) : null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;

      // Advance linked enea_practice to "pronte_da_fare" and fire Messaggio 3
      await advancePracticeToPronteDaFare(praticaId);
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Dettagli infissi" />
      <Field label="Tipologia infisso" id="tipo" value={form.tipologia_infisso} onChange={set("tipologia_infisso")} placeholder="Es. Finestra, Porta-finestra, Portone..." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Materiale" id="materiale" value={form.materiale} onChange={set("materiale")} placeholder="Es. PVC, Alluminio, Legno..." />
        <Field label="N° infissi" id="numero" value={form.numero_infissi} onChange={set("numero_infissi")} type="number" placeholder="0" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Larghezza (cm)" id="larghezza" value={form.larghezza_cm} onChange={set("larghezza_cm")} type="number" placeholder="0" />
        <Field label="Altezza (cm)" id="altezza" value={form.altezza_cm} onChange={set("altezza_cm")} type="number" placeholder="0" />
      </div>

      <Section title="Dati termici" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trasmittanza vecchio (W/m²K)" id="tv" value={form.trasmittanza_vecchio} onChange={set("trasmittanza_vecchio")} type="number" placeholder="0.00" />
        <Field label="Trasmittanza nuovo (W/m²K)" id="tn" value={form.trasmittanza_nuovo} onChange={set("trasmittanza_nuovo")} type="number" placeholder="0.00" />
      </div>
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Form: Impianto Termico ────────────────────────────────────────────────────

function FormImpiantoView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormImpianto>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    tipo_impianto_vecchio: "",
    tipo_impianto_nuovo: "",
    potenza_kw: "",
    anno_installazione: "",
    classe_energetica: "",
    note: "",
  });

  const set = (k: keyof FormImpianto) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_impianto_termico").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        tipo_impianto_vecchio: form.tipo_impianto_vecchio || null,
        tipo_impianto_nuovo: form.tipo_impianto_nuovo || null,
        potenza_kw: form.potenza_kw ? Number(form.potenza_kw) : null,
        anno_installazione: form.anno_installazione ? Number(form.anno_installazione) : null,
        classe_energetica: form.classe_energetica || null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;

      // Advance linked enea_practice to "pronte_da_fare" and fire Messaggio 3
      await advancePracticeToPronteDaFare(praticaId);
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Impianto esistente" />
      <Field label="Tipo impianto vecchio" id="tipoV" value={form.tipo_impianto_vecchio} onChange={set("tipo_impianto_vecchio")} placeholder="Es. Caldaia a gas, Pompa di calore..." />

      <Section title="Nuovo impianto" />
      <Field label="Tipo impianto nuovo" id="tipoN" value={form.tipo_impianto_nuovo} onChange={set("tipo_impianto_nuovo")} placeholder="Es. Pompa di calore aria-acqua..." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Potenza (kW)" id="potenza" value={form.potenza_kw} onChange={set("potenza_kw")} type="number" placeholder="0.0" />
        <Field label="Anno installazione" id="anno" value={form.anno_installazione} onChange={set("anno_installazione")} type="number" placeholder="2025" />
      </div>
      <Field label="Classe energetica" id="classe" value={form.classe_energetica} onChange={set("classe_energetica")} placeholder="Es. A+, A++..." />
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Form: VEPA (Vetrate Panoramiche) ──────────────────────────────────────────
// Identical to Infissi form, without "tipologia infisso" and "vetro dell'infisso
// vecchio" (trasmittanza_vecchio).

interface FormVepa {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  materiale: string;
  numero_infissi: string;
  larghezza_cm: string;
  altezza_cm: string;
  trasmittanza_nuovo: string;
  note: string;
}

function FormVepaView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormVepa>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    materiale: "",
    numero_infissi: "",
    larghezza_cm: "",
    altezza_cm: "",
    trasmittanza_nuovo: "",
    note: "",
  });

  const set = (k: keyof FormVepa) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_vepa").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        materiale: form.materiale || null,
        numero_infissi: form.numero_infissi ? Number(form.numero_infissi) : null,
        larghezza_cm: form.larghezza_cm ? Number(form.larghezza_cm) : null,
        altezza_cm: form.altezza_cm ? Number(form.altezza_cm) : null,
        trasmittanza_nuovo: form.trasmittanza_nuovo ? Number(form.trasmittanza_nuovo) : null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;

      // Advance linked enea_practice to "pronte_da_fare" and fire Messaggio 3
      await advancePracticeToPronteDaFare(praticaId);
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Dettagli vetrate" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Materiale" id="materiale" value={form.materiale} onChange={set("materiale")} placeholder="Es. PVC, Alluminio, Legno..." />
        <Field label="N° infissi" id="numero" value={form.numero_infissi} onChange={set("numero_infissi")} type="number" placeholder="0" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Larghezza (cm)" id="larghezza" value={form.larghezza_cm} onChange={set("larghezza_cm")} type="number" placeholder="0" />
        <Field label="Altezza (cm)" id="altezza" value={form.altezza_cm} onChange={set("altezza_cm")} type="number" placeholder="0" />
      </div>

      <Section title="Dati termici" />
      <Field label="Trasmittanza nuovo (W/m²K)" id="tn" value={form.trasmittanza_nuovo} onChange={set("trasmittanza_nuovo")} type="number" placeholder="0.00" />
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton({ isPending, error }: { isPending: boolean; error: Error | null }) {
  return (
    <div className="pt-2 space-y-2">
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error.message}
        </p>
      )}
      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending}>
        {isPending ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Invio in corso...
          </div>
        ) : "Invia dati"}
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoModulo, string> = {
  "schermature-solari": "Schermature Solari",
  "infissi": "Infissi",
  "impianto-termico": "Impianto Termico",
  "vepa": "VEPA – Vetrate Panoramiche",
};

export default function ModuloClientePage() {
  const { token } = useParams<{ token: string }>();
  // token param works for all four route patterns:
  // /schermature-solari/:token, /modulo-infissi/:token, /impianto-termico/:token, /modulo-vepa/:token
  const [submitted, setSubmitted] = useState(false);

  const { data: tokenInfo, isLoading, error } = useQuery<TokenInfo | null>({
    queryKey: ["token-info", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc("get_token_info", { p_token: token });
      if (error) throw error;
      return (data as TokenInfo[])[0] ?? null;
    },
    enabled: !!token,
  });

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Error / not found ───────────────────────────────────────────────────────
  if (error || !tokenInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h1 className="text-lg font-semibold">Link non valido</h1>
          <p className="text-sm text-muted-foreground">
            Il link che hai utilizzato non è valido o è già stato usato. Contatta il tuo consulente per ricevere un nuovo link.
          </p>
        </div>
      </div>
    );
  }

  // ── Expired ─────────────────────────────────────────────────────────────────
  const isExpired = new Date(tokenInfo.expires_at) < new Date();
  if (isExpired && tokenInfo.stato !== "compilato") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <Clock className="h-12 w-12 text-orange-400 mx-auto" />
          <h1 className="text-lg font-semibold">Link scaduto</h1>
          <p className="text-sm text-muted-foreground">
            Questo link è scaduto il {new Date(tokenInfo.expires_at).toLocaleDateString("it-IT")}. Contatta il tuo consulente per ricevere un nuovo link.
          </p>
        </div>
      </div>
    );
  }

  // ── Already compiled ────────────────────────────────────────────────────────
  if (tokenInfo.stato === "compilato" || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold">Grazie!</h1>
          <p className="text-sm text-muted-foreground">
            I tuoi dati sono stati ricevuti correttamente. Il tuo consulente li utilizzerà per elaborare la pratica ENEA.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="bg-background border-b px-4 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pratica Rapida — ENEA</p>
          <h1 className="text-sm font-semibold leading-tight">
            Modulo {TIPO_LABEL[tokenInfo.tipo_modulo]}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {tokenInfo.nome_cliente && (
          <p className="text-sm text-muted-foreground">
            Ciao <strong>{tokenInfo.nome_cliente}</strong>, compila il modulo qui sotto per fornire i dati necessari alla tua pratica.
          </p>
        )}

        <div className="bg-background rounded-xl border shadow-sm p-5">
          {tokenInfo.tipo_modulo === "schermature-solari" && (
            <FormSchermatureView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
          {tokenInfo.tipo_modulo === "infissi" && (
            <FormInfissiView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
          {tokenInfo.tipo_modulo === "impianto-termico" && (
            <FormImpiantoView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
          {tokenInfo.tipo_modulo === "vepa" && (
            <FormVepaView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          I tuoi dati saranno trattati nel rispetto della normativa GDPR e utilizzati esclusivamente per l'elaborazione della pratica ENEA.
        </p>
      </div>
    </div>
  );
}
