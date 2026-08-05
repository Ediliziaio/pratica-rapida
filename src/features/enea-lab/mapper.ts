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
import { getGeneratorTestConvention } from "./conventions";
import { validateOperatorOverride } from "./operatorValidation";
import type {
  EneaLabDocumentAnalysis,
  EneaLabField,
  EneaLabFieldStatus,
  EneaLabMapOptions,
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
  options?: Partial<Pick<
    EneaLabField,
    "source" | "status" | "note" | "required" | "editable" | "testOnly"
  >>,
): EneaLabField {
  const renderedValue = display(value);
  const required = options?.required ?? true;
  return {
    id,
    label,
    value: renderedValue || (required ? "Intervento umano richiesto" : "Non indicato"),
    source: options?.source ?? "Modulo cliente",
    status: options?.status ?? (renderedValue ? "ready" : required ? "missing" : "ready"),
    required,
    editable: options?.editable ?? required,
    testOnly: options?.testOnly ?? false,
    note: options?.note,
  };
}

function section(
  id: string,
  title: string,
  description: string,
  fields: EneaLabField[],
): EneaLabSection {
  return { id, title, description, fields };
}

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function inferredDestination(tipologia: string): string {
  return tipologia === "edificio_industriale_o_commerciale"
    ? "Non residenziale"
    : tipologia
      ? "Residenziale"
      : "";
}

function sexFromItalianFiscalCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^[A-Z]{6}\d{2}[A-Z](\d{2})[A-Z]\d{3}[A-Z]$/);
  if (!match) return "";
  return Number(match[1]) > 40 ? "F" : "M";
}

function applyOperatorState(sections: EneaLabSection[], options?: EneaLabMapOptions): EneaLabSection[] {
  return sections.map((currentSection) => ({
    ...currentSection,
    fields: currentSection.fields.map((field) => {
      const override = options?.overrides?.[field.id]?.trim();
      if (override) {
        const validation = validateOperatorOverride(field.id, override);
        return {
          ...field,
          value: validation.value,
          source: "Inserimento operatore",
          status: validation.valid ? "ready" : "missing",
          testOnly: false,
          note: validation.valid
            ? "Valore inserito localmente nel laboratorio; il CRM non è stato modificato."
            : `${validation.message} Il CRM non è stato modificato.`,
        };
      }
      if (field.status === "review" && options?.confirmedFieldIds?.has(field.id)) {
        return {
          ...field,
          status: "ready",
          note: field.note ? `${field.note} Controllo confermato dall'operatore.` : "Controllo confermato dall'operatore.",
        };
      }
      return field;
    }),
  }));
}

function applyKnownFieldValidation(sections: EneaLabSection[]): EneaLabSection[] {
  return sections.map((currentSection) => ({
    ...currentSection,
    fields: currentSection.fields.map((field) => {
      if (field.status !== "ready" || field.testOnly) return field;
      const validation = validateOperatorOverride(field.id, field.value);
      if (validation.valid) return validation.value === field.value
        ? field
        : { ...field, value: validation.value };
      return {
        ...field,
        status: "missing",
        note: field.note
          ? `${field.note} Formato non valido: ${validation.message}`
          : `Formato non valido: ${validation.message}`,
      };
    }),
  }));
}

function parseMappedNumber(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function recalculateScreeningSummary(sections: EneaLabSection[]): EneaLabSection[] {
  return sections.map((currentSection) => {
    if (currentSection.id !== "schermature") return currentSection;
    const surfaceFields = currentSection.fields.filter((field) =>
      /^schermature\.\d+\.superficie$/.test(field.id),
    );
    const totalField = currentSection.fields.find((field) => field.id === "schermature.superficie_totale");
    if (!surfaceFields.length || totalField?.source === "Inserimento operatore") return currentSection;
    const surfaces = surfaceFields.map((field) => field.status === "ready" ? parseMappedNumber(field.value) : null);
    if (surfaces.some((value) => value === null)) return currentSection;
    const total = surfaces.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return {
      ...currentSection,
      fields: currentSection.fields.map((field) => field.id === "schermature.superficie_totale"
        ? {
            ...field,
            value: `${formatNumber(total)} m²`,
            source: "Calcolo ENEA",
            status: "ready",
            note: "Ricalcolata dalle superfici dei singoli elementi verificati.",
          }
        : field),
    };
  });
}

export function mapSchermaturaPractice(
  source: EneaLabSourcePractice,
  analysis?: EneaLabDocumentAnalysis,
  options?: EneaLabMapOptions,
): EneaLabMappedPractice {
  const form = source.form;
  const prodotto = form.prodotto.tipo === "schermature" ? form.prodotto : null;
  const convention = getGeneratorTestConvention(source.id);
  const includeTestConventions = options?.includeTestConventions ?? true;
  const inferredSex = sexFromItalianFiscalCode(form.richiedente.cf);
  const worksAddress = form.residenza.stesso_indirizzo_lavori
    ? {
        comune: form.residenza.comune,
        provincia: form.residenza.provincia,
        indirizzo: form.residenza.indirizzo,
        numero: form.residenza.civico,
        cap: form.residenza.cap,
      }
    : form.appartamento_lavori;

  const detectedItems = analysis?.items ?? [];
  const declaredItems = prodotto?.items ?? [];
  const screeningCount = Math.max(detectedItems.length, declaredItems.length);
  const screeningFields = Array.from({ length: screeningCount }).flatMap((_, index) => {
    const item = detectedItems[index];
    const declared = prodotto?.items[index];
    const validGTot = item?.gTot !== null
      && item?.gTot !== undefined
      && item.gTot > 0
      && item.gTot <= 0.35;
    return [
      mappedField(
        `schermature.${index}.tipo`,
        `Elemento ${index + 1} · tipo schermatura`,
        declared?.tipo ? SCHERMATURA_TIPO_LABELS[declared.tipo] : "",
      ),
      mappedField(
        `schermature.${index}.installazione`,
        `Elemento ${index + 1} · installazione`,
        declared?.tipo ? "Esterna" : "",
        {
          source: "Regola controllata",
          status: declared?.tipo ? "review" : "missing",
          note: "Ipotesi coerente con tende e pergole; confermare sul prodotto reale.",
        },
      ),
      mappedField(
        `schermature.${index}.dimensioni`,
        `Elemento ${index + 1} · dimensioni`,
        item ? `${item.widthMm} × ${item.heightMm} mm` : "",
        {
          source: item ? "Fattura" : "Modulo cliente",
          editable: true,
          note: item ? undefined : "Misure non estratte dalla fattura: inserirle dopo aver verificato il documento.",
        },
      ),
      mappedField(
        `schermature.${index}.superficie`,
        `Elemento ${index + 1} · superficie schermatura`,
        item ? `${formatNumber(item.surfaceM2)} m²` : "",
        {
          source: "Calcolo ENEA",
          note: item ? undefined : "Inserire la superficie calcolata dalle misure verificate.",
        },
      ),
      mappedField(
        `schermature.${index}.superficie_finestrata`,
        `Elemento ${index + 1} · superficie finestrata protetta`,
        "",
        {
          source: "Calcolo ENEA",
          note: "Non si può dedurre dalla misura della tenda: inserire la superficie vetrata verificata.",
        },
      ),
      mappedField(
        `schermature.${index}.rsupp`,
        `Elemento ${index + 1} · resistenza termica supplementare`,
        "",
        { note: "Inserire il valore dichiarato nella documentazione tecnica applicabile." },
      ),
      mappedField(
        `schermature.${index}.esposizione`,
        `Elemento ${index + 1} · esposizione`,
        declared?.direzione ? SCHERMATURA_DIREZIONE_LABELS[declared.direzione] : "",
      ),
      mappedField(
        `schermature.${index}.modalita_calcolo`,
        `Elemento ${index + 1} · modalità di calcolo`,
        item?.gTot !== null && item?.gTot !== undefined ? "Dichiarato dal fornitore" : "",
        { source: "Fattura", status: item?.gTot !== null && item?.gTot !== undefined ? "review" : "missing" },
      ),
      mappedField(
        `schermature.${index}.gtot`,
        `Elemento ${index + 1} · gTot`,
        item?.gTot === null || item?.gTot === undefined ? "" : formatNumber(item.gTot, 2),
        {
          source: "Fattura",
          status: validGTot ? "ready" : "missing",
          note: validGTot ? "Requisito automatico verificato: gTot ≤ 0,35." : "Il valore deve essere documentato e non superiore a 0,35.",
        },
      ),
      mappedField(
        `schermature.${index}.materiale`,
        `Elemento ${index + 1} · materiale`,
        "",
        { note: "Selezionare il materiale dichiarato dal produttore." },
      ),
      mappedField(
        `schermature.${index}.regolazione`,
        `Elemento ${index + 1} · meccanismo di regolazione`,
        "",
        { note: "Indicare manuale o automatico in base al prodotto installato." },
      ),
    ];
  });

  const rawSections: EneaLabSection[] = [
    section("beneficiario", "1. Beneficiario", "Anagrafica e titolo del richiedente", [
      mappedField("beneficiario.nome", "Nome", form.richiedente.nome),
      mappedField("beneficiario.cognome", "Cognome", form.richiedente.cognome),
      mappedField("beneficiario.cf", "Codice fiscale", form.richiedente.cf),
      mappedField("beneficiario.data_nascita", "Data di nascita", formatDate(form.richiedente.data_nascita)),
      mappedField("beneficiario.comune_nascita", "Comune di nascita", form.richiedente.comune_nascita),
      mappedField("beneficiario.provincia_nascita", "Provincia di nascita", form.richiedente.provincia_nascita),
      mappedField("beneficiario.sesso", "Sesso", inferredSex, {
        source: "Regola controllata",
        status: inferredSex ? "ready" : "missing",
        note: inferredSex
          ? "Ricavato dal giorno di nascita codificato nel codice fiscale italiano."
          : "Non ricavabile con sicurezza dal codice fiscale disponibile.",
      }),
      mappedField("beneficiario.email", "Email", form.richiedente.email),
      mappedField("beneficiario.telefono", "Telefono", form.richiedente.telefono),
      mappedField(
        "beneficiario.titolo",
        "Titolo sull'immobile",
        form.edificio.titolo_richiedente ? TITOLO_LABELS[form.edificio.titolo_richiedente] : "",
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
    section("immobile", "2. Immobile", "Ubicazione, catasto e caratteristiche dell'edificio", [
      mappedField("immobile.comune", "Comune lavori", worksAddress.comune),
      mappedField("immobile.provincia", "Provincia lavori", worksAddress.provincia),
      mappedField("immobile.indirizzo", "Indirizzo lavori", worksAddress.indirizzo),
      mappedField("immobile.civico", "Civico lavori", worksAddress.numero),
      mappedField("immobile.cap", "CAP lavori", worksAddress.cap),
      mappedField("immobile.codice_comune", "Codice nazionale del Comune", "", {
        note: "Recuperare il codice catastale del Comune da una fonte ufficiale.",
      }),
      mappedField("immobile.foglio", "Foglio", form.catastali.foglio),
      mappedField("immobile.mappale", "Particella / mappale", form.catastali.mappale),
      mappedField("immobile.subalterno", "Subalterno", form.catastali.subalterno, { required: false }),
      mappedField("immobile.anno", "Anno di costruzione", form.edificio.anno_costruzione),
      mappedField("immobile.superficie", "Superficie utile", form.edificio.superficie_mq ? `${form.edificio.superficie_mq} m²` : ""),
      mappedField("immobile.unita", "Numero unità immobiliari", form.edificio.numero_appartamenti),
      mappedField(
        "immobile.destinazione_generale",
        "Destinazione d'uso generale",
        inferredDestination(form.edificio.tipologia),
        {
          source: "Regola controllata",
          status: form.edificio.tipologia ? "review" : "missing",
          note: "Inferita dalla tipologia dichiarata; confermare prima dell'invio.",
        },
      ),
      mappedField(
        "immobile.tipologia",
        "Tipologia edilizia",
        form.edificio.tipologia ? TIPOLOGIA_LABELS[form.edificio.tipologia] : "",
      ),
      mappedField("immobile.zona_climatica", "Zona climatica", "", {
        note: "Recuperare dal Comune dell'intervento.",
      }),
      mappedField("immobile.gradi_giorno", "Gradi giorno", "", {
        note: "Recuperare dal Comune dell'intervento.",
      }),
      mappedField("immobile.fascia_solare", "Fascia solare", "", {
        note: "Verificare il valore proposto dal portale ENEA.",
      }),
    ]),
    section("intervento", "3. Intervento", "Unità interessate e date dei lavori", [
      mappedField(
        "intervento.ambito",
        "Intervento su",
        form.edificio.numero_appartamenti ? "Singola unità immobiliare" : "",
        {
          source: "Regola controllata",
          status: form.edificio.numero_appartamenti ? "review" : "missing",
          note: "Confermare se l'intervento riguarda una singola unità o parti comuni.",
        },
      ),
      mappedField("intervento.unita_totali", "Unità immobiliari totali", form.edificio.numero_appartamenti),
      mappedField("intervento.unita_oggetto", "Unità oggetto della detrazione", "", {
        note: "Dato distinto dal numero totale di appartamenti dell'edificio.",
      }),
      mappedField("intervento.accorpamenti", "Accorpamenti di unità immobiliari", "", {
        note: "Il modulo cliente non raccoglie questa informazione.",
      }),
      mappedField("intervento.data_inizio", "Data inizio lavori", formatDate(analysis?.firstInvoiceDate), {
        source: "Fattura",
        status: analysis?.firstInvoiceDate ? "review" : "missing",
        note: analysis?.firstInvoiceDate
          ? "Proposta dalla prima data fattura riconosciuta; confermare che coincida con l'inizio lavori."
          : "Non ricavata con sicurezza.",
      }),
      mappedField("intervento.data_fine", "Data fine lavori", formatDate(source.dataFineLavori), {
        source: "Pratica CRM",
      }),
    ]),
    section("impianto", "4. Impianto esistente", "Caratteristiche dell'impianto prima dei lavori", [
      mappedField("impianto.tipo", "Tipo impianto", form.impianto.tipo ? IMPIANTO_TIPO_LABELS[form.impianto.tipo] : ""),
      mappedField("impianto.terminali", "Terminali", form.impianto.terminali ? TERMINALI_LABELS[form.impianto.terminali] : ""),
      mappedField("impianto.distribuzione", "Tipo di distribuzione", "", {
        note: "Dato non raccolto dal modulo cliente.",
      }),
      mappedField("impianto.regolazione", "Tipo di regolazione", "", {
        note: "Dato non raccolto dal modulo cliente.",
      }),
      mappedField("impianto.generatore", "Tipo generatore", form.impianto.tipo_caldaia ? CALDAIA_LABELS[form.impianto.tipo_caldaia] : ""),
      mappedField("impianto.numero_generatori", "Numero generatori", form.impianto.tipo_caldaia ? "1" : "", {
        source: "Regola controllata",
        status: form.impianto.tipo_caldaia ? "review" : "missing",
      }),
      mappedField(
        "impianto.rendimento",
        "Rendimento al 100%",
        includeTestConventions ? `${formatNumber(convention.usefulEfficiencyPercent)}%` : "",
        {
          source: includeTestConventions ? "Convenzione di prova" : "Calcolo ENEA",
          status: "missing",
          testOnly: includeTestConventions,
          note: "Valore convenzionale 96,8%-98,9% utilizzabile soltanto per prove; per l'invio serve un dato verificato.",
        },
      ),
      mappedField(
        "impianto.potenza",
        "Potenza utile nominale",
        includeTestConventions ? `${formatNumber(convention.nominalPowerKw)} kW` : "",
        {
          source: includeTestConventions ? "Convenzione di prova" : "Calcolo ENEA",
          status: "missing",
          testOnly: includeTestConventions,
          note: "Valore convenzionale 26,4-32,8 kW utilizzabile soltanto per prove; per l'invio serve un dato verificato.",
        },
      ),
      mappedField("impianto.combustibile", "Vettore energetico", form.impianto.combustibile ? COMBUSTIBILE_LABELS[form.impianto.combustibile] : ""),
      mappedField("impianto.condizionamento", "Climatizzazione estiva", form.impianto.aria_condizionata),
      mappedField("impianto.manutenzione", "Manutenzioni straordinarie", "", {
        required: false,
        note: "Compilare solo se presenti interventi pertinenti sull'impianto.",
      }),
    ]),
    section("schermature", "5. Schermature solari", "Dati tecnici, spese e risparmio energetico", [
      ...screeningFields,
      mappedField(
        "schermature.numero",
        "Numero totale schermature",
        screeningCount ? String(screeningCount) : "",
        {
          source: detectedItems.length ? "Fattura" : "Modulo cliente",
          status: detectedItems.length === declaredItems.length && detectedItems.length > 0
            ? "ready"
            : screeningCount
              ? "review"
              : "missing",
          note: detectedItems.length && detectedItems.length !== declaredItems.length
            ? `La fattura descrive ${detectedItems.length} elementi e il modulo cliente ${declaredItems.length}: confermare il numero corretto.`
            : detectedItems.length
              ? undefined
              : "Numero ricavato dal modulo cliente: verificare sulle fatture.",
        },
      ),
      mappedField(
        "schermature.superficie_totale",
        "Superficie totale schermature",
        analysis?.items.length
          ? `${formatNumber(analysis.items.reduce((sum, item) => sum + item.surfaceM2, 0))} m²`
          : "",
        {
          source: "Calcolo ENEA",
          status: detectedItems.length > 0 && detectedItems.length === screeningCount ? "ready" : "missing",
          note: detectedItems.length > 0 && detectedItems.length !== screeningCount
            ? "Totale parziale: almeno una schermatura non è stata riconosciuta nella fattura."
            : undefined,
        },
      ),
      mappedField(
        "schermature.spesa",
        "Spese congrue sostenute",
        analysis?.eligibleExpense === null || analysis?.eligibleExpense === undefined
          ? ""
          : formatCurrency(analysis.eligibleExpense),
        {
          source: "Calcolo ENEA",
          note: analysis?.creditTotal ? `Sottratte note di credito per ${formatCurrency(analysis.creditTotal)}.` : undefined,
        },
      ),
      mappedField(
        "schermature.risparmio_energia",
        "Risparmio energia primaria non rinnovabile",
        form.impianto.aria_condizionata === false ? "0 kWh/anno" : "",
        {
          source: "Calcolo ENEA",
          status: form.impianto.aria_condizionata === false ? "ready" : "missing",
          note: form.impianto.aria_condizionata === false
            ? "ENEA consente 0 in assenza di climatizzazione estiva."
            : "Con climatizzazione estiva presente deve essere calcolato con ShadoWindow o metodo equivalente.",
        },
      ),
      mappedField("schermature.spese_professionali", "Spese professionali", "", {
        required: false,
        note: "Compilare soltanto se comprese nella spesa comunicata.",
      }),
    ]),
    section("documenti", "6. Controllo documenti", "Allegati da verificare prima dell'invio", [
      mappedField("documenti.fatture", "Fatture", source.fattureCount ? `${source.fattureCount} file` : "", {
        source: "Pratica CRM",
        status: source.fattureCount ? "review" : "missing",
        note: "Download e analisi avvengono in sola lettura.",
      }),
      mappedField("documenti.bonifico", "Bonifico parlante", form.documenti.bonifico_url ? "Presente" : "", {
        status: form.documenti.bonifico_url ? "review" : "missing",
      }),
      mappedField("documenti.tecnici", "Scheda tecnica / attestazione gTot", source.documentiCount ? `${source.documentiCount} file da controllare` : "", {
        source: "Pratica CRM",
        status: source.documentiCount ? "review" : "missing",
        note: "Verificare marcatura CE, dichiarazione di prestazione e attestazione gTot applicabile.",
      }),
      mappedField("documenti.finanziamento", "Finanziamento", form.documenti.finanziamento === "si"
        ? "Sì"
        : form.documenti.finanziamento === "in_parte"
          ? "In parte"
          : form.documenti.finanziamento === "no"
            ? "No"
            : "", { required: false }),
    ]),
  ];

  const sections = recalculateScreeningSummary(
    applyKnownFieldValidation(applyOperatorState(rawSections, options)),
  );
  const summary: Record<EneaLabFieldStatus, number> = { ready: 0, review: 0, missing: 0 };
  for (const currentSection of sections) {
    for (const currentField of currentSection.fields) {
      if (currentField.required) summary[currentField.status] += 1;
    }
  }

  return { source, sections, summary };
}
