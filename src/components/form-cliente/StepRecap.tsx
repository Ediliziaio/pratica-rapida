// Step finale di riepilogo: lista read-only di tutti i dati raccolti.
// Da qui l'utente preme "Invia pratica" che chiama submit_form_by_token.

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

interface Props {
  data: FormClienteData;
  prodottoTipo: ProdottoTipo;
}

interface RowProps {
  label: string;
  value: React.ReactNode;
}

function Row({ label, value }: RowProps) {
  const display =
    value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium sm:text-right break-all">{display}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border p-3 space-y-1">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {children}
    </section>
  );
}

function siNo(v: boolean | null) {
  if (v === null) return "—";
  return v ? "Sì" : "No";
}

export function StepRecap({ data, prodottoTipo }: Props) {
  const r = data.richiedente;
  const res = data.residenza;
  const a = data.appartamento_lavori;
  const c = data.cointestazione;
  const cat = data.catastali;
  const ed = data.edificio;
  const i = data.impianto;
  const p = data.prodotto;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Controlla che i dati siano corretti, poi premi "Invia pratica".
      </p>

      <Section title="Dati richiedente">
        <Row label="Nome e cognome" value={`${r.nome} ${r.cognome}`.trim()} />
        <Row label="Comune di nascita" value={`${r.comune_nascita} (${r.provincia_nascita})`} />
        <Row label="Data di nascita" value={r.data_nascita} />
        <Row label="Codice fiscale" value={r.cf} />
        <Row label="Email" value={r.email} />
        <Row label="Telefono" value={r.telefono} />
        <Row label="Abitazione principale" value={siNo(r.abitazione_principale)} />
      </Section>

      <Section title="Indirizzo di residenza">
        <Row label="Comune" value={`${res.comune} (${res.provincia})`} />
        <Row label="Indirizzo" value={`${res.indirizzo} ${res.civico}`} />
        <Row label="CAP" value={res.cap} />
        <Row
          label="Stesso indirizzo dei lavori"
          value={siNo(res.stesso_indirizzo_lavori)}
        />
      </Section>

      {res.stesso_indirizzo_lavori === false && (
        <Section title="Indirizzo dell'appartamento dei lavori">
          <Row label="Comune" value={`${a.comune} (${a.provincia})`} />
          <Row label="Indirizzo" value={`${a.indirizzo} ${a.numero}`} />
          <Row label="CAP" value={a.cap} />
        </Section>
      )}

      <Section title="Cointestazione">
        <Row label="Pratica cointestata" value={siNo(c.presente)} />
        {c.presente && (
          <>
            <Row label="Cointestatario" value={`${c.nome} ${c.cognome}`.trim()} />
            <Row label="CF cointestatario" value={c.cf} />
          </>
        )}
      </Section>

      <Section title="Dati catastali">
        {cat.recupero_richiesto ? (
          <>
            <Row label="Recupero dati catastali" value="Richiesto (+10€)" />
            <Row
              label="Proprietario"
              value={`${cat.proprietario_nome} ${cat.proprietario_cognome}`.trim()}
            />
            <Row label="CF proprietario" value={cat.proprietario_cf} />
          </>
        ) : (
          <>
            <Row label="Foglio" value={cat.foglio} />
            <Row label="Mappale / particella" value={cat.mappale} />
            <Row label="Subalterno" value={cat.subalterno} />
          </>
        )}
      </Section>

      <Section title="Edificio">
        <Row label="Anno di costruzione" value={ed.anno_costruzione} />
        <Row label="Superficie" value={ed.superficie_mq ? `${ed.superficie_mq} mq` : ""} />
        <Row label="Numero appartamenti" value={ed.numero_appartamenti} />
        <Row
          label="Titolo del richiedente"
          value={ed.titolo_richiedente ? TITOLO_LABELS[ed.titolo_richiedente] : ""}
        />
        <Row label="Tipologia" value={ed.tipologia ? TIPOLOGIA_LABELS[ed.tipologia] : ""} />
      </Section>

      <Section title="Impianto termico">
        <Row label="Tipo impianto" value={i.tipo ? IMPIANTO_TIPO_LABELS[i.tipo] : ""} />
        <Row label="Terminali" value={i.terminali ? TERMINALI_LABELS[i.terminali] : ""} />
        <Row label="Combustibile" value={i.combustibile ? COMBUSTIBILE_LABELS[i.combustibile] : ""} />
        <Row label="Caldaia" value={i.tipo_caldaia ? CALDAIA_LABELS[i.tipo_caldaia] : ""} />
        <Row label="Aria condizionata" value={siNo(i.aria_condizionata)} />
      </Section>

      <Section title="Prodotto installato">
        {prodottoTipo === "infissi" && p.tipo === "infissi" && (
          <>
            <Row
              label="Vecchi infissi"
              value={`${p.vecchi_materiale ? MATERIALE_LABELS[p.vecchi_materiale] : ""}${
                p.vecchi_vetro ? " · vetro " + VETRO_LABELS[p.vecchi_vetro] : ""
              }`}
            />
            <Row
              label="Nuovi infissi"
              value={`${p.nuovi_materiale ? MATERIALE_LABELS[p.nuovi_materiale] : ""}${
                p.nuovi_vetro ? " · vetro " + VETRO_LABELS[p.nuovi_vetro] : ""
              }`}
            />
            <Row label="Zanzariere/tapparelle/persiane" value={siNo(p.zanzariere_tapparelle)} />
          </>
        )}
        {prodottoTipo === "schermature" && p.tipo === "schermature" && (
          <div className="space-y-1">
            {p.items.map((it, idx) => (
              <Row
                key={idx}
                label={`Schermatura #${idx + 1}`}
                value={`${it.tipo ? SCHERMATURA_TIPO_LABELS[it.tipo] : ""}${
                  it.direzione ? " · " + SCHERMATURA_DIREZIONE_LABELS[it.direzione] : ""
                }`}
              />
            ))}
          </div>
        )}
        {prodottoTipo === "impianto_termico" && (
          <Row
            label="Libretto impianto"
            value={i.libretto_url ? "Caricato" : "—"}
          />
        )}
      </Section>
    </div>
  );
}
