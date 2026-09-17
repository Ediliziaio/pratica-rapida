import crypto from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

type Difference = {
  fieldId: string;
  humanValue: string | null;
  aprValue: string | null;
  transmittancePolicy: string | null;
};
type ComparisonCase = {
  practiceId: string;
  displayName: string;
  supplier: string;
  module: string;
  comparisonSummary: {
    directlyComparable: number;
    matches: number;
    differences: number;
    missingSourceTransmittanceFallback13Rows: number;
    missingSourceFallback13Differences: number;
  };
  differences: Difference[];
};
type Comparison = {
  generatedAt: string;
  safety: Record<string, unknown>;
  eligibility: Record<string, number>;
  aggregate: {
    directlyComparableFields: number;
    matches: number;
    differences: number;
    casesWithDifferences: number;
    missingSourceTransmittanceFallback13Cases: number;
    missingSourceTransmittanceFallback13Rows: number;
    missingSourceFallback13DifferenceRows: number;
    differencesByField: Array<{ fieldId: string; count: number }>;
  };
  cases: ComparisonCase[];
};
type ExclusionAudit = {
  generatedAt: string;
  currentKnownExcludedPractices: { total: number; nonConcordant: number; practices: Array<{ practiceId: string; displayName: string; family: string; tripleVerification: { concordant: boolean } }> };
  overallReportedBatches: { runReportCount: number; uniquePracticesBeforeExclusions: number; excludedUniquePractices: number; workableDenominatorAfterExclusions: number; excludedByFamily: Record<string, number> };
  overallPersistedCohortBatches: { cohortCheckpointCount: number; uniquePracticesBeforeExclusions: number; excludedUniquePractices: number; workableDenominatorAfterExclusions: number; excludedByFamily: Record<string, number> };
  affectedRuns: Array<{ run: string; before: number; excluded: number; after: number; excludedByFamily: Record<string, number> }>;
};

const ROOT = path.resolve("ops/apr-saved-field-comparison-and-exclusions-2026-09-10");
const read = <T>(name: string) => JSON.parse(readFileSync(path.join(ROOT, name), "utf8")) as T;
const sha256 = (value: Uint8Array | string) => crypto.createHash("sha256").update(value).digest("hex");
function atomicWrite(name: string, contents: string) {
  const target = path.join(ROOT, name);
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}
const human = (value: string | null) => value === null ? "∅" : value.replace(/\|/g, "\\|");
const fieldFamily = (fieldId: string) => fieldId.startsWith("impianto.") ? "impianto"
  : fieldId.startsWith("intervento.data_") ? "date"
    : fieldId.startsWith("infissi.") || fieldId.startsWith("schermature.") ? "prodotto_tecnico"
      : fieldId.startsWith("beneficiario.") ? "anagrafica"
        : fieldId.startsWith("immobile.") ? "immobile_catasto"
          : "altro";
const onboardingGap = (differences: Difference[]) => {
  const families = new Set(differences.map((item) => fieldFamily(item.fieldId)));
  if (differences.some((item) => item.transmittancePolicy === "missing_source_fallback_1_3")) return "Richiedere nel form o in una scheda tecnica strutturata la trasmittanza del nuovo infisso per ogni riga fisica, con associazione univoca al prodotto.";
  if (families.has("impianto")) return "Raccogliere in modo strutturato tipo, rendimento e potenza del generatore esistente, indicando la fonte documentale.";
  if (families.has("date")) return "Raccogliere date di inizio e fine lavori con documento datato e tipo di evento esplicito.";
  if (families.has("prodotto_tecnico")) return "Raccogliere attributi tecnici e cardinalità in una tabella strutturata associata univocamente alle righe di fattura/scheda tecnica.";
  if (families.has("anagrafica") || families.has("immobile_catasto")) return "Raccogliere e collegare una fonte ufficiale univoca per anagrafica, indirizzo e dati catastali.";
  return null;
};

const comparison = read<Comparison>("saved-non-geometric-field-comparison.json");
const exclusions = read<ExclusionAudit>("exclusion-denominator-audit.json");
if (exclusions.currentKnownExcludedPractices.nonConcordant !== 0 || exclusions.currentKnownExcludedPractices.practices.some((item) => !item.tripleVerification.concordant)) throw new Error("exclusion_triple_verification_inconsistent");

const reviewItems = comparison.cases.filter((item) => item.differences.length).map((item) => ({
  practiceId: item.practiceId,
  displayName: item.displayName,
  classification: "SAVED_FIELD_DIFFERENCE_REQUIRES_SOURCE_ADJUDICATION",
  exactCause: `${item.differences.length} campi non geometrici della bozza APR differiscono dal PDF ENEA chiuso dall'operatore umano; il confronto da solo non stabilisce quale fonte sia più accurata.`,
  missingDocumentType: null,
  operatorQuestion: `Confermi che per ${item.displayName} debbano prevalere i valori della pratica umana nei campi ${item.differences.map((difference) => difference.fieldId).join(", ")}?`,
  onboardingGap: onboardingGap(item.differences),
  differences: item.differences,
}));
atomicWrite("field-comparison-review-items.json", `${JSON.stringify({ version: "apr-saved-field-comparison-review-items-v1", generatedAt: new Date().toISOString(), items: reviewItems }, null, 2)}\n`);

const runs = exclusions.affectedRuns.map((run) => `| ${run.run} | ${run.before} | ${run.excluded} | ${run.after} | ${run.excludedByFamily["linea-sole-potito"] ?? 0} | ${run.excludedByFamily["erre-emme-rm-legno"] ?? 0} | ${run.excludedByFamily["ideal-sistem"] ?? 0} |`).join("\n");
const cases = comparison.cases.map((item) => {
  if (!item.differences.length) return `### ${item.displayName}\n\nEsito: coincidenza completa sui ${item.comparisonSummary.directlyComparable} campi non geometrici direttamente confrontabili.\n`;
  const rows = item.differences.map((difference) => `| ${difference.fieldId} | ${human(difference.humanValue)} | ${human(difference.aprValue)} | ${difference.transmittancePolicy ?? "—"} |`).join("\n");
  return `### ${item.displayName}\n\n${item.comparisonSummary.matches}/${item.comparisonSummary.directlyComparable} campi coincidenti; ${item.differences.length} scostamenti.\n\n| Campo | Operatore umano | APR | Policy trasmittanza |\n|---|---:|---:|---|\n${rows}\n`;
}).join("\n");
const fallbackCases = comparison.cases.filter((item) => item.comparisonSummary.missingSourceTransmittanceFallback13Rows > 0)
  .map((item) => `- ${item.displayName}: ${item.comparisonSummary.missingSourceTransmittanceFallback13Rows} righe a fallback; ${item.comparisonSummary.missingSourceFallback13Differences} diverse dal riferimento umano.`).join("\n");
const topFields = comparison.aggregate.differencesByField.slice(0, 12).map((item) => `- ${item.fieldId}: ${item.count}`).join("\n");

const report = `# Ideal Sistem, esclusioni e confronto campi delle pratiche SAVED\n\nData: 10 settembre 2026\n\n## Perimetro e sicurezza\n\n- Attività CRM e storage esclusivamente GET/read-only; nessuna scrittura CRM.\n- Nessuna pagina ENEA aperta e nessuna bozza creata, modificata o salvata.\n- Confronto tra pacchetto canonico immutabile effettivamente usato da APR in una pratica SAVED e PDF ENEA storico chiuso dall'operatore.\n- Sono escluse soltanto le misure geometriche dei prodotti; trasmittanze e ogni altro campo tecnico restano inclusi.\n- Il PDF umano è un riferimento di confronto, non prova automaticamente che APR abbia torto: ogni scostamento resta da aggiudicare contro il documento originale pertinente.\n\n## Esclusione permanente Ideal Sistem\n\nIdeal Sistem è ora modellato come esclusione generale a monte, analoga a Linea Sole Potito e Erre Emme/RM Legno. Il match è esatto sulla relazione CRM o sul campo fornitore; nomi simili non vengono esclusi. L'esito metrico è \`excluded_upstream\`: lavorazione manuale, fuori sia dai blocchi sia dal denominatore lavorabile, senza download/analisi degli allegati e senza azione ENEA.\n\nRegola: \`user-2026-09-10-ideal-sistem-manual-exclusion-v1\`.\n\n## Quante pratiche escono dal perimetro\n\nTre fonti concordanti per ciascuna pratica: dossier locale, appartenenza a report/checkpoint di lotto e vista CRM live GET-only.\n\n- Tutte le coorti persistite: **${exclusions.overallPersistedCohortBatches.uniquePracticesBeforeExclusions} → ${exclusions.overallPersistedCohortBatches.workableDenominatorAfterExclusions}**, quindi **${exclusions.overallPersistedCohortBatches.excludedUniquePractices}** pratiche uniche escluse: ${exclusions.overallPersistedCohortBatches.excludedByFamily["linea-sole-potito"]} Potito, ${exclusions.overallPersistedCohortBatches.excludedByFamily["erre-emme-rm-legno"]} RM Legno, ${exclusions.overallPersistedCohortBatches.excludedByFamily["ideal-sistem"]} Ideal Sistem.\n- Universo dei report finali di lotto: **${exclusions.overallReportedBatches.uniquePracticesBeforeExclusions} → ${exclusions.overallReportedBatches.workableDenominatorAfterExclusions}**, quindi **${exclusions.overallReportedBatches.excludedUniquePractices}** escluse: ${exclusions.overallReportedBatches.excludedByFamily["linea-sole-potito"]} Potito, ${exclusions.overallReportedBatches.excludedByFamily["erre-emme-rm-legno"]} RM Legno, ${exclusions.overallReportedBatches.excludedByFamily["ideal-sistem"]} Ideal Sistem.\n- La differenza di tre casi dipende da pratiche presenti in checkpoint di coorte ma senza un report finale top-level: non sono state perse dal conteggio storico complessivo.\n\n### Denominatore per ogni lotto interessato\n\n| Lotto | Prima | Escluse | Dopo | Potito | RM | Ideal |\n|---|---:|---:|---:|---:|---:|---:|\n${runs}\n\n## Confronto campo per campo\n\nPratiche con entrambi i riferimenti disponibili: **${comparison.eligibility.compared}**. Campi direttamente confrontabili: **${comparison.aggregate.directlyComparableFields}**; coincidenti **${comparison.aggregate.matches}**; differenti **${comparison.aggregate.differences}**. Una pratica coincide integralmente; ${comparison.aggregate.casesWithDifferences} hanno almeno uno scostamento.\n\nLe famiglie più frequenti sono:\n\n${topFields}\n\n### Verifica mirata del fallback trasmittanza 1,3\n\nIl rischio indicato è confermato come scostamento osservabile: il fallback per fonte mancante è stato usato su **${comparison.aggregate.missingSourceTransmittanceFallback13Rows} righe di 4 pratiche**. In **${comparison.aggregate.missingSourceFallback13DifferenceRows} righe** il valore 1,3 differisce dalla pratica umana; in 8 coincide.\n\n${fallbackCases}\n\nInoltre Santo Giuga presenta una riga diversa (umano 1,57; APR 1,3) dovuta alla policy distinta di clamp al massimo accettato dal portale, non al fallback per fonte mancante.\n\nLe pagine dei PDF di Codognato e Buracchi sono state anche renderizzate e ispezionate visivamente: mostrano rispettivamente i valori 1,28/1,22/1,27/1,20/1,28/1,28/1,23/1,27 e 1,20/1,20/1,20/1,17. Questo conferma che i dodici scostamenti non sono un artefatto dell'estrazione testuale del PDF.\n\n## Dettaglio nome per nome\n\n${cases}\n## Limiti del verdetto\n\nQuesto audit dimostra quali valori APR sono stati materializzati nel pacchetto SAVED e quali valori compaiono nel PDF umano. Non stabilisce, senza rilettura del documento originario per ciascun campo discordante, se sia un errore APR o un errore/approssimazione dell'operatore. Per questo nessuna delle ${reviewItems.length} pratiche discordanti viene riclassificata come blocco e nessuna regola tecnica sui valori viene modificata in questa attività.\n`;
const reportWithGate = report.replace(
  "\n## Limiti del verdetto",
  "\n## Gate e installazione dell'esclusione\n\n" +
    "- Suite completa locale seriale: **1933/1933** test verdi; suite CDP/socket eseguita nell'ambiente abilitato: **82/82** test verdi; totale **2015/2015**.\n" +
    "- Matrice di governo: **210/210** regole coperte. Audit storico: 161 decisioni dichiarate; unica nuova attivazione `user-2026-09-10-ideal-sistem-manual-exclusion-v1`; restano soltanto i quattro gap storici già autorizzati.\n" +
    "- Gate monotono: **PASS**, artefatto `11a6670bae6ad2f7e945b84e692028ef4b50b554ca551315a50af1dac1e9edfc`.\n" +
    "- Bundle canonico installato: `4c1e381b-ideal-sistem-manual-exclusion-r107-20260910`. Il puntatore `current`, i quattro hash della ricevuta e la presenza della regola nel worker installato concordano.\n" +
    "- Questa attività prova test locali completi e installazione canonica. Non è stato riavviato il worker persistente e non è stato eseguito un replay operativo su ENEA; quindi non viene dichiarata una verifica operativa della nuova esclusione.\n\n" +
    "## Limiti del verdetto",
);
atomicWrite("report.md", reportWithGate);
for (const name of ["report.md", "field-comparison-review-items.json"]) atomicWrite(`${name}.sha256`, `${sha256(readFileSync(path.join(ROOT, name)))}  ${name}\n`);
process.stdout.write(JSON.stringify({ report: path.join(ROOT, "report.md"), reviewItems: reviewItems.length, reportSha256: sha256(readFileSync(path.join(ROOT, "report.md"))) }, null, 2));
