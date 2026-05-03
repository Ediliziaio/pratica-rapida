// Step components per il form pubblico cliente.
// Ogni step riceve `data`, `errors` e `onChange(patch)` dove `patch` è un
// oggetto con la stessa shape di FormClienteData (deep-merge a livello di
// sezione tramite l'helper `mergeSection` definito nel parent).

import { useRef } from "react";
import { Plus, X, Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  CALDAIA_LABELS,
  COMBUSTIBILE_LABELS,
  FormClienteData,
  IMPIANTO_TIPO_LABELS,
  MATERIALE_LABELS,
  ProdottoTipo,
  SCHERMATURA_DIREZIONE_LABELS,
  SCHERMATURA_TIPO_LABELS,
  TERMINALI_LABELS,
  TIPOLOGIA_LABELS,
  TITOLO_LABELS,
  VETRO_LABELS,
} from "@/types/form-cliente";

import { FieldError } from "./FieldError";
import type { ErrorMap } from "./validation";

// ── Tipi handler condivisi ────────────────────────────────────────────────────
type Section = keyof FormClienteData;
type SectionPatch<S extends Section> = Partial<FormClienteData[S]>;

export interface StepProps {
  data: FormClienteData;
  errors: ErrorMap;
  patchSection: <S extends Section>(section: S, patch: SectionPatch<S>) => void;
}

interface RadioYesNoProps {
  value: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
}

function RadioYesNo({ value, onChange, name }: RadioYesNoProps) {
  return (
    <RadioGroup
      value={value === null ? "" : value ? "si" : "no"}
      onValueChange={(v) => onChange(v === "si")}
      className="flex gap-6"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${name}-si`} value="si" />
        <Label htmlFor={`${name}-si`} className="font-normal">Sì</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${name}-no`} value="no" />
        <Label htmlFor={`${name}-no`} className="font-normal">No</Label>
      </div>
    </RadioGroup>
  );
}

// ── 1. Richiedente ─────────────────────────────────────────────────────────────
export function StepRichiedente({ data, errors, patchSection }: StepProps) {
  const r = data.richiedente;
  const set = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) =>
    patchSection("richiedente", { [k]: v } as SectionPatch<"richiedente">);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" value={r.nome} onChange={(e) => set("nome", e.target.value)} />
          <FieldError errors={errors} field="richiedente.nome" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cognome">Cognome *</Label>
          <Input id="cognome" value={r.cognome} onChange={(e) => set("cognome", e.target.value)} />
          <FieldError errors={errors} field="richiedente.cognome" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="comune_nascita">Comune di nascita *</Label>
          <Input
            id="comune_nascita"
            value={r.comune_nascita}
            onChange={(e) => set("comune_nascita", e.target.value)}
          />
          <FieldError errors={errors} field="richiedente.comune_nascita" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="provincia_nascita">Provincia *</Label>
          <Input
            id="provincia_nascita"
            value={r.provincia_nascita}
            maxLength={2}
            onChange={(e) => set("provincia_nascita", e.target.value.toUpperCase())}
          />
          <FieldError errors={errors} field="richiedente.provincia_nascita" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="data_nascita">Data di nascita *</Label>
        <Input
          id="data_nascita"
          type="date"
          value={r.data_nascita}
          onChange={(e) => set("data_nascita", e.target.value)}
        />
        <FieldError errors={errors} field="richiedente.data_nascita" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cf">Codice fiscale *</Label>
        <Input
          id="cf"
          value={r.cf}
          maxLength={16}
          onChange={(e) => set("cf", e.target.value.toUpperCase())}
        />
        <FieldError errors={errors} field="richiedente.cf" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email di riferimento *</Label>
        <Input
          id="email"
          type="email"
          value={r.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <FieldError errors={errors} field="richiedente.email" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="telefono">Telefono di riferimento *</Label>
        <Input
          id="telefono"
          type="tel"
          placeholder="+39 333 1234567"
          value={r.telefono}
          onChange={(e) => set("telefono", e.target.value)}
        />
        <FieldError errors={errors} field="richiedente.telefono" />
      </div>

      <div className="space-y-2">
        <Label>La casa dove sono stati fatti i lavori è l'abitazione principale? *</Label>
        <RadioYesNo
          name="abitazione_principale"
          value={r.abitazione_principale}
          onChange={(v) => set("abitazione_principale", v)}
        />
        <FieldError errors={errors} field="richiedente.abitazione_principale" />
      </div>
    </div>
  );
}

// ── 2. Indirizzo (residenza + appartamento lavori) ─────────────────────────────
export function StepIndirizzo({ data, errors, patchSection }: StepProps) {
  const r = data.residenza;
  const a = data.appartamento_lavori;
  const setR = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) =>
    patchSection("residenza", { [k]: v } as SectionPatch<"residenza">);
  const setA = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) =>
    patchSection("appartamento_lavori", { [k]: v } as SectionPatch<"appartamento_lavori">);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Indirizzo di residenza</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="res_comune">Comune *</Label>
            <Input id="res_comune" value={r.comune} onChange={(e) => setR("comune", e.target.value)} />
            <FieldError errors={errors} field="residenza.comune" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="res_provincia">Provincia *</Label>
            <Input
              id="res_provincia"
              value={r.provincia}
              maxLength={2}
              onChange={(e) => setR("provincia", e.target.value.toUpperCase())}
            />
            <FieldError errors={errors} field="residenza.provincia" />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="res_indirizzo">Indirizzo *</Label>
          <Input
            id="res_indirizzo"
            value={r.indirizzo}
            onChange={(e) => setR("indirizzo", e.target.value)}
          />
          <FieldError errors={errors} field="residenza.indirizzo" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="res_civico">Numero civico *</Label>
            <Input id="res_civico" value={r.civico} onChange={(e) => setR("civico", e.target.value)} />
            <FieldError errors={errors} field="residenza.civico" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="res_cap">CAP *</Label>
            <Input
              id="res_cap"
              value={r.cap}
              maxLength={5}
              inputMode="numeric"
              onChange={(e) => setR("cap", e.target.value.replace(/\D/g, ""))}
            />
            <FieldError errors={errors} field="residenza.cap" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>L'appartamento dove sono stati fatti i lavori è lo stesso della residenza? *</Label>
          <RadioYesNo
            name="stesso_indirizzo_lavori"
            value={r.stesso_indirizzo_lavori}
            onChange={(v) => setR("stesso_indirizzo_lavori", v)}
          />
          <FieldError errors={errors} field="residenza.stesso_indirizzo_lavori" />
        </div>
      </section>

      {r.stesso_indirizzo_lavori === false && (
        <section className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Indirizzo dell'appartamento dei lavori</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="lav_comune">Comune *</Label>
              <Input
                id="lav_comune"
                value={a.comune}
                onChange={(e) => setA("comune", e.target.value)}
              />
              <FieldError errors={errors} field="appartamento_lavori.comune" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lav_provincia">Provincia *</Label>
              <Input
                id="lav_provincia"
                value={a.provincia}
                maxLength={2}
                onChange={(e) => setA("provincia", e.target.value.toUpperCase())}
              />
              <FieldError errors={errors} field="appartamento_lavori.provincia" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="lav_indirizzo">Indirizzo *</Label>
            <Input
              id="lav_indirizzo"
              value={a.indirizzo}
              onChange={(e) => setA("indirizzo", e.target.value)}
            />
            <FieldError errors={errors} field="appartamento_lavori.indirizzo" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="lav_numero">Numero civico *</Label>
              <Input
                id="lav_numero"
                value={a.numero}
                onChange={(e) => setA("numero", e.target.value)}
              />
              <FieldError errors={errors} field="appartamento_lavori.numero" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lav_cap">CAP *</Label>
              <Input
                id="lav_cap"
                value={a.cap}
                maxLength={5}
                inputMode="numeric"
                onChange={(e) => setA("cap", e.target.value.replace(/\D/g, ""))}
              />
              <FieldError errors={errors} field="appartamento_lavori.cap" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── 3. Cointestazione ──────────────────────────────────────────────────────────
export function StepCointestazione({ data, errors, patchSection }: StepProps) {
  const c = data.cointestazione;
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) =>
    patchSection("cointestazione", { [k]: v } as SectionPatch<"cointestazione">);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>La pratica è cointestata? *</Label>
        <RadioYesNo
          name="cointestata"
          value={c.presente}
          onChange={(v) => set("presente", v)}
        />
        <FieldError errors={errors} field="cointestazione.presente" />
      </div>

      {c.presente === true && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="coint_nome">Nome cointestatario *</Label>
              <Input
                id="coint_nome"
                value={c.nome}
                onChange={(e) => set("nome", e.target.value)}
              />
              <FieldError errors={errors} field="cointestazione.nome" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="coint_cognome">Cognome cointestatario *</Label>
              <Input
                id="coint_cognome"
                value={c.cognome}
                onChange={(e) => set("cognome", e.target.value)}
              />
              <FieldError errors={errors} field="cointestazione.cognome" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="coint_cf">CF cointestatario *</Label>
            <Input
              id="coint_cf"
              value={c.cf}
              maxLength={16}
              onChange={(e) => set("cf", e.target.value.toUpperCase())}
            />
            <FieldError errors={errors} field="cointestazione.cf" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 4. Dati catastali ──────────────────────────────────────────────────────────
export function StepCatastali({ data, errors, patchSection }: StepProps) {
  const c = data.catastali;
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) =>
    patchSection("catastali", { [k]: v } as SectionPatch<"catastali">);

  return (
    <div className="space-y-4">
      {!c.recupero_richiesto && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="foglio">Foglio *</Label>
              <Input id="foglio" value={c.foglio} onChange={(e) => set("foglio", e.target.value)} />
              <FieldError errors={errors} field="catastali.foglio" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mappale">Mappale o particella *</Label>
              <Input
                id="mappale"
                value={c.mappale}
                onChange={(e) => set("mappale", e.target.value)}
              />
              <FieldError errors={errors} field="catastali.mappale" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="subalterno">Subalterno</Label>
              <Input
                id="subalterno"
                value={c.subalterno}
                onChange={(e) => set("subalterno", e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="recupero_richiesto" className="text-sm">
            Non li ho, voglio che li recuperate voi
          </Label>
          <p className="text-xs text-muted-foreground">+10 € sul totale della pratica</p>
        </div>
        <Switch
          id="recupero_richiesto"
          checked={c.recupero_richiesto}
          onCheckedChange={(v) => set("recupero_richiesto", v)}
        />
      </div>

      {c.recupero_richiesto && (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Per recuperare i dati catastali ci servono i dati anagrafici del proprietario dell'immobile.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="prop_nome">Nome proprietario *</Label>
              <Input
                id="prop_nome"
                value={c.proprietario_nome}
                onChange={(e) => set("proprietario_nome", e.target.value)}
              />
              <FieldError errors={errors} field="catastali.proprietario_nome" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prop_cognome">Cognome proprietario *</Label>
              <Input
                id="prop_cognome"
                value={c.proprietario_cognome}
                onChange={(e) => set("proprietario_cognome", e.target.value)}
              />
              <FieldError errors={errors} field="catastali.proprietario_cognome" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prop_cf">CF proprietario *</Label>
            <Input
              id="prop_cf"
              value={c.proprietario_cf}
              maxLength={16}
              onChange={(e) => set("proprietario_cf", e.target.value.toUpperCase())}
            />
            <FieldError errors={errors} field="catastali.proprietario_cf" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. Edificio ────────────────────────────────────────────────────────────────
export function StepEdificio({ data, errors, patchSection }: StepProps) {
  const e = data.edificio;
  const set = <K extends keyof typeof e>(k: K, v: (typeof e)[K]) =>
    patchSection("edificio", { [k]: v } as SectionPatch<"edificio">);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="anno">Anno costruzione *</Label>
          <Input
            id="anno"
            type="number"
            inputMode="numeric"
            min={1800}
            max={2100}
            value={e.anno_costruzione}
            onChange={(ev) => set("anno_costruzione", ev.target.value)}
          />
          <FieldError errors={errors} field="edificio.anno_costruzione" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="superficie">Superficie (mq) *</Label>
          <Input
            id="superficie"
            type="number"
            inputMode="numeric"
            min={1}
            value={e.superficie_mq}
            onChange={(ev) => set("superficie_mq", ev.target.value)}
          />
          <FieldError errors={errors} field="edificio.superficie_mq" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="appartamenti">N. appartamenti *</Label>
          <Input
            id="appartamenti"
            type="number"
            inputMode="numeric"
            min={1}
            value={e.numero_appartamenti}
            onChange={(ev) => set("numero_appartamenti", ev.target.value)}
          />
          <FieldError errors={errors} field="edificio.numero_appartamenti" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Titolo del richiedente *</Label>
        <Select
          value={e.titolo_richiedente || undefined}
          onValueChange={(v) => set("titolo_richiedente", v as typeof e.titolo_richiedente)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TITOLO_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="edificio.titolo_richiedente" />
      </div>

      <div className="space-y-1">
        <Label>Tipologia edificio *</Label>
        <Select
          value={e.tipologia || undefined}
          onValueChange={(v) => set("tipologia", v as typeof e.tipologia)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TIPOLOGIA_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="edificio.tipologia" />
      </div>
    </div>
  );
}

// ── 6. Impianto termico ────────────────────────────────────────────────────────
export function StepImpianto({ data, errors, patchSection }: StepProps) {
  const i = data.impianto;
  const set = <K extends keyof typeof i>(k: K, v: (typeof i)[K]) =>
    patchSection("impianto", { [k]: v } as SectionPatch<"impianto">);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Tipo impianto *</Label>
        <Select
          value={i.tipo || undefined}
          onValueChange={(v) => set("tipo", v as typeof i.tipo)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(IMPIANTO_TIPO_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="impianto.tipo" />
      </div>

      <div className="space-y-1">
        <Label>Terminali di erogazione *</Label>
        <Select
          value={i.terminali || undefined}
          onValueChange={(v) => set("terminali", v as typeof i.terminali)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TERMINALI_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="impianto.terminali" />
      </div>

      <div className="space-y-1">
        <Label>Combustibile *</Label>
        <Select
          value={i.combustibile || undefined}
          onValueChange={(v) => set("combustibile", v as typeof i.combustibile)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMBUSTIBILE_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="impianto.combustibile" />
      </div>

      <div className="space-y-1">
        <Label>Tipo caldaia *</Label>
        <Select
          value={i.tipo_caldaia || undefined}
          onValueChange={(v) => set("tipo_caldaia", v as typeof i.tipo_caldaia)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CALDAIA_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="impianto.tipo_caldaia" />
      </div>

      <div className="space-y-2">
        <Label>È presente l'aria condizionata? *</Label>
        <RadioYesNo
          name="aria_condizionata"
          value={i.aria_condizionata}
          onChange={(v) => set("aria_condizionata", v)}
        />
        <FieldError errors={errors} field="impianto.aria_condizionata" />
      </div>
    </div>
  );
}

// ── 7. Prodotto: variante INFISSI ─────────────────────────────────────────────
function ProdottoInfissi({ data, errors, patchSection }: StepProps) {
  if (data.prodotto.tipo !== "infissi") return null;
  const p = data.prodotto;
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) =>
    patchSection("prodotto", { [k]: v } as SectionPatch<"prodotto">);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Dati infissi vecchi</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Materiale sostituito *</Label>
            <Select
              value={p.vecchi_materiale || undefined}
              onValueChange={(v) => set("vecchi_materiale", v as typeof p.vecchi_materiale)}
            >
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                {Object.entries(MATERIALE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors} field="prodotto.vecchi_materiale" />
          </div>
          <div className="space-y-1">
            <Label>Tipo vetro sostituito *</Label>
            <Select
              value={p.vecchi_vetro || undefined}
              onValueChange={(v) => set("vecchi_vetro", v as typeof p.vecchi_vetro)}
            >
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                {Object.entries(VETRO_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors} field="prodotto.vecchi_vetro" />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-4">
        <h3 className="text-sm font-semibold">Dati nuovi infissi</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Materiale *</Label>
            <Select
              value={p.nuovi_materiale || undefined}
              onValueChange={(v) => set("nuovi_materiale", v as typeof p.nuovi_materiale)}
            >
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                {Object.entries(MATERIALE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors} field="prodotto.nuovi_materiale" />
          </div>
          <div className="space-y-1">
            <Label>Tipo vetro *</Label>
            <Select
              value={p.nuovi_vetro || undefined}
              onValueChange={(v) => set("nuovi_vetro", v as typeof p.nuovi_vetro)}
            >
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                {Object.entries(VETRO_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors} field="prodotto.nuovi_vetro" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Sono state montate zanzariere/tapparelle/persiane? *</Label>
          <RadioYesNo
            name="zanzariere_tapparelle"
            value={p.zanzariere_tapparelle}
            onChange={(v) => set("zanzariere_tapparelle", v)}
          />
          <FieldError errors={errors} field="prodotto.zanzariere_tapparelle" />
        </div>
      </section>
    </div>
  );
}

// ── 7. Prodotto: variante SCHERMATURE ──────────────────────────────────────────
function ProdottoSchermature({ data, errors, patchSection }: StepProps) {
  if (data.prodotto.tipo !== "schermature") return null;
  const p = data.prodotto;
  const items = p.items;

  const updateItem = (idx: number, patch: Partial<(typeof items)[number]>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    patchSection("prodotto", { items: next } as SectionPatch<"prodotto">);
  };
  const addItem = () => {
    patchSection("prodotto", {
      items: [...items, { tipo: "", direzione: "" }],
    } as SectionPatch<"prodotto">);
  };
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    patchSection("prodotto", {
      items: items.filter((_, i) => i !== idx),
    } as SectionPatch<"prodotto">);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Indica quante schermature solari sono state installate e per ognuna il tipo e la direzione.
      </p>
      <FieldError errors={errors} field="prodotto.items" />

      {items.map((it, idx) => (
        <div key={idx} className="rounded-md border p-3 space-y-3 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Schermatura #{idx + 1}
            </span>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:text-destructive"
                onClick={() => removeItem(idx)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo prodotto *</Label>
              <Select
                value={it.tipo || undefined}
                onValueChange={(v) => updateItem(idx, { tipo: v as typeof it.tipo })}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHERMATURA_TIPO_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={errors} field={`prodotto.items.${idx}.tipo`} />
            </div>
            <div className="space-y-1">
              <Label>Direzione *</Label>
              <Select
                value={it.direzione || undefined}
                onValueChange={(v) => updateItem(idx, { direzione: v as typeof it.direzione })}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHERMATURA_DIREZIONE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={errors} field={`prodotto.items.${idx}.direzione`} />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" className="w-full" onClick={addItem}>
        <Plus className="h-4 w-4 mr-2" />
        Aggiungi schermatura
      </Button>
    </div>
  );
}

// ── 7. Prodotto: variante IMPIANTO TERMICO ─────────────────────────────────────
interface ProdottoImpiantoProps extends StepProps {
  practiceId: string;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  uploading: boolean;
}

function ProdottoImpianto({
  data,
  errors,
  patchSection,
  practiceId,
  onUploadStart,
  onUploadEnd,
  uploading,
}: ProdottoImpiantoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const libretto = data.impianto.libretto_url;

  const onFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("File troppo grande (max 20MB)");
      return;
    }
    onUploadStart();
    try {
      // Lazy import per evitare ciclo: il client supabase è in @/integrations/supabase/client
      const { supabase } = await import("@/integrations/supabase/client");
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${practiceId}/libretto/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("enea-documents")
        .upload(path, file, { upsert: false });
      if (error) {
        console.error("Upload libretto failed:", error);
        alert("Caricamento fallito. Riprova.");
        return;
      }
      patchSection("impianto", { libretto_url: path } as SectionPatch<"impianto">);
    } finally {
      onUploadEnd();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Per le pratiche di impianto termico (es. pompe di calore) è necessario il libretto
        dell'impianto. Carica un file PDF, JPG o PNG (max 20MB).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />

      {libretto ? (
        <div className="rounded-md border p-3 flex items-center justify-between">
          <div className="text-sm">
            <p className="font-medium">Libretto caricato</p>
            <p className="text-xs text-muted-foreground break-all">{libretto.split("/").pop()}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sostituisci"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Carica libretto impianto
        </Button>
      )}
      <FieldError errors={errors} field="prodotto.libretto" />
    </div>
  );
}

// ── 7. Prodotto: dispatcher ───────────────────────────────────────────────────
export interface StepProdottoProps extends StepProps {
  prodottoTipo: ProdottoTipo;
  practiceId: string;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}

export function StepProdotto(props: StepProdottoProps) {
  if (props.prodottoTipo === "infissi") return <ProdottoInfissi {...props} />;
  if (props.prodottoTipo === "schermature") return <ProdottoSchermature {...props} />;
  return <ProdottoImpianto {...props} />;
}
