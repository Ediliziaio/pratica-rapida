import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const sourceReplay = process.env.APR_RESIDUAL_REPLAY ?? "fresh-original-replay-v3-candidate.json";
const targetName = process.env.APR_RESIDUAL_TARGET ?? "residual-review-questions.json";
const replay = JSON.parse(readFileSync(path.join(directory, sourceReplay), "utf8"));

const details = {
  "infissi_dimensions_and_cardinality_missing:technical_dimensions": {
    missingDocumentType: "abaco o documento tecnico con larghezza, altezza e quantità dei serramenti",
    question: (name) => `Per ${name}, quali sono larghezza, altezza e quantità di ogni serramento secondo il documento tecnico originale?`,
    onboardingGap: "Richiedere all'origine un abaco strutturato con larghezza, altezza, quantità e identificativo univoco per ogni serramento.",
  },
  "infissi_dimensions_and_cardinality_missing:technical_rows": {
    missingDocumentType: "abaco o fattura con righe tecniche associabili univocamente ai serramenti",
    question: (name) => `Per ${name}, quale riga del documento tecnico corrisponde a ciascun serramento e quante unità fisiche sono presenti?`,
    onboardingGap: "Richiedere righe prodotto numerate e una corrispondenza esplicita fra riga, quantità e misure.",
  },
  "infissi_automatic_source_conflict:technical_dimensions": {
    missingDocumentType: null,
    question: (name) => `Per ${name}, quali misure sono corrette tra le fonti documentali discordanti, indicando documento e riga autorevoli?`,
    onboardingGap: "Richiedere una sola tavola misure definitiva, datata e identificata come fonte autorevole.",
  },
  "infissi_technical_document_practice_binding_unverified:technical_dimensions": {
    missingDocumentType: "documento tecnico collegato univocamente a cliente, ordine/commessa e prodotti fatturati",
    question: (name) => `Per ${name}, quale documento collega esplicitamente il cliente, l'ordine o commessa e gli stessi prodotti tecnici alle fatture della pratica?`,
    onboardingGap: "Richiedere che ogni documento tecnico riporti cliente/cantiere, riferimento ordine o commessa e identificativi o misure dei prodotti riconciliabili con le fatture.",
  },
  "tax_code_missing_or_invalid:beneficiary.taxCode": {
    missingDocumentType: "documento fiscale o ufficiale leggibile con codice fiscale",
    question: (name) => `Qual è il codice fiscale corretto di ${name}, come riportato su un documento fiscale o ufficiale leggibile?`,
    onboardingGap: "Rendere obbligatorio un documento ufficiale leggibile e validare formalmente il codice fiscale in acquisizione.",
  },
  "co_beneficiary_invoice_identity_unresolved:beneficiary.coBeneficiary": {
    missingDocumentType: "documento fiscale o ufficiale che identifichi univocamente l'eventuale secondo beneficiario",
    question: (name) => `Per ${name}, esiste un secondo beneficiario della detrazione? Se sì, indica nome, cognome e codice fiscale come risultano dal documento ufficiale.`,
    onboardingGap: "Chiedere esplicitamente se esiste un secondo beneficiario e, in caso positivo, acquisirne documento ufficiale e codice fiscale.",
  },
  "infissi_financial_triple_reconciliation_required:invoice_total": {
    missingDocumentType: "insieme completo di fatture e pagamenti riconciliabili",
    question: (name) => `Per ${name}, qual è il totale lordo corretto delle fatture ammissibili e quali documenti compongono esattamente tale totale?`,
    onboardingGap: "Richiedere tutte le fatture, inclusi acconti e saldi, e collegarle ai relativi pagamenti.",
  },
  "invoice_schedule_amount_missing:economic_sources.schedule.amount": {
    missingDocumentType: "fattura o scadenzario con importo della rata leggibile",
    question: (name) => `Per ${name}, qual è l'importo esatto di ciascuna scadenza o rata riportata nei documenti originali?`,
    onboardingGap: "Richiedere uno scadenzario completo con importo, data e riferimento fattura per ogni rata.",
  },
  "bank_transfer_invoice_cross_check_failed:economic_sources.bankTransfers": {
    missingDocumentType: "contabile di bonifico collegabile univocamente alla fattura",
    question: (name) => `Per ${name}, quale bonifico si riferisce a quale fattura e qual è l'importo corretto da riconciliare?`,
    onboardingGap: "Richiedere causale, CRO/TRN e riferimento fattura leggibili per ogni bonifico.",
  },
  "bank_transfer_principal_exceeds_invoices:economic_sources.bankTransfers": {
    missingDocumentType: null,
    question: (name) => `Per ${name}, confermi che gli importi principali dei bonifici non superano il totale delle fatture dopo aver escluso valori duplicati o accessori?`,
    onboardingGap: "Acquisire separatamente capitale, commissioni e riferimenti fattura dei bonifici.",
  },
  "gross_triple_reconciliation_failed:economic_sources.total": {
    missingDocumentType: null,
    question: (name) => `Per ${name}, confermi il totale lordo delle fatture e il totale effettivamente pagato, indicando l'eventuale differenza?`,
    onboardingGap: "Richiedere un riepilogo economico strutturato e verificabile contro fatture e pagamenti.",
  },
  "invoice_929a8665:economic_sources": {
    missingDocumentType: "fattura con totale economico leggibile oppure prova che il documento è uno storno non economico",
    question: (name) => `Per ${name}, il documento fiscale segnalato è una fattura economica con un totale da conteggiare oppure uno storno/non economico a zero?`,
    onboardingGap: "Classificare esplicitamente in acquisizione fatture economiche, note/storni e documenti a totale zero.",
  },
  "invoice_332a5af9:economic_sources": {
    missingDocumentType: "fattura originale con numero, data, imponibile, IVA e totale leggibili",
    question: (name) => `Per ${name}, inserisci la fattura originale completa a cui si riferisce il documento economico non riconciliato, con numero, data e totale leggibili.`,
    onboardingGap: "Richiedere la fattura originale completa e impedire allegati economici privi della relativa identità fiscale.",
  },
  "original_invoice_missing_or_unavailable:economic_sources": {
    missingDocumentType: "fattura originale completa",
    question: (name) => `Per ${name}, inserisci la fattura originale completa; il fascicolo contiene soltanto una fonte derivata o non disponibile.`,
    onboardingGap: "Rendere obbligatorio il caricamento della fattura originale, non di soli riepiloghi o riferimenti indiretti.",
  },
  "original_invoice_missing_or_unavailable:economic_sources.invoice": {
    missingDocumentType: "fattura originale completa",
    question: (name) => `Per ${name}, inserisci la fattura originale completa con numero, data e totale leggibili.`,
    onboardingGap: "Rendere obbligatorio il caricamento della fattura originale completa e leggibile.",
  },
  "bundled_professional_expense_unitemized:economic_sources.eligibleTechnicalExpense": {
    missingDocumentType: "documento che separi la spesa professionale dal totale della fornitura",
    question: (name) => `Per ${name}, qual è l'importo esatto della spesa professionale ammissibile e in quale riga del documento è separato dal resto della fornitura?`,
    onboardingGap: "Richiedere l'indicazione separata delle spese professionali e della relativa ammissibilità.",
  },
  "completion_date_missing:dates.completion": {
    missingDocumentType: "verbale o dichiarazione datata di fine lavori/installazione",
    question: (name) => `Per ${name}, qual è la data esatta di fine lavori e quale documento originale la attesta?`,
    onboardingGap: "Rendere obbligatorio un verbale o una dichiarazione esplicita e datata di fine lavori.",
  },
  "completion_date_portal_year_mismatch:dates.completion": {
    missingDocumentType: "documento che confermi la data di fine lavori nell'anno ammesso dal portale",
    question: (name) => `Per ${name}, confermi la data esatta di fine lavori e l'anno corretto da usare sul portale, indicando il documento che lo prova?`,
    onboardingGap: "Validare in acquisizione l'anno della fine lavori rispetto all'anno fiscale e al portale di destinazione.",
  },
  "completion_over_90_days_operator_required:dates.completion": {
    missingDocumentType: "documento datato che consenta di verificare la decorrenza dei 90 giorni",
    question: (name) => `Per ${name}, confermi la data di fine lavori e autorizzi la gestione del caso oltre 90 giorni sulla base del documento datato?`,
    onboardingGap: "Calcolare e segnalare già in onboarding la scadenza dei 90 giorni dalla fine lavori documentata.",
  },
  "infissi_shading_closures_form_answer_missing_or_ambiguous:shading_closures": {
    missingDocumentType: "modulo cliente con risposta univoca sulla presenza di chiusure oscuranti",
    question: (name) => `Per ${name}, l'intervento comprende chiusure oscuranti? Rispondi sì o no sulla base del modulo o del documento tecnico.`,
    onboardingGap: "Rendere obbligatoria una risposta sì/no separata sulla presenza di chiusure oscuranti.",
  },
  "customer_form_missing:customer_form": {
    missingDocumentType: "modulo cliente firmato",
    question: (name) => `Per ${name}, è disponibile il modulo cliente firmato? Se sì, in quale allegato si trova?`,
    onboardingGap: "Rendere obbligatorio e tipizzato il caricamento del modulo cliente firmato.",
  },
  "product_cardinality_form_invoice_mismatch:screenings.quantity": {
    missingDocumentType: null,
    question: (name) => `Per ${name}, qual è il numero corretto di schermature fisiche e quale fonte documentale lo prova?`,
    onboardingGap: "Richiedere quantità fisiche per riga e una corrispondenza esplicita tra modulo, fattura e abaco.",
  },
  "screening_primary_measurements_missing:screenings.dimensions": {
    missingDocumentType: "abaco o documento tecnico con misure delle schermature",
    question: (name) => `Per ${name}, quali sono larghezza e altezza di ciascuna schermatura secondo il documento tecnico originale?`,
    onboardingGap: "Rendere obbligatorie le misure primarie strutturate per ogni schermatura.",
  },
  "screenings_missing:screenings": {
    missingDocumentType: "documento tecnico o fattura con l'elenco delle schermature installate",
    question: (name) => `Per ${name}, quali schermature sono state installate e in quale documento originale sono elencate?`,
    onboardingGap: "Richiedere un elenco strutturato delle schermature con tipologia, quantità e riferimento al documento originale.",
  },
  "persiana_measurement_ambiguous_1:screenings.1.dimensions": {
    missingDocumentType: null,
    question: (name) => `Per ${name}, quali sono le misure corrette della prima persiana e quale documento deve prevalere?`,
    onboardingGap: "Richiedere un identificativo stabile e misure univoche per ogni persiana.",
  },
};

const cases = replay.changedCases.filter((entry) => entry.freshOutcome !== "READY_LOCAL").map((entry) => {
  // Le domande devono descrivere soltanto i blocker correnti. Usare i blocker
  // rimossi produrrebbe richieste obsolete proprio dopo una correzione riuscita.
  const reviewKeys = entry.freshBlockerKeys;
  const selected = reviewKeys.map((key) => ({ key, ...(details[key] ?? {}) }));
  const specialInternalCandidate = entry.customerKey === "prova-rivenditore-1-30-04";
  return {
    practiceId: entry.practiceId,
    customerKey: entry.customerKey,
    displayName: entry.displayName,
    classification: specialInternalCandidate
      ? "PENDING_EXCLUSION_DECISION"
      : "PENDING_ORIGINAL_DOCUMENT_REVIEW",
    exactCause: `La rilettura locale fresca dai documenti originali ha cambiato l'insieme dei blocker rispetto allo snapshot operativo persistito: aggiunti [${entry.addedBlockers.join(", ") || "nessuno"}], rimossi [${entry.removedBlockers.join(", ") || "nessuno"}]. L'esito complessivo resta OPERATOR_REQUIRED_LOCAL; senza verifica documentale manuale e senza replay operativo questo delta non è classificato come errore APR.`,
    addedBlockers: entry.addedBlockers,
    removedBlockers: entry.removedBlockers,
    missingDocumentType: [...new Set(selected.map((item) => item.missingDocumentType).filter(Boolean))].join("; ") || null,
    operatorQuestion: specialInternalCandidate
      ? "La pratica «prova rivenditore 1 30/04» è un test interno da aggiungere alle esclusioni permanenti?"
      : selected.map((item) => item.question?.(entry.displayName)).filter(Boolean).join(" "),
    onboardingGap: selected.map((item) => item.onboardingGap).filter(Boolean).join(" ") || null,
  };
});

const artifact = {
  schemaVersion: "apr-reliability-residual-review-v1",
  generatedAt: new Date().toISOString(),
  safety: { localOnly: true, eneaAccessed: false, crmMutated: false, verdictsAttributed: false },
  sourceReplay,
  count: cases.length,
  cases,
};
writeFileSync(path.join(directory, targetName), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ count: cases.length, target: path.join(directory, targetName) }, null, 2)}\n`);
