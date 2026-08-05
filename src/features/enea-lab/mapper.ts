import {
  CALDAIA_LABELS,
  COMBUSTIBILE_LABELS,
  IMPIANTO_TIPO_LABELS,
  SCHERMATURA_DIREZIONE_LABELS,
  SCHERMATURA_TIPO_LABELS,
  TERMINALI_LABELS,
  TIPOLOGIA_LABELS,
  TITOLO_LABELS,
} from "@/types/form-cliente";
import type {
  EneaLabField,
  EneaLabFieldStatus,
  EneaLabMappedPractice,
  EneaLabSection,
  EneaLabSourcePractice,
} from "./types";

function display(value: string | boolean | null | undefined): string {
  if (value === true) return "Sì";
  if (value === false) return "No";
  return String(value ?? "").trim();
}

function mappedField(
  id: string,
  label: string,
  value: string | boolean | null | undefined,
  options?: Partial<Pick<EneaLabField, "source" | "status" | "note">>,
): EneaLabField {
  const renderedValue = display(value);
  return {
    id,
    label,
    value: renderedValue || "Non disponibile",
    source: options?.source ?? "Modulo cliente",
    status: options?.status ?? (renderedValue ? "ready" : "missing"),
    note: options?.note,
  };
}

function invoiceField(id: string, label: string, note: string): EneaLabField {
  return mappedField(id, label, "Da estrarre", {
    source: "Fattura",
    status: "missing",
    note,
  });
}

function section(
  id: string,
  title: string,
  description: string,
  fields: EneaLabField[],
): EneaLabSection {
  return { id, title, description, fields };
}

export function mapSchermaturaPractice(source: EneaLabSourcePractice): EneaLabMappedPractice {
  const form = source.form;
  const prodotto = form.prodotto.tipo === "schermature" ? form.prodotto : null;
  const worksAddress = form.residenza.stesso_indirizzo_lavori
    ? {
        comune: form.residenza.comune,
        provincia: form.residenza.provincia,
        indirizzo: form.residenza.indirizzo,
        numero: form.residenza.civico,
        cap: form.residenza.cap,
      }
    : form.appartamento_lavori;

  const sections: EneaLabSection[] = [
    section("beneficiario", "1. Beneficiario", "Anagrafica e titolo del richiedente", [
      mappedField("beneficiario.nome", "Nome", form.richiedente.nome),
      mappedField("beneficiario.cognome", "Cognome", form.richiedente.cognome),
      mappedField("beneficiario.cf", "Codice fiscale", form.richiedente.cf),
      mappedField("beneficiario.data_nascita", "Data di nascita", form.richiedente.data_nascita),
      mappedField("beneficiario.comune_nascita", "Comune di nascita", form.richiedente.comune_nascita),
      mappedField("beneficiario.provincia_nascita", "Provincia di nascita", form.richiedente.provincia_nascita),
      mappedField("beneficiario.email", "Email", form.richiedente.email),
      mappedField("beneficiario.telefono", "Telefono", form.richiedente.telefono),
      mappedField(
        "beneficiario.titolo",
        "Titolo sull'immobile",
        form.edificio.titolo_richiedente
          ? TITOLO_LABELS[form.edificio.titolo_richiedente]
          : "",
      ),
      mappedField("beneficiario.abitazione_principale", "Abitazione principale", form.richiedente.abitazione_principale),
      mappedField("beneficiario.cointestazione", "Cointestazione", form.cointestazione.presente),
      ...(form.cointestazione.presente
        ? [
            mappedField("beneficiario.cointestatario_nome", "Nome cointestatario", form.cointestazione.nome),
            mappedField("beneficiario.cointestatario_cognome", "Cognome cointestatario", form.cointestazione.cognome),
            mappedField("beneficiario.cointestatario_cf", "CF cointestatario", form.cointestazione.cf),
          ]
        : []),
    ]),
    section("residenza", "2. Residenza", "Indirizzo anagrafico del beneficiario", [
      mappedField("residenza.comune", "Comune", form.residenza.comune),
      mappedField("residenza.provincia", "Provincia", form.residenza.provincia),
      mappedField("residenza.indirizzo", "Indirizzo", form.residenza.indirizzo),
      mappedField("residenza.civico", "Civico", form.residenza.civico),
      mappedField("residenza.cap", "CAP", form.residenza.cap),
    ]),
    section("immobile", "3. Immobile", "Ubicazione, catasto e caratteristiche dell'edificio", [
      mappedField("immobile.comune", "Comune lavori", worksAddress.comune),
      mappedField("immobile.provincia", "Provincia lavori", worksAddress.provincia),
      mappedField("immobile.indirizzo", "Indirizzo lavori", worksAddress.indirizzo),
      mappedField("immobile.civico", "Civico lavori", worksAddress.numero),
      mappedField("immobile.cap", "CAP lavori", worksAddress.cap),
      mappedField("immobile.foglio", "Foglio", form.catastali.foglio),
      mappedField("immobile.mappale", "Mappale", form.catastali.mappale),
      mappedField("immobile.subalterno", "Subalterno", form.catastali.subalterno),
      mappedField("immobile.proprietario_nome", "Nome proprietario", form.catastali.proprietario_nome),
      mappedField("immobile.proprietario_cognome", "Cognome proprietario", form.catastali.proprietario_cognome),
      mappedField("immobile.proprietario_cf", "CF proprietario", form.catastali.proprietario_cf),
      mappedField("immobile.anno", "Anno di costruzione", form.edificio.anno_costruzione),
      mappedField("immobile.superficie", "Superficie utile", form.edificio.superficie_mq ? `${form.edificio.superficie_mq} m²` : ""),
      mappedField("immobile.unita", "Numero unità immobiliari", form.edificio.numero_appartamenti),
      mappedField(
        "immobile.tipologia",
        "Tipologia edificio",
        form.edificio.tipologia ? TIPOLOGIA_LABELS[form.edificio.tipologia] : "",
      ),
    ]),
    section("impianto", "4. Impianto esistente", "Caratteristiche dichiarate dal cliente", [
      mappedField("impianto.tipo", "Tipo impianto", form.impianto.tipo ? IMPIANTO_TIPO_LABELS[form.impianto.tipo] : ""),
      mappedField("impianto.terminali", "Terminali", form.impianto.terminali ? TERMINALI_LABELS[form.impianto.terminali] : ""),
      mappedField("impianto.combustibile", "Combustibile", form.impianto.combustibile ? COMBUSTIBILE_LABELS[form.impianto.combustibile] : ""),
      mappedField("impianto.caldaia", "Generatore", form.impianto.tipo_caldaia ? CALDAIA_LABELS[form.impianto.tipo_caldaia] : ""),
      mappedField("impianto.condizionamento", "Aria condizionata", form.impianto.aria_condizionata),
      mappedField("impianto.libretto", "Libretto impianto", form.impianto.libretto_url ? "Presente" : "", {
        status: form.impianto.libretto_url ? "review" : "missing",
        note: "Il documento deve essere aperto e verificato prima della compilazione.",
      }),
    ]),
    section("schermature", "5. Schermature solari", "Dati prodotto già dichiarati e valori tecnici da fattura", [
      ...(prodotto?.items ?? []).flatMap((item, index) => [
        mappedField(
          `schermature.${index}.tipo`,
          `Schermatura ${index + 1} · tipo`,
          item.tipo ? SCHERMATURA_TIPO_LABELS[item.tipo] : "",
        ),
        mappedField(
          `schermature.${index}.direzione`,
          `Schermatura ${index + 1} · orientamento`,
          item.direzione ? SCHERMATURA_DIREZIONE_LABELS[item.direzione] : "",
        ),
      ]),
      invoiceField("schermature.numero", "Numero totale schermature", "Ricavare quantità e corrispondenza delle righe dalla fattura."),
      invoiceField("schermature.superficie", "Superficie totale", "Calcolare larghezza × altezza per ogni elemento e sommare."),
      invoiceField("schermature.marca_modello", "Marca e modello", "Estrarre descrizione commerciale e produttore."),
      invoiceField("schermature.gtot", "Valore gTot", "Individuare il valore tecnico corretto o richiedere la scheda prodotto."),
      invoiceField("schermature.spesa", "Spesa sostenuta", "Somma delle fatture ammissibili, IVA compresa."),
      mappedField("schermature.data_fine_lavori", "Data fine lavori", source.dataFineLavori, {
        source: "Pratica CRM",
      }),
    ]),
    section("documenti", "6. Documenti", "Presenza degli allegati necessari al controllo", [
      mappedField("documenti.fatture", "Fatture", source.fattureCount ? `${source.fattureCount} file` : "", {
        source: "Pratica CRM",
        status: source.fattureCount ? "review" : "missing",
        note: "I file restano in sola lettura durante il laboratorio.",
      }),
      mappedField("documenti.bonifico", "Bonifico", form.documenti.bonifico_url ? "Presente" : "", {
        status: form.documenti.bonifico_url ? "review" : "missing",
      }),
      mappedField("documenti.finanziamento", "Finanziamento", form.documenti.finanziamento === "si"
        ? "Sì"
        : form.documenti.finanziamento === "in_parte"
          ? "In parte"
          : form.documenti.finanziamento === "no"
            ? "No"
            : ""),
      mappedField("documenti.aggiuntivi", "Documenti aggiuntivi", source.documentiCount ? `${source.documentiCount} file` : "", {
        source: "Pratica CRM",
        status: source.documentiCount ? "review" : "missing",
      }),
    ]),
  ];

  const summary: Record<EneaLabFieldStatus, number> = { ready: 0, review: 0, missing: 0 };
  for (const currentSection of sections) {
    for (const currentField of currentSection.fields) summary[currentField.status] += 1;
  }

  return { source, sections, summary };
}
