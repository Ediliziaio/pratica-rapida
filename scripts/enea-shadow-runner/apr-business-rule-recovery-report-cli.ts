#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const input = path.resolve(process.argv[2] ?? "");
const output = path.resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) throw new Error("Uso: <audit.json> <report.md>");
const report = JSON.parse(readFileSync(input, "utf8")) as {
  generatedAt: string;
  status: string;
  sourceCoverage: { availableFrom: string | null; availableTo: string | null; eligibleSessionFiles: number; uniqueDirectUserMessages: number; limitation: string };
  declaredDecisionCount: number;
  alreadyActiveCount: number;
  newlyActivatedNowCount: number;
  supersededCount: number;
  unresolvedDocumentedDecisionCount: number;
  unrecoverableExplanation: string;
  decisions: Array<{ decisionId: string; statement: string; deterministicAction: string; recoveryStatus: string; finalStatus: string; source: { receivedAt: string; reference: string }; sourceVerification: string; matrixKeys: string[] }>;
};
const escape = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const label = (status: string) => ({ already_active: "già attiva", newly_activated_now: "appena resa attiva ora", superseded: "superata", unresolved_documented: "documentata ma irrisolta" }[status] ?? status);
const lines = [
  "# Recupero completo delle decisioni di business APR — r56",
  "",
  `Generato: ${report.generatedAt}`,
  "",
  `Esito del corpus disponibile: **${report.status}**. Decisioni dichiarate: **${report.declaredDecisionCount}**; già attive: **${report.alreadyActiveCount}**; rese attive ora: **${report.newlyActivatedNowCount}**; superate: **${report.supersededCount}**; documentate ma irrisolte: **${report.unresolvedDocumentedDecisionCount}**.`,
  "",
  "## Copertura e limite verificabile",
  "",
  `Sono state indicizzate ${report.sourceCoverage.uniqueDirectUserMessages} comunicazioni utente uniche in ${report.sourceCoverage.eligibleSessionFiles} sessioni locali/conversazioni recuperate, dal ${report.sourceCoverage.availableFrom ?? "non disponibile"} al ${report.sourceCoverage.availableTo ?? "non disponibile"}.`,
  "",
  report.sourceCoverage.limitation,
  "",
  report.unrecoverableExplanation,
  "",
  "## Elenco completo delle regole documentate nel corpus accessibile",
  "",
  "| # | Decisione | Stato finale | Data fonte | Verifica fonte | Azione deterministica | Matrice |",
  "|---:|---|---|---|---|---|---|",
  ...report.decisions.map((item, index) => `| ${index + 1} | ${escape(item.statement)} | ${label(item.recoveryStatus)} | ${item.source.receivedAt} | ${item.sourceVerification} | ${escape(item.deterministicAction)} | ${escape(item.matrixKeys.join(", ") || "non applicabile: regola superata")} |`),
  "",
  "## Interpretazione corretta",
  "",
  "- `già attiva`: presente nel bundle r55 e ricertificata nel gate r56.",
  "- `appena resa attiva ora`: recuperata o formalizzata nel registro/matrice r56 e inclusa nel bundle installato.",
  "- `superata`: decisione storica conservata per audit ma non riattivata perché sostituita da una regola successiva più sicura.",
  "- Una decisione mai documentata in alcuna fonte non può essere nominata o ricostruita senza inventarla. Per questo non esiste un elenco positivo di regole `mai documentate`; il limite temporale del corpus è dichiarato sopra.",
  "",
];
writeFileSync(output, lines.join("\n"), "utf8");
process.stdout.write(`${JSON.stringify({ status: report.status, output, rows: report.decisions.length }, null, 2)}\n`);
