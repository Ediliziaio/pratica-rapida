import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const ledger = new PersistentAprOperatorResponseLedger(path.join(runtimeRoot, "state"));
const supersededResponseId = "crm-ombra:492729cfe8ad227916816365d7b14c64f6ed18f71fcecbc3";
const responseId = "crm-ombra-normalized:marco-zambella:screening-products:20260917";

const state = ledger.importResponses([{
  responseId,
  customerKey: "marco-zambella",
  displayName: "Marco Zambella",
  practiceId: "34572044-6e01-465a-ab01-f937d3ec4b87",
  receivedAt: new Date().toISOString(),
  source: "giuliano_crm_ombra",
  question: "Il numero indicato nel form non coincide con quello ricostruito dalla fattura: quanti prodotti sono stati installati?",
  answer: "sia nel form che nella fattura sono presenti due tende",
  payload: {
    kind: "screening_products",
    products: [
      { description: "Tenda a bracci estensibili", quantity: 1, widthMm: 3100, heightMm: 2000 },
      { description: "Tenda a caduta verticale", quantity: 1, widthMm: 1120, heightMm: 1700 },
    ],
  },
  status: "active",
  supersedesResponseId: supersededResponseId,
  appliedRuleIds: [
    "user-2026-09-11-operator-response-runtime-consumption-v1",
    "system-operator-response-ledger-concurrency-v1",
    "system-atomic-checkpoint-resume",
  ],
}]);

process.stdout.write(`${JSON.stringify({
  status: "normalized",
  responseId,
  supersededResponseId,
  revision: state.revision,
  response: state.responses.find((item) => item.responseId === responseId),
}, null, 2)}\n`);
