import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("ops/apr-saved-field-comparison-and-exclusions-2026-09-10");
const inputPath = path.join(root, "saved-non-geometric-field-comparison.json");
const comparison = JSON.parse(readFileSync(inputPath, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizeField = (fieldId) => fieldId.replace(/^infissi\.\d+\./, "infissi.*.");
const text = (value) => typeof value === "string" ? value.trim() : "";
const normalize = (value) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it-IT").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const numeric = (value) => {
  const match = text(value).replace(/\.(?=\d{3}(?:\D|$))/g, "").match(/-?\d+(?:[.,]\d+)?/u);
  const parsed = match ? Number(match[0].replace(",", ".")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const RULES = Object.freeze({
  transmittance13: "user-2026-08-19-infissi-transmittance-1-3-fallback-v1",
  oldWindowMatrix: "user-2026-08-19-infissi-old-window-transmittance-matrix-v1",
  materialGlass: "user-2026-08-19-infissi-pvc-low-e-fallbacks-v1",
});
const OLD_WINDOW_MATRIX = Object.freeze({
  vetro_singolo: Object.freeze({ legno: 5, pvc: 5, metallo_taglio_termico: 5.3, metallo_senza_taglio_termico: 6, misto: 5.2 }),
  vetro_doppio: Object.freeze({ legno: 3, pvc: 3.5, metallo_taglio_termico: 3.5, metallo_senza_taglio_termico: 4.1, misto: 3.2 }),
  vetro_triplo: Object.freeze({ legno: 2.1, pvc: 2.1, metallo_taglio_termico: 2.5, metallo_senza_taglio_termico: 3.4, misto: 2.4 }),
  pannello: Object.freeze({ legno: 2.8, pvc: 2.8, metallo_taglio_termico: 5.3, metallo_senza_taglio_termico: 6, misto: 5.2 }),
});
const materialAliases = new Map([["legno", "legno"], ["pvc", "pvc"], ["metallo_taglio_termico", "metallo_taglio_termico"], ["metallo_senza_taglio_termico", "metallo_senza_taglio_termico"], ["misto", "misto"]]);
const glassAliases = new Map([["singolo", "vetro_singolo"], ["vetro_singolo", "vetro_singolo"], ["doppio", "vetro_doppio"], ["vetro_doppio", "vetro_doppio"], ["triplo", "vetro_triplo"], ["vetro_triplo", "vetro_triplo"], ["pannello", "pannello"]]);

function caseRuleContext(caseItem) {
  const packagePath = caseItem.references?.immutablePackage?.path;
  const dossierPath = caseItem.references?.crmDossier?.path;
  const pkg = packagePath ? readJson(packagePath) : null;
  const dossier = dossierPath ? readJson(dossierPath) : null;
  const product = dossier?.row?.dati_form?.prodotto ?? {};
  const appliedRuleIds = pkg?.infissiPayload?.audit?.appliedRuleIds ?? [];
  const fieldEvidence = pkg?.infissiPayload?.audit?.fieldEvidence ?? [];
  return { packagePath, dossierPath, pkg, product, appliedRuleIds, fieldEvidence };
}

function classify(caseItem, item, context) {
  if (item.fieldId.startsWith("impianto.")) return { category: "atteso", reason: "campo_con_divergenza_metodologica_attesa" };
  if (item.transmittancePolicy === "missing_source_fallback_1_3") {
    return { category: "errore_apr_verificato", reason: "fallback_1_3_applicato_nonostante_uw_esplicito_nel_documento" };
  }
  const rowIndex = Number(item.fieldId.match(/^infissi\.(\d+)\./u)?.[1] ?? "-1");
  const physicalRowId = Number.isInteger(rowIndex) && rowIndex >= 0 ? `${caseItem.practiceId}:infisso:${rowIndex + 1}` : null;
  const evidenceFor = (field) => context.fieldEvidence.find((entry) => entry?.physicalRowId === physicalRowId && entry?.field === field) ?? null;
  if (/^infissi\.\d+\.vetro_nuovo$/u.test(item.fieldId) && context.appliedRuleIds.includes(RULES.materialGlass)) {
    const rawFormGlass = text(context.product.vetro_nuovi);
    const evidence = evidenceFor("glassType");
    const fallbackApplied = evidence?.source === "authorized_fallback_low_emissivity";
    if (!rawFormGlass && fallbackApplied && /bassa_emissione|bassa_emissivita/u.test(normalize(item.aprValue))) {
      return { category: "atteso", reason: "vetro_nuovo_assente_fallback_bassa_emissione", evidence };
    }
    if (rawFormGlass && normalize(rawFormGlass) === normalize(item.aprValue) && evidence?.source === "explicit_original_source") {
      return { category: "atteso", reason: "vetro_nuovo_esplicito_preservato_sopra_fallback", evidence, rawFormGlass };
    }
  }
  if (/^infissi\.\d+\.vetro_vecchio$/u.test(item.fieldId) && context.appliedRuleIds.includes(RULES.oldWindowMatrix)) {
    const rawOldGlass = text(context.product.vetro_vecchi);
    if (rawOldGlass && normalize(rawOldGlass).replace(/^vetro_/u, "") === normalize(item.aprValue).replace(/^vetro_/u, "")) {
      return { category: "atteso", reason: "vetro_vecchio_obbligatorio_preservato_dal_form", rawOldGlass };
    }
  }
  if (/^infissi\.\d+\.trasmittanza_vecchio$/u.test(item.fieldId) && context.appliedRuleIds.includes(RULES.oldWindowMatrix)) {
    const material = materialAliases.get(normalize(context.product.materiale_vecchi));
    const glazing = glassAliases.get(normalize(context.product.vetro_vecchi));
    const expected = material && glazing ? OLD_WINDOW_MATRIX[glazing]?.[material] : undefined;
    const apr = numeric(item.aprValue);
    const evidence = evidenceFor("oldWindowThermalTransmittanceWm2K");
    if (typeof expected === "number" && apr !== null && Math.abs(apr - expected) < 0.005 && /matrix_combination$/u.test(text(evidence?.source))) {
      return { category: "atteso", reason: "trasmittanza_vecchio_derivata_dalla_matrice_su_dati_obbligatori", evidence, matrixInputs: { material, glazing }, expected };
    }
    return { category: "da_valutare", reason: "dato_vecchio_non_risolto_univocamente_per_la_matrice", evidence, rawInputs: { material: context.product.materiale_vecchi ?? null, glazing: context.product.vetro_vecchi ?? null } };
  }
  return { category: "da_valutare", reason: "fuori_dalle_tre_regole_riclassificate" };
}

const occurrences = comparison.cases.flatMap((caseItem) => {
  const context = caseRuleContext(caseItem);
  return caseItem.differences.map((difference) => {
    const classification = classify(caseItem, difference, context);
    return {
      practiceId: caseItem.practiceId,
      displayName: caseItem.displayName,
      fieldId: difference.fieldId,
      normalizedField: normalizeField(difference.fieldId),
      ...classification,
      humanValue: difference.humanValue,
      aprValue: difference.aprValue,
      transmittancePolicy: difference.transmittancePolicy,
      sourcePaths: { immutablePackage: context.packagePath ?? null, crmDossier: context.dossierPath ?? null },
    };
  });
});

const aggregate = (key) => [...occurrences.reduce((map, item) => {
  const name = item[key];
  const current = map.get(name) ?? { field: name, total: 0, atteso: 0, da_valutare: 0, errore_apr_verificato: 0 };
  current.total += 1;
  current[item.category] += 1;
  map.set(name, current);
  return map;
}, new Map()).values()].sort((a, b) => b.total - a.total || a.field.localeCompare(b.field));

const categoryTotals = occurrences.reduce((result, item) => {
  result[item.category] += 1;
  return result;
}, { atteso: 0, da_valutare: 0, errore_apr_verificato: 0 });

const codognatoPdf = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5305-global-controller-eugenio-codognato/crm-original-documents/files/eugenio-codognato/7891895a71d05416bf656ce08513cf853455a3eaa7fd3e2523c77a88ac05d20a.pdf";
const buracchiFpcPdf = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5221-global-controller-vera-buracchi/crm-original-documents/files/vera-buracchi/899a1e0bf7390c7eaf87a24e1329123bb396d437d60933f18b6c685de4e637fa.pdf";
const buracchiLabelsPdf = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5221-global-controller-vera-buracchi/crm-original-documents/files/vera-buracchi/cf2ceadb4398a03f19f09e2dd1ea48690579c3843afc978bcd6a31a9a64d9d19.pdf";

const artifact = {
  version: "apr-saved-non-geometric-field-difference-triage-v2",
  generatedAt: new Date().toISOString(),
  input: { path: inputPath, sha256: sha256(readFileSync(inputPath)) },
  scope: {
    totalDifferences: occurrences.length,
    excludedFromComparison: ["gTot", "dimensioni prodotto", "dimensioni finestra protetta", "risparmio energetico calcolato dal portale"],
    note: "Le geometrie erano escluse a monte; gTot e risparmio energetico non producono scostamenti direttamente confrontabili in questo corpus.",
  },
  categoryTotals,
  requestedRuleReclassification: {
    startingDaValutare: 133,
    movedToExpected: occurrences.filter((item) => item.category === "atteso" && !item.fieldId.startsWith("impianto.")).length,
    remainingDaValutare: categoryTotals.da_valutare,
    ruleIds: Object.values(RULES),
    note: "Il fallback prudenziale 6,0 del vecchio infisso non viene riclassificato come atteso: il dato vecchio e obbligatorio e la matrice vale soltanto quando telaio e vetro sono risolti univocamente.",
  },
  byNormalizedField: aggregate("normalizedField"),
  byExactField: aggregate("fieldId"),
  occurrences,
  verifiedFallbackFinding: {
    fallbackRowsTotal: 20,
    legitimateOrHumanMatchingRows: 8,
    verifiedMissingReadRows: 12,
    verifiedCases: [
      {
        displayName: "EUGENIO CODOGNATO",
        rows: 8,
        sourceValues: [1.28, 1.22, 1.27, 1.20, 1.28, 1.28, 1.23, 1.27],
        aprValue: 1.3,
        sourcePdf: codognatoPdf,
        sourcePdfSha256: sha256(readFileSync(codognatoPdf)),
        exactCause: "La DoP a tabella usa la colonna 9.7 e valori W/m2K senza ripetere Uw/Trasmittanza su ogni riga. Il classificatore richiede invece il valore adiacente a Uw/Ud o alla frase Trasmittanza termica, marca numeric_thermal_performance come assente, conserva il PDF come additional e la source policy lo esclude; il resolver applica quindi il fallback 1,3.",
      },
      {
        displayName: "VERA BURACCHI",
        rows: 4,
        sourceValues: [1.20, 1.17, 1.18, 1.17],
        aprValue: 1.3,
        sourcePdfs: [buracchiFpcPdf, buracchiLabelsPdf],
        sourcePdfSha256s: [sha256(readFileSync(buracchiFpcPdf)), sha256(readFileSync(buracchiLabelsPdf))],
        exactCause: "Le fonti espongono Uw per prodotto, ma il parser automatico seleziona quattro righe dimensionali dalla fattura e non associa le righe dei documenti tecnici. Una seconda fonte con etichette 'Trasm. termica' resta additional perché l'abbreviazione/layout non soddisfa il profilo chiuso. Le righe selezionate restano quindi senza fonte Uw e ricevono 1,3.",
      },
    ],
    nonErrorFallbackCases: [
      { displayName: "ELENA DEPALMA", rows: 5, reason: "Nessun valore Uw/trasmittanza rilevato nelle fonti originarie; il riferimento umano usa anch'esso 1,3." },
      { displayName: "MATTEO CAPITANELLI", rows: 3, reason: "Le prime quattro righe hanno Uw esplicito 1,18/1,19/1,25/1,18; soltanto le tre righe selezionate senza Uw usano 1,3 e coincidono col riferimento umano." },
    ],
  },
};

const normalizedRows = artifact.byNormalizedField.map((item) => `| ${item.field} | ${item.total} | ${item.atteso} | ${item.da_valutare} | ${item.errore_apr_verificato} |`).join("\n");
const exactRows = artifact.byExactField.map((item) => `| ${item.field} | ${item.total} | ${item.atteso} | ${item.da_valutare} | ${item.errore_apr_verificato} |`).join("\n");
const markdown = `# Triage dei 227 scostamenti non geometrici\n\n` +
  `## Esito\n\n- Attesi dopo applicazione delle regole: **${categoryTotals.atteso}**\n- Da valutare sulle fonti originali: **${categoryTotals.da_valutare}**\n- Errori APR verificati di mancata lettura: **${categoryTotals.errore_apr_verificato}**\n- Dei 133 inizialmente da valutare, **${artifact.requestedRuleReclassification.movedToExpected}** sono stati riclassificati come attesi e **${artifact.requestedRuleReclassification.remainingDaValutare}** restano da valutare.\n\n` +
  `Geometrie prodotto/finestra erano escluse dal confronto. Nel corpus dei 227 non risultano scostamenti direttamente confrontabili su gTot o risparmio energetico.\n\n` +
  `## Raggruppamento logico\n\n| Campo | Totale | Atteso | Da valutare | Errore APR |\n|---|---:|---:|---:|---:|\n${normalizedRows}\n\n` +
  `## Identificativi esatti\n\n| Campo | Totale | Atteso | Da valutare | Errore APR |\n|---|---:|---:|---:|---:|\n${exactRows}\n\n` +
  `## Fallback trasmittanza 1,3\n\nDei 20 utilizzi totali, 8 sono coerenti con fonti silenti/riferimento umano (Depalma 5, Capitanelli 3). I 12 scostamenti sono errori APR verificati: Codognato 8 e Buracchi 4. Le cause e gli hash dei PDF originali sono nel JSON affiancato.\n`;

for (const [name, contents] of [
  ["difference-field-triage.json", `${JSON.stringify(artifact, null, 2)}\n`],
  ["difference-field-triage.md", markdown],
]) {
  const target = path.join(root, name);
  writeFileSync(target, contents, { encoding: "utf8", mode: 0o600 });
  writeFileSync(`${target}.sha256`, `${sha256(readFileSync(target))}  ${name}\n`, { encoding: "utf8", mode: 0o600 });
}

process.stdout.write(`${JSON.stringify({ categoryTotals, normalizedFields: artifact.byNormalizedField.length, exactFields: artifact.byExactField.length }, null, 2)}\n`);
