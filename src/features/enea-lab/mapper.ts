import {
  CALDAIA_LABELS,
  SCHERMATURA_DIREZIONE_LABELS,
  TIPOLOGIA_LABELS,
  TITOLO_LABELS,
} from "@/types/form-cliente";
import { getGeneratorTestConvention } from "./conventions";
import {
  centralizedPlantFromType,
  interventionScopeFromUnitCount,
  interventionTypeFromProduct,
} from "./interventionRules";
import {
  ENEA_PLANT_DISTRIBUTION,
  ENEA_PLANT_REGULATION,
  energyCarrierFromForm,
  plantTerminalFromForm,
  plantTypeFromForm,
} from "./plantRules";
import { ENEA_SCREENING_TYPE, screeningRules } from "./screeningRules";
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

function inferredParticularDestination(tipologia: string): string {
  return tipologia && tipologia !== "edificio_industriale_o_commerciale"
    ? "Edifici adibiti a residenza e assimilabili (con carattere continuativo o saltuario)"
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

function truncateOneDecimal(value: number): number {
  return Math.floor((value + Number.EPSILON) * 10) / 10;
}

function recalculateScreeningSurfaces(sections: EneaLabSection[]): EneaLabSection[] {
  return sections.map((currentSection) => {
    if (currentSection.id !== "schermature") return currentSection;
    const fieldsById = new Map(currentSection.fields.map((field) => [field.id, field]));

    return {
      ...currentSection,
      fields: currentSection.fields.map((field) => {
        const match = field.id.match(/^schermature\.(\d+)\.superficie$/);
        if (!match || field.source === "Inserimento operatore") return field;
        const dimensions = fieldsById.get(`schermature.${match[1]}.dimensioni`);
        if (dimensions?.status !== "ready" || dimensions.source !== "Inserimento operatore") return field;
        const size = dimensions.value.match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})(?:\s*mm)?$/i);
        if (!size) return field;
        const surface = truncateOneDecimal((Number(size[1]) * Number(size[2])) / 1_000_000);
        return {
          ...field,
          value: `${formatNumber(surface)} m²`,
          source: "Calcolo ENEA",
          status: "ready",
          note: "Ricalcolata automaticamente dalle dimensioni verificate dall'operatore.",
        };
      }),
    };
  });
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

const DARKENING_CLOSURE_TYPES = new Set<string>([
  ENEA_SCREENING_TYPE.shutter,
  ENEA_SCREENING_TYPE.rollerShutter,
  ENEA_SCREENING_TYPE.otherDarkeningClosure,
]);

function recalculateScreeningEnergySaving(
  sections: EneaLabSection[],
  hasSummerCooling: boolean | null,
): EneaLabSection[] {
  return sections.map((currentSection) => {
    if (currentSection.id !== "schermature") return currentSection;
    const energyField = currentSection.fields.find((field) => field.id === "schermature.risparmio_energia");
    if (!energyField || energyField.source === "Inserimento operatore") return currentSection;

    const typeFields = currentSection.fields.filter((field) => /^schermature\.\d+\.tipo$/.test(field.id));
    const typesAreKnown = typeFields.length > 0
      && typeFields.every((field) => field.status === "ready" && !field.testOnly && Boolean(field.value.trim()));
    const hasDarkeningClosure = typeFields.some((field) => DARKENING_CLOSURE_TYPES.has(field.value));
    const canUseZeroForSolarScreenings = hasSummerCooling === false
      && typesAreKnown
      && !hasDarkeningClosure;

    return {
      ...currentSection,
      fields: currentSection.fields.map((field) => field.id === "schermature.risparmio_energia"
        ? {
            ...field,
            value: canUseZeroForSolarScreenings ? "0 kWh/anno" : "Intervento umano richiesto",
            source: "Calcolo ENEA",
            status: canUseZeroForSolarScreenings ? "ready" : "missing",
            note: canUseZeroForSolarScreenings
              ? "ENEA consente 0 in assenza di climatizzazione estiva per le schermature solari."
              : hasDarkeningClosure
                ? "Per le chiusure oscuranti il risparmio riguarda la stagione invernale: non si può dedurre 0 dalla sola assenza di climatizzazione estiva."
                : "Calcolare o verificare il risparmio in base al tipo di schermatura e all'impianto pertinente.",
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
  const inferredBirthNation = /^[A-Z]{2}$/i.test(form.richiedente.provincia_nascita.trim())
    ? "Italia"
    : "";
  const inferredResidenceNation = /^[A-Z]{2}$/i.test(form.residenza.provincia.trim())
    && /^\d{5}$/.test(form.residenza.cap.trim())
    ? "Italia"
    : "";
  const worksAddress = form.residenza.stesso_indirizzo_lavori
    ? {
        comune: form.residenza.comune,
        provincia: form.residenza.provincia,
        indirizzo: form.residenza.indirizzo,
        numero: form.residenza.civico,
        cap: form.residenza.cap,
      }
    : form.appartamento_lavori;
  const interventionScope = interventionScopeFromUnitCount(form.edificio.numero_appartamenti);
  const interventionType = interventionTypeFromProduct(form.prodotto.tipo);
  const centralizedPlant = centralizedPlantFromType(form.impianto.tipo);
  const finishDate = source.dataFineLavori ?? analysis?.lastInvoiceDate ?? null;
  const existingPlantType = plantTypeFromForm(form.impianto.tipo);
  const existingPlantTerminal = plantTerminalFromForm(form.impianto.terminali);
  const existingEnergyCarrier = energyCarrierFromForm(form.impianto.combustibile);

  const detectedItems = analysis?.items ?? [];
  const declaredItems = prodotto?.items ?? [];
  const proposedScreeningCount = Math.max(detectedItems.length, declaredItems.length);
  const countOverride = options?.overrides?.["schermature.numero"];
  const validatedCountOverride = countOverride
    ? validateOperatorOverride("schermature.numero", countOverride)
    : null;
  const screeningCount = validatedCountOverride?.valid
    ? Number(validatedCountOverride.value)
    : proposedScreeningCount;
  const screeningFields = Array.from({ length: screeningCount }).flatMap((_, index) => {
    const item = detectedItems[index];
    const declared = prodotto?.items[index];
    const rules = screeningRules(declared?.tipo ?? "", item?.description ?? "", item?.gTot);
    const darkeningClosure = DARKENING_CLOSURE_TYPES.has(rules.type);
    return [
      mappedField(
        `schermature.${index}.tipo`,
        `Elemento ${index + 1} · tipo schermatura`,
        rules.type,
        {
          source: "Regola controllata",
          note: "Tenda da sole → Tenda o veneziana; tapparelle, zanzariere e pergole → Altra schermatura solare.",
        },
      ),
      mappedField(
        `schermature.${index}.installazione`,
        `Elemento ${index + 1} · installazione`,
        rules.installation,
        {
          source: "Regola controllata",
          note: "Le schermature gestite dal flusso operativo sono installate esternamente.",
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
        {
          required: darkeningClosure,
          editable: true,
          note: darkeningClosure
            ? "Prestazione tecnica della chiusura oscurante: inserire la Rsupp soltanto dopo verifica documentale o dell'operatore."
            : "Campo opzionale: compilare solo dopo verifica documentale o dell'operatore; non viene dedotto automaticamente.",
        },
      ),
      mappedField(
        `schermature.${index}.esposizione`,
        `Elemento ${index + 1} · esposizione`,
        declared?.direzione ? SCHERMATURA_DIREZIONE_LABELS[declared.direzione] : "",
      ),
      mappedField(
        `schermature.${index}.modalita_calcolo`,
        `Elemento ${index + 1} · modalità di calcolo`,
        rules.calculation,
        {
          source: rules.gTotFromDocument ? "Fattura" : "Regola controllata",
          status: rules.calculation ? "ready" : "missing",
          note: darkeningClosure
            ? "Per una chiusura oscurante selezionare la modalità soltanto dopo aver verificato come è stata determinata la Rsupp."
            : "Regola operativa fissa: Dichiarato dal fornitore.",
        },
      ),
      mappedField(
        `schermature.${index}.gtot`,
        `Elemento ${index + 1} · gTot`,
        darkeningClosure ? "" : formatNumber(rules.gTot, 2),
        {
          source: rules.gTotFromDocument ? "Fattura" : "Regola controllata",
          required: !darkeningClosure,
          editable: !darkeningClosure,
          status: "ready",
          note: darkeningClosure
            ? "Il gTot è la prestazione delle schermature solari; per questa chiusura oscurante il laboratorio richiede invece la Rsupp verificata."
            : rules.gTotFromDocument
              ? "Requisito automatico verificato: gTot ≤ 0,35."
              : `Valore sostitutivo operativo: ${formatNumber(rules.gTot, 2)} in assenza di un valore specificato.`,
        },
      ),
      mappedField(
        `schermature.${index}.materiale`,
        `Elemento ${index + 1} · materiale`,
        rules.material,
        {
          source: "Regola controllata",
          note: rules.material
            ? "Ricavato dalla tipologia e dalla descrizione della fattura."
            : "Per tapparelle e avvolgibili occorre distinguere PVC da alluminio nella fattura.",
        },
      ),
      mappedField(
        `schermature.${index}.regolazione`,
        `Elemento ${index + 1} · meccanismo di regolazione`,
        rules.regulation,
        {
          source: "Regola controllata",
          note: "Pergole e pergotende automatiche; zanzariere manuali; negli altri casi conta la presenza del motore.",
        },
      ),
    ];
  });

  const rawSections: EneaLabSection[] = [
    section("beneficiario", "1. Beneficiario", "Anagrafica e titolo del richiedente", [
      mappedField("beneficiario.nome", "Nome", form.richiedente.nome),
      mappedField("beneficiario.cognome", "Cognome", form.richiedente.cognome),
      mappedField("beneficiario.cf", "Codice fiscale", form.richiedente.cf),
      mappedField("beneficiario.data_nascita", "Data di nascita", formatDate(form.richiedente.data_nascita)),
      mappedField("beneficiario.sesso", "Sesso", inferredSex, {
        source: "Regola controllata",
        status: inferredSex ? "ready" : "missing",
        note: inferredSex
          ? "Ricavato dal giorno di nascita codificato nel codice fiscale italiano."
          : "Non ricavabile con sicurezza dal codice fiscale disponibile.",
      }),
      mappedField("beneficiario.nazione_nascita", "Nazione di nascita", inferredBirthNation, {
        source: "Regola controllata",
        status: inferredBirthNation ? "review" : "missing",
        note: inferredBirthNation
          ? "Proposta Italia perché il modulo contiene una provincia italiana; confermare prima della compilazione."
          : "Il modulo cliente non raccoglie la nazione di nascita.",
      }),
      mappedField("beneficiario.comune_nascita", "Comune di nascita", form.richiedente.comune_nascita),
      mappedField("beneficiario.provincia_nascita", "Provincia di nascita", form.richiedente.provincia_nascita),
      mappedField("beneficiario.nazione_residenza", "Nazione di residenza", inferredResidenceNation, {
        source: "Regola controllata",
        status: inferredResidenceNation ? "review" : "missing",
        note: inferredResidenceNation
          ? "Proposta Italia perché provincia e CAP hanno formato italiano; confermare prima della compilazione."
          : "Il modulo cliente non raccoglie la nazione di residenza.",
      }),
      mappedField("beneficiario.comune_residenza", "Comune di residenza", form.residenza.comune),
      mappedField("beneficiario.indirizzo_residenza", "Indirizzo di residenza", form.residenza.indirizzo),
      mappedField("beneficiario.civico_residenza", "Civico di residenza", form.residenza.civico),
      mappedField("beneficiario.cap_residenza", "CAP di residenza", form.residenza.cap),
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
      mappedField("immobile.scala", "Scala", "", { required: false }),
      mappedField("immobile.interno", "Interno", "", { required: false }),
      mappedField("immobile.codice_comune", "Codice nazionale del Comune", "", {
        note: "Recuperare il codice catastale del Comune da una fonte ufficiale.",
      }),
      mappedField("immobile.foglio", "Foglio", form.catastali.foglio),
      mappedField("immobile.mappale", "Particella / mappale", form.catastali.mappale),
      mappedField("immobile.sezione", "Sezione catastale", "", { required: false }),
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
        "immobile.destinazione_particolare",
        "Destinazione d'uso particolare",
        inferredParticularDestination(form.edificio.tipologia),
        {
          source: "Regola controllata",
          status: inferredParticularDestination(form.edificio.tipologia) ? "review" : "missing",
          note: inferredParticularDestination(form.edificio.tipologia)
            ? "Proposta residenziale dalla tipologia dichiarata; confermare prima della compilazione."
            : "La categoria industriale o commerciale non permette di distinguere con sicurezza la destinazione DPR 412.",
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
      mappedField("immobile.gradi_giorno", "Gradi giorno", "Automatici dal Comune ENEA", {
        source: "Regola controllata",
        required: false,
        editable: false,
        note: "Il portale li carica automaticamente dopo la selezione del Comune dall'elenco ENEA.",
      }),
      mappedField("immobile.fascia_solare", "Fascia solare", "", {
        note: "Verificare il valore proposto dal portale ENEA.",
      }),
    ]),
    section("intervento", "3. Intervento", "Unità interessate e date dei lavori", [
      mappedField(
        "intervento.ambito",
        "Intervento su",
        interventionScope,
        {
          source: "Regola controllata",
          status: interventionScope ? "ready" : "missing",
          note: interventionScope
            ? "Determinato dal numero di appartamenti dichiarato nel modulo."
            : "Serve sapere se l'edificio è composto da una o più unità immobiliari.",
        },
      ),
      mappedField("intervento.unita_totali", "Unità immobiliari totali", form.edificio.numero_appartamenti, {
        required: false,
        note: "Dato di appoggio per determinare il tipo di edificio; non viene scritto nel campo ENEA delle unità oggetto.",
      }),
      mappedField("intervento.unita_oggetto", "Unità oggetto della detrazione", "1", {
        source: "Regola controllata",
        editable: false,
        note: "Regola operativa PraticaRapida: per le pratiche gestite il valore è sempre 1.",
      }),
      mappedField("intervento.accorpamenti", "Accorpamenti di unità immobiliari", "No", {
        source: "Regola controllata",
        editable: false,
        note: "Regola operativa PraticaRapida: la risposta è sempre No.",
      }),
      mappedField("intervento.data_inizio", "Data inizio lavori", formatDate(analysis?.firstInvoiceDate), {
        source: "Fattura",
        status: analysis?.firstInvoiceDate ? "ready" : "missing",
        note: analysis?.firstInvoiceDate
          ? "Ricavata dalla prima data della prima fattura riconosciuta."
          : "La prima data fattura non è stata riconosciuta.",
      }),
      mappedField("intervento.data_fine", "Data fine lavori", formatDate(finishDate), {
        source: source.dataFineLavori ? "Pratica CRM" : "Fattura",
        note: source.dataFineLavori
          ? "Data indicata dal rivenditore."
          : finishDate
            ? "Data del rivenditore assente: usata l'ultima data fattura riconosciuta."
            : "Se il rivenditore non l'ha indicata, usare l'ultima fattura; il certificato di fine lavori sarà gestito dopo l'acquisizione dei facsimili.",
      }),
      mappedField("intervento.tipo", "Tipo di intervento", interventionType, {
        source: "Pratica CRM",
        editable: false,
        note: "Derivato dal form scelto dal rivenditore.",
      }),
      mappedField("intervento.impianto_centralizzato", "Impianto centralizzato", centralizedPlant, {
        source: "Modulo cliente",
        required: false,
        editable: false,
        note: centralizedPlant
          ? "Derivato dal tipo di impianto esistente dichiarato nel modulo."
          : "Lasciato vuoto quando il modulo non permette di determinarlo.",
      }),
      mappedField("intervento.zona_urbanistica", "Zona urbanistica", "", {
        source: "Regola controllata",
        required: false,
        editable: false,
        note: "Non viene compilata per i tipi d'intervento gestiti; il campo resta vuoto sul portale.",
      }),
    ]),
    section("impianto", "4. Impianto esistente", "Caratteristiche dell'impianto prima dei lavori", [
      mappedField("impianto.tipo", "Tipo impianto", existingPlantType, {
        source: "Modulo cliente",
        editable: false,
        note: "Tradotto automaticamente nella corrispondente opzione ENEA.",
      }),
      mappedField("impianto.terminali", "Terminali", existingPlantTerminal, {
        source: "Regola controllata",
        editable: form.impianto.terminali === "split",
        note: form.impianto.terminali === "split"
          ? "Lo split del CRM non viene tradotto automaticamente in un terminale ENEA: selezionare una voce specifica solo dopo verifica."
          : "Caloriferi e riscaldamento a pavimento vengono tradotti nelle corrispondenti voci ENEA.",
      }),
      mappedField("impianto.distribuzione", "Tipo di distribuzione", ENEA_PLANT_DISTRIBUTION, {
        source: "Regola controllata",
        editable: true,
        note: "Campo ENEA facoltativo: la regola generica non viene compilata nel workflow ufficiale. Correggere solo dopo verifica documentale o dell'operatore.",
      }),
      mappedField("impianto.regolazione", "Tipo di regolazione", ENEA_PLANT_REGULATION, {
        source: "Regola controllata",
        editable: true,
        note: "Campo ENEA facoltativo: la regola generica non viene compilata nel workflow ufficiale. Correggere solo dopo verifica documentale o dell'operatore.",
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
      mappedField("impianto.combustibile", "Vettore energetico", existingEnergyCarrier, {
        source: "Modulo cliente",
        editable: false,
        note: "Biomassa e altri vettori non presenti nel modulo non vengono dedotti automaticamente.",
      }),
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
          status: validatedCountOverride?.valid
            ? "ready"
            : detectedItems.length === declaredItems.length && detectedItems.length > 0
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
        "",
        {
          source: "Calcolo ENEA",
          status: "missing",
          note: "Calcolare o verificare il risparmio in base al tipo di schermatura e all'impianto pertinente.",
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

  const sections = recalculateScreeningEnergySaving(
    recalculateScreeningSummary(
      recalculateScreeningSurfaces(
        applyKnownFieldValidation(applyOperatorState(rawSections, options)),
      ),
    ),
    form.impianto.aria_condizionata,
  );
  const summary: Record<EneaLabFieldStatus, number> = { ready: 0, review: 0, missing: 0 };
  for (const currentSection of sections) {
    for (const currentField of currentSection.fields) {
      if (currentField.required) summary[currentField.status] += 1;
    }
  }

  return { source, sections, summary };
}