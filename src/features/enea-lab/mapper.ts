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
import { birthNationFromProvince, deterministicProtectedWindowSurface, residenceNationFromProvince, resolveBeneficiaryFiscalCode, resolveForeignBirthCountryFromFiscalCode } from "@/features/enea-shadow-crm/operationalRules";
import { calculateScreeningEnergySavings } from "@/features/enea-shadow-crm/energySavingsPolicy";
import { USER_AUTHORIZED_RULE_IDS } from "@/features/enea-shadow-crm/operationalRegistry";
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
    | "appliedRuleIds"
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
    appliedRuleIds: options?.appliedRuleIds,
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

function formatSurface(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 4,
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

function roundSurface(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
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
        const surface = roundSurface((Number(size[1]) * Number(size[2])) / 1_000_000);
        return {
          ...field,
          value: `${formatSurface(surface)} m²`,
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
    const rows = surfaceFields.map((field, index) => ({
      rowId: field.id,
      surfaceM2: surfaces[index] ?? 0,
      reconciled: field.status === "ready",
      provenance: {
        sourceId: `${field.source}:${field.id}`,
        kind: field.source === "Inserimento operatore" ? "operator_verified" as const : "verified_source" as const,
      },
    }));
    const savings = calculateScreeningEnergySavings(rows);
    if (savings.status !== "ready") return currentSection;
    const total = savings.audit.totalSurfaceM2;
    return {
      ...currentSection,
      fields: currentSection.fields.map((field) => {
        if (field.id === "schermature.superficie_totale") return {
            ...field,
            value: `${formatSurface(total)} m²`,
            source: "Calcolo ENEA",
            status: "ready",
            note: "Ricalcolata dalle superfici dei singoli elementi verificati.",
          };
        if (field.id === "schermature.risparmio_energia") return {
          ...field,
          value: `${formatNumber(savings.audit.resultKwhYear, 2)} kWh/anno`,
          source: "Regola controllata" as const,
          status: "ready" as const,
          note: `${savings.audit.policyVersion}: ${savings.audit.formula}; righe ${savings.audit.rows.map((row) => `${row.rowId}=${formatNumber(row.surfaceM2)} m² [${row.sourceId}]`).join(", ")}; totale ${formatNumber(total)} m²; risultato ${formatNumber(savings.audit.resultKwhYear, 2)} kWh/anno; arrotondamento ${savings.audit.rounding.mode}.`,
        };
        return field;
      }),
    };
  });
}

export function mapSchermaturaPractice(
  source: EneaLabSourcePractice,
  analysis?: EneaLabDocumentAnalysis,
  options?: EneaLabMapOptions,
): EneaLabMappedPractice {
  const form = source.form;
  const fiscalCodeResolution = resolveBeneficiaryFiscalCode({
    formFiscalCode: form.richiedente.cf,
    originalDocumentFiscalCode: options?.documentFiscalCode,
    documentCoherentWithIdentity: options?.documentFiscalCodeCoherentWithIdentity,
  });
  const fiscalCodeFromDocument = fiscalCodeResolution.source === "original_document";
  const resolvedFiscalCode = fiscalCodeResolution.value ?? "";
  const prodotto = form.prodotto.tipo === "schermature" ? form.prodotto : null;
  const convention = getGeneratorTestConvention(source.id);
  const includeTestConventions = options?.includeTestConventions ?? true;
  const acceptTestConventionsForDraft = options?.acceptTestConventionsForDraft ?? false;
  const inferredSex = sexFromItalianFiscalCode(resolvedFiscalCode);
  const birthProvinceNation = birthNationFromProvince(display(form.richiedente.provincia_nascita)).value ?? "";
  const normalizedBirthPlace = display(form.richiedente.comune_nascita)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("it");
  const birthPlaceExplicitlyForeign = /^(?:estero|stato estero|nato(?:\/a)? all['’]?estero)$/.test(normalizedBirthPlace);
  const fiscalCodeBirthPlaceIsForeign = resolvedFiscalCode.trim().toUpperCase().slice(11, 12) === "Z";
  const verifiedForeignBirthCountry = resolveForeignBirthCountryFromFiscalCode(resolvedFiscalCode);
  const combinedForeignBirthParts = display(form.richiedente.comune_nascita).split(",").map((part) => part.trim()).filter(Boolean);
  const explicitForeignBirthCountry = fiscalCodeBirthPlaceIsForeign && combinedForeignBirthParts.length >= 2
    ? combinedForeignBirthParts.at(-1) ?? ""
    : "";
  const birthNationConflict = !verifiedForeignBirthCountry && birthProvinceNation === "Italia"
    && (birthPlaceExplicitlyForeign || fiscalCodeBirthPlaceIsForeign);
  const inferredBirthNation = verifiedForeignBirthCountry?.country || explicitForeignBirthCountry || (birthNationConflict ? "" : birthProvinceNation);
  // Alcuni form esportano il luogo estero come "Citta, Nazione". ENEA
  // mantiene la Nazione in un select separato e valida nel campo luogo la sola
  // citta: conserva il testo completo nella fonte, ma non duplicare il paese
  // nel valore destinato al controllo del portale quando coincide esattamente
  // con quello verificato dal codice fiscale.
  const mappedBirthPlace = (() => {
    const original = display(form.richiedente.comune_nascita);
    if (!inferredBirthNation) return original;
    const parts = original.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return original;
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
    return normalize(parts.at(-1) ?? "") === normalize(inferredBirthNation)
      ? parts.slice(0, -1).join(", ")
      : original;
  })();
  const inferredResidenceNation = residenceNationFromProvince(display(form.residenza.provincia)).value ?? "";
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
    const resolvedGTot = options?.resolvedScreeningGTot?.[index];
    const resolvedMaterial = options?.resolvedScreeningMaterial?.[index];
    const resolvedRegulation = options?.resolvedScreeningRegulation?.[index];
    const resolvedExposure = options?.resolvedScreeningExposure?.[index];
    const resolvedProtectedWindow = options?.resolvedProtectedWindowSurface?.[index];
    const effectiveGTot = resolvedGTot?.value ?? rules.gTot;
    const effectiveGTotFromDocument = resolvedGTot?.source === "invoice_explicit" || (!resolvedGTot && rules.gTotFromDocument);
    const supplementaryRuleId = rules.type === ENEA_SCREENING_TYPE.rollerShutter
      ? USER_AUTHORIZED_RULE_IDS.avvolgibileScreening
      : USER_AUTHORIZED_RULE_IDS.persianaScreening;
    return [
      mappedField(
        `schermature.${index}.tipo`,
        `Elemento ${index + 1} · tipo schermatura`,
        rules.type,
        {
          source: "Regola controllata",
          note: "Persiana → Persiana; avvolgibile/tapparella → Persiane avvolgibili; tenda da sole → Tenda o veneziana; zanzariere e pergole → Altra schermatura solare.",
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
        item ? `${formatSurface(item.surfaceM2)} m²` : "",
        {
          source: "Calcolo ENEA",
          note: item ? undefined : "Inserire la superficie calcolata dalle misure verificate.",
        },
      ),
      mappedField(
        `schermature.${index}.superficie_finestrata`,
        `Elemento ${index + 1} · superficie finestrata protetta`,
        `${(resolvedProtectedWindow?.value ?? deterministicProtectedWindowSurface(source.id, `screening-${index + 1}`)?.value)?.toFixed(1).replace(".", ",")} m²`,
        {
          source: resolvedProtectedWindow?.source === "derived_product_surface" ? "Calcolo ENEA" : "Regola controllata",
          status: resolvedProtectedWindow?.source === "derived_product_surface" ? "ready" : acceptTestConventionsForDraft ? "ready" : "review",
          testOnly: resolvedProtectedWindow?.source === "derived_product_surface" ? false : acceptTestConventionsForDraft,
          appliedRuleIds: resolvedProtectedWindow ? [resolvedProtectedWindow.ruleId] : ["core-mapping-complete"],
          note: resolvedProtectedWindow?.note ?? "Assunzione operativa deterministica protected-window-v1 da pratica+riga; una superficie verificata da fonte originaria prevale.",
        },
      ),
      mappedField(
        `schermature.${index}.rsupp`,
        `Elemento ${index + 1} · resistenza termica supplementare`,
        rules.supplementaryThermalResistance === null ? "" : formatNumber(rules.supplementaryThermalResistance, 2),
        {
          source: rules.supplementaryThermalResistance === null ? "Portale ENEA" : "Regola controllata",
          status: rules.supplementaryThermalResistance === null ? "review" : "ready",
          required: rules.supplementaryThermalResistance !== null,
          editable: rules.supplementaryThermalResistance !== null,
          appliedRuleIds: rules.supplementaryThermalResistance === null ? undefined : [supplementaryRuleId],
          note: rules.supplementaryThermalResistance === null ? "Calcolata automaticamente da ENEA; APR non la compila per gli altri prodotti." : "Persiana o avvolgibile: valore fisso autorizzato 0,17.",
        },
      ),
      mappedField(
        `schermature.${index}.esposizione`,
        `Elemento ${index + 1} · esposizione`,
        resolvedExposure ? SCHERMATURA_DIREZIONE_LABELS[resolvedExposure.value] : declared?.direzione ? SCHERMATURA_DIREZIONE_LABELS[declared.direzione] : "Sud",
        resolvedExposure ? {
          source: resolvedExposure.source === "paper_form_explicit" ? "Modulo cliente" : "Regola controllata",
          appliedRuleIds: [resolvedExposure.ruleId],
          note: resolvedExposure.source === "paper_form_explicit" ? "Orientamento esplicito del modulo cartaceo Linea Sole Potito." : "Fallback Linea Sole Potito: orientamento Sud in assenza di compilazione esplicita.",
        } : declared?.direzione ? undefined : {
          source: "Regola controllata",
          note: "Esposizione assente nelle fonti originarie: fallback operativo SUD; una fonte esplicita per riga prevale.",
        },
      ),
      mappedField(
        `schermature.${index}.modalita_calcolo`,
        `Elemento ${index + 1} · modalità di calcolo`,
        rules.calculation,
        {
          source: effectiveGTotFromDocument ? "Fattura" : "Regola controllata",
          status: rules.calculation ? "ready" : "missing",
          note: "Regola operativa fissa: Dichiarato dal fornitore.",
        },
      ),
      mappedField(
        `schermature.${index}.gtot`,
        `Elemento ${index + 1} · gTot`,
        formatNumber(effectiveGTot, 2),
        {
          source: effectiveGTotFromDocument ? "Fattura" : "Regola controllata",
          status: "ready",
          appliedRuleIds: resolvedGTot ? [resolvedGTot.ruleId] : undefined,
          note: effectiveGTotFromDocument
            ? "Requisito automatico verificato: gTot ≤ 0,35."
            : `Fallback autorizzato: ${formatNumber(effectiveGTot, 2)} in assenza di un valore esplicito nella fonte originaria.`,
        },
      ),
      mappedField(
        `schermature.${index}.materiale`,
        `Elemento ${index + 1} · materiale`,
        resolvedMaterial?.value ?? rules.material,
        {
          source: "Regola controllata",
          appliedRuleIds: resolvedMaterial ? [resolvedMaterial.ruleId] : undefined,
          note: resolvedMaterial?.value || rules.material
            ? "Ricavato dalla tipologia e dalla descrizione della fattura."
            : "Materiale non determinabile dalle regole prodotto e dalla fattura.",
        },
      ),
      mappedField(
        `schermature.${index}.regolazione`,
        `Elemento ${index + 1} · meccanismo di regolazione`,
        resolvedRegulation?.value ?? rules.regulation,
        {
          source: "Regola controllata",
          status: rules.regulationConflict && !resolvedRegulation ? "missing" : resolvedRegulation?.value || rules.regulation ? "ready" : "missing",
          appliedRuleIds: resolvedRegulation ? [resolvedRegulation.ruleId] : undefined,
          note: rules.regulationConflict && !resolvedRegulation
            ? "Conflitto tra descrizione manuale e fonte specifica: richiesto intervento operatore."
            : "Arganello o molla indicano manuale; una fonte specifica verificata contraria prevale con segnalazione del conflitto.",
        },
      ),
    ];
  });

  const rawSections: EneaLabSection[] = [
    section("beneficiario", "1. Beneficiario", "Anagrafica e titolo del richiedente", [
      mappedField("beneficiario.nome", "Nome", form.richiedente.nome),
      mappedField("beneficiario.cognome", "Cognome", form.richiedente.cognome),
      mappedField("beneficiario.cf", "Codice fiscale", resolvedFiscalCode, fiscalCodeFromDocument ? {
        source: "Fattura",
        note: "Il CF del modulo è formalmente invalido; prevale il CF valido del documento originario, con audit.",
      } : undefined),
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
        status: inferredBirthNation ? "ready" : "missing",
        appliedRuleIds: birthNationConflict || verifiedForeignBirthCountry || explicitForeignBirthCountry
          ? [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, ...(verifiedForeignBirthCountry ? [USER_AUTHORIZED_RULE_IDS.foreignBirthAnprRegistry] : []), "core-mapping-complete"]
          : ["core-mapping-complete"],
        note: birthNationConflict
          ? "Conflitto anagrafico: il luogo o il codice fiscale indicano nascita all'estero, mentre la provincia del modulo è italiana. Non impostare Italia; richiedere la nazione estera all'operatore prima di ENEA."
          : verifiedForeignBirthCountry
          ? `${verifiedForeignBirthCountry.country} determinata dal codice catastale ${verifiedForeignBirthCountry.placeCode} del CF, verificato nel registro ${verifiedForeignBirthCountry.sourceAuthority} (${verifiedForeignBirthCountry.sourceId}); il dato provinciale incompatibile del modulo non prevale.`
          : explicitForeignBirthCountry
          ? `${explicitForeignBirthCountry} riportata esplicitamente nel campo luogo di nascita del modulo cliente; il portale la gestisce nel campo Nazione separato.`
          : inferredBirthNation
          ? "Italia determinata dalla provincia italiana esplicita nel modulo cliente."
          : "La provincia del modulo non consente di determinare la nazione.",
      }),
      mappedField("beneficiario.comune_nascita", "Comune di nascita", mappedBirthPlace, mappedBirthPlace !== display(form.richiedente.comune_nascita) ? {
        source: "Modulo cliente",
        note: `Fonte originaria: ${display(form.richiedente.comune_nascita)}. Nel campo ENEA e mantenuto il solo luogo; la nazione verificata e compilata separatamente.`,
        appliedRuleIds: ["user-2026-08-16-fiscal-code-identity-cross-check", "core-mapping-complete"],
      } : undefined),
      mappedField("beneficiario.provincia_nascita", "Provincia di nascita", form.richiedente.provincia_nascita, {
        required: false,
        note: "Dato di supporto per nazione/comune; il portale deriva la provincia dal Comune di nascita.",
      }),
      mappedField("beneficiario.nazione_residenza", "Nazione di residenza", inferredResidenceNation, {
        source: "Regola controllata",
        status: inferredResidenceNation ? "ready" : "missing",
        appliedRuleIds: ["core-mapping-complete"],
        note: inferredResidenceNation
          ? "Italia determinata dalla provincia italiana esplicita nel modulo cliente."
          : "La provincia del modulo non consente di determinare la nazione.",
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
      mappedField("immobile.provincia", "Provincia lavori", worksAddress.provincia, {
        required: false,
        note: "Dato di supporto; il portale deriva la provincia selezionando il Comune.",
      }),
      mappedField("immobile.indirizzo", "Indirizzo lavori", worksAddress.indirizzo),
      mappedField("immobile.civico", "Civico lavori", worksAddress.numero),
      mappedField("immobile.cap", "CAP lavori", worksAddress.cap),
      mappedField("immobile.scala", "Scala", "", { required: false }),
      mappedField("immobile.interno", "Interno", "", { required: false }),
      mappedField("immobile.codice_comune", "Codice nazionale del Comune", "", {
        source: "Portale ENEA",
        required: false,
        editable: false,
        note: "Auto-compilato da ENEA: il CRM ombra non lo ricava, memorizza o richiede.",
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
          status: form.edificio.tipologia ? "ready" : "missing",
          appliedRuleIds: ["core-mapping-complete"],
          note: "Traduzione deterministica della tipologia residenziale dichiarata nel modulo cliente.",
        },
      ),
      mappedField(
        "immobile.destinazione_particolare",
        "Destinazione d'uso particolare",
        inferredParticularDestination(form.edificio.tipologia),
        {
          source: "Regola controllata",
          status: inferredParticularDestination(form.edificio.tipologia) ? "ready" : "missing",
          appliedRuleIds: ["core-mapping-complete"],
          note: inferredParticularDestination(form.edificio.tipologia)
            ? "Traduzione deterministica della tipologia residenziale dichiarata nel modulo cliente."
            : "La categoria industriale o commerciale non permette di distinguere con sicurezza la destinazione DPR 412.",
        },
      ),
      mappedField(
        "immobile.tipologia",
        "Tipologia edilizia",
        form.edificio.tipologia ? TIPOLOGIA_LABELS[form.edificio.tipologia] : "",
      ),
      mappedField("immobile.zona_climatica", "Zona climatica", "", {
        source: "Portale ENEA",
        required: false,
        editable: false,
        note: "Derivata dal Comune nel portale ENEA; il CRM ombra non la richiede.",
      }),
      mappedField("immobile.gradi_giorno", "Gradi giorno", "Automatici dal Comune ENEA", {
        source: "Regola controllata",
        required: false,
        editable: false,
        note: "Il portale li carica automaticamente dopo la selezione del Comune dall'elenco ENEA.",
      }),
      mappedField("immobile.fascia_solare", "Fascia solare", "", {
        source: "Portale ENEA",
        required: false,
        editable: false,
        note: "Determinata dal portale ENEA; il CRM ombra non la richiede.",
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
        editable: false,
        note: form.impianto.terminali === "split"
          ? "Per impianto elettrico con split viene selezionato Altro, secondo la regola operativa PraticaRapida."
          : "Caloriferi e riscaldamento a pavimento vengono tradotti nelle corrispondenti voci ENEA.",
      }),
      mappedField("impianto.distribuzione", "Tipo di distribuzione", ENEA_PLANT_DISTRIBUTION, {
        source: "Regola controllata",
        editable: false,
        note: "Regola operativa PraticaRapida: selezionare sempre la voce C.",
      }),
      mappedField("impianto.regolazione", "Tipo di regolazione", ENEA_PLANT_REGULATION, {
        source: "Regola controllata",
        editable: false,
        note: "Regola operativa PraticaRapida: selezionare sempre Ad ambiente o zona.",
      }),
      mappedField("impianto.generatore", "Tipo generatore", form.impianto.tipo_caldaia ? CALDAIA_LABELS[form.impianto.tipo_caldaia] : ""),
      mappedField("impianto.numero_generatori", "Numero generatori", form.impianto.tipo_caldaia ? "1" : "", {
        source: "Regola controllata",
        status: form.impianto.tipo_caldaia ? (acceptTestConventionsForDraft ? "ready" : "review") : "missing",
        testOnly: acceptTestConventionsForDraft,
        appliedRuleIds: ["core-mapping-complete"],
      }),
      mappedField(
        "impianto.rendimento",
        "Rendimento al 100%",
        includeTestConventions ? `${formatNumber(convention.usefulEfficiencyPercent)}%` : "",
        {
          source: includeTestConventions ? "Convenzione di prova" : "Calcolo ENEA",
          status: includeTestConventions && acceptTestConventionsForDraft ? "ready" : "missing",
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
          status: includeTestConventions && acceptTestConventionsForDraft ? "ready" : "missing",
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
        !options?.financialReconciliationVerified || options.reconciledEligibleExpense === undefined
          ? ""
          : formatCurrency(options.reconciledEligibleExpense),
        {
          source: "Calcolo ENEA",
          status: options?.financialReconciliationVerified ? "ready" : "missing",
          note: options?.financialReconciliationVerified
            ? "Totale ammesso solo dopo riconciliazione finanziaria tripla documentata."
            : "Bloccato: estrazione, riconciliazione contabile e verifica righe intervento devono coincidere.",
        },
      ),
      mappedField(
        "schermature.risparmio_energia",
        "Risparmio energia primaria non rinnovabile",
        "",
        {
          source: "Calcolo ENEA",
          status: "missing",
          note: "Calcolato localmente solo dopo la riconciliazione completa delle righe: superficie totale × 16,8 kWh/anno per m² (policy screening-energy-savings-v1).",
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
        required: false,
        note: "Download e analisi avvengono in sola lettura.",
      }),
      mappedField("documenti.bonifico", "Bonifico parlante", form.documenti.bonifico_url ? "Presente" : "", {
        status: form.documenti.bonifico_url ? "review" : "missing",
        required: false,
      }),
      mappedField("documenti.tecnici", "Scheda tecnica / attestazione gTot", source.documentiCount ? `${source.documentiCount} file da controllare` : "", {
        source: "Pratica CRM",
        status: source.documentiCount ? "review" : "missing",
        required: false,
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
    recalculateScreeningSurfaces(
      applyKnownFieldValidation(applyOperatorState(rawSections, options)),
    ),
  );
  const summary: Record<EneaLabFieldStatus, number> = { ready: 0, review: 0, missing: 0 };
  for (const currentSection of sections) {
    for (const currentField of currentSection.fields) {
      if (currentField.required) summary[currentField.status] += 1;
    }
  }

  return { source, sections, summary };
}
