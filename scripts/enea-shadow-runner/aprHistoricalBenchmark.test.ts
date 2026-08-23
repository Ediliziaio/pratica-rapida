import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCompletedEneaText } from "../../src/features/enea-lab/completedEneaAudit";
import { runAprHistoricalBenchmark } from "./aprHistoricalBenchmark";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-historical-benchmark-"));
  mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
  writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({
    status: "completed",
    items: [
      { customerKey: "mario-rossi", displayName: "Mario Rossi", practiceId: "12345678-1234-1234-1234-123456789abc", draftId: "414439", state: "saved" },
      { customerKey: "caso-bloccato", displayName: "Caso Bloccato", practiceId: "22345678-1234-1234-1234-123456789abc", draftId: null, state: "operator_intervention" },
    ],
  }));
  return root;
}

const historicalText = `
  CPID ABC-123 Data chiusura 17/08/2026
  Proprietario o detentore dell'edificio o avente diritto Nome: Mario Cognome: Rossi Codice fiscale: RSSMRA80A01H501U Sesso: M Data di nascita: 01/01/1980 Comune di nascita: Roma Residenza:
  Scheda intervento SS. Schermature solari
  1 Altra schermatura solare Esterna 10 2 0.08 Sud Dichiarato dal fornitore 0.33 Misto Manuale
  Spese congrue sostenute [€] 1000
  `;

describe("APR benchmark storico post-bozza", () => {
  it("estrae e confronta le righe Infissi 1:1 senza valorizzare campi portale esclusi", async () => {
    const root = fixture();
    const infissiText = `
      CPID INF-123 Data chiusura 17/08/2026
      Proprietario o detentore dell'edificio o avente diritto Nome: Mario Cognome: Rossi Codice fiscale: RSSMRA80A01H501U Sesso: M Data di nascita: 01/01/1980 Comune di nascita: Roma Residenza:
      IN. Serramenti e infissi # Tipologia di telaio esistente prima dell'intervento
      1 Legno Singolo 5 1.1 PVC Doppio 1.3 Verso esterno No
      2 Legno Singolo 5 2.2 PVC Doppio 1.2 Verso esterno Sì
      Spese congrue sostenute [ € ] 3000
    `;
    const parsed = parseCompletedEneaText(infissiText);
    expect(parsed).toMatchObject({ infissiCount: 2, fields: { "infissi.numero": "2", "infissi.0.superficie": "1.1", "infissi.1.chiusura_oscurante": "Sì", "infissi.spesa": "3000" } });
    const result = await runAprHistoricalBenchmark(root, {
      readOnlyGet: async () => new Response(JSON.stringify([{ id: "12345678-1234-1234-1234-123456789abc", pratica_enea_conclusa_urls: ["12345678-1234-1234-1234-123456789abc/infissi.pdf"] }]), { status: 200 }),
      readOnlyStorageGet: async () => new Response("%PDF-finto", { status: 200 }),
      extractText: async () => infissiText,
      buildDraftExecutionPackage: vi.fn() as never,
      buildComparisonFields: () => [
        { id: "beneficiario.nome", value: "Mario", source: "APR Infissi" },
        { id: "infissi.numero", value: 2, source: "APR Infissi" },
        { id: "infissi.0.superficie", value: 1.1, source: "APR Infissi" },
        { id: "infissi.0.trasmittanza_nuovo", value: 1.3, source: "APR Infissi" },
        { id: "infissi.1.chiusura_oscurante", value: "Sì", source: "APR Infissi" },
        { id: "infissi.spesa", value: 3000, source: "APR Infissi" },
      ],
    });
    expect(result.report.summary).toMatchObject({ compared: 1, differences: 0 });
    expect(result.report.cases[0]).toMatchObject({ status: "compared", comparedFields: 6 });
  });

  it("limita il benchmark ai soli customer key richiesti", async () => {
    const root = fixture();
    const executionPath = path.join(root, "enea-draft-execution", "checkpoint.json");
    writeFileSync(executionPath, JSON.stringify({
      status: "completed",
      items: [
        { customerKey: "barbara-melis", displayName: "Barbara Melis", practiceId: "12345678-1234-1234-1234-123456789abc", draftId: "424840", state: "saved" },
        { customerKey: "silvio-proia", displayName: "Silvio Proia", practiceId: "abcdefab-cdef-abcd-efab-cdefabcdefab", draftId: "424844", state: "saved" },
      ],
    }));
    const readOnlyGet = vi.fn(async (_pathname: string, search: URLSearchParams) => new Response(JSON.stringify([{ id: search.get("id")!.slice(3), pratica_enea_conclusa_urls: [] }]), { status: 200 }));
    const result = await runAprHistoricalBenchmark(root, {
      readOnlyGet,
      readOnlyStorageGet: async () => new Response(null, { status: 404 }),
      buildDraftExecutionPackage: (() => { throw new Error("not used"); }) as never,
      buildComparisonFields: () => [],
    }, new Date("2026-08-22T20:00:00Z"), ["barbara-melis"]);
    expect(result.report.cases.map((item) => item.customerKey)).toEqual(["barbara-melis"]);
    expect(readOnlyGet).toHaveBeenCalledTimes(1);
  });

  it("confronta soltanto bozze salvate e non propaga valori storici", async () => {
    const root = fixture();
    expect(parseCompletedEneaText(historicalText).screeningCount).toBe(1);
    const readOnlyGet = vi.fn(async () => new Response(JSON.stringify([{ id: "12345678-1234-1234-1234-123456789abc", pratica_enea_conclusa_urls: ["12345678-1234-1234-1234-123456789abc/storico.pdf"] }]), { status: 200 }));
    const readOnlyStorageGet = vi.fn(async () => new Response("%PDF-finto", { status: 200, headers: { "content-type": "application/pdf" } }));
    const result = await runAprHistoricalBenchmark(root, {
      readOnlyGet,
      readOnlyStorageGet,
      extractText: async () => historicalText,
      buildDraftExecutionPackage: () => ({
        payload: { portalFields: [
          { id: "beneficiario.nome", value: "Mario", source: "Modulo cliente", testOnly: false },
          { id: "beneficiario.cognome", value: "Rossi", source: "Modulo cliente", testOnly: false },
          { id: "beneficiario.cf", value: "RSSMRA80A01H501U", source: "Fattura", testOnly: false },
          { id: "schermature.numero", value: "1", source: "Fattura", testOnly: false },
          { id: "schermature.0.superficie_finestrata", value: "2", source: "Convenzione di prova", testOnly: false },
          { id: "intervento.data_fine", value: "2026-08-17", source: "Fattura", testOnly: false },
        ] },
      } as never),
    }, new Date("2026-08-17T18:00:00Z"));

    expect(result.report.cases[0]).toMatchObject({ status: "compared", reason: "Nessuna differenza nei campi confrontabili e non esclusi." });
    expect(result.report).toMatchObject({ status: "completed", externalMutationAllowed: false, historicalValuesMayFeedMapper: false });
    expect(result.report.summary).toMatchObject({ savedDrafts: 1, compared: 1, differences: 0 });
    expect(result.report.cases[0].comparedFields).toBe(4);
    expect(readOnlyGet).toHaveBeenCalledTimes(1);
    expect(readOnlyStorageGet).toHaveBeenCalledTimes(1);
  });

  it("registra PDF assente senza fermare il report", async () => {
    const root = fixture();
    const result = await runAprHistoricalBenchmark(root, {
      readOnlyGet: async () => new Response(JSON.stringify([{ id: "12345678-1234-1234-1234-123456789abc", pratica_enea_conclusa_urls: [] }]), { status: 200 }),
      readOnlyStorageGet: vi.fn(),
      buildDraftExecutionPackage: vi.fn() as never,
    });
    expect(result.report.status).toBe("completed_with_unavailable_benchmarks");
    expect(result.report.cases[0].status).toBe("historical_pdf_unavailable");
  });
});
