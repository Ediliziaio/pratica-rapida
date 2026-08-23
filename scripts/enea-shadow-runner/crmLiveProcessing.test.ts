import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";
import type { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprCrmLiveProcessing } from "./crmLiveProcessing";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function setup(options: { image?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "apr-crm-live-"));
  const rows = [1, 2].map((index) => ({ id: uuid(index), cliente_nome: index === 1 ? "Mario" : "Lucia", cliente_cognome: index === 1 ? "Rossi" : "Bianchi",
    updated_at: `2026-08-17T10:0${index}:00.000Z`, form_compilato_at: "2026-08-17T10:00:00.000Z", current_stage_id: uuid(900 + index),
    pipeline_stages: { stage_type: "pronte_da_fare" }, prodotto_installato: "Schermature solari", fatture_urls: options.image && index === 1 ? [`${uuid(index)}/fattura/originale.png`] : [], documenti_aggiuntivi_urls: [],
    dati_form: { richiedente: { nome: index === 1 ? "Mario" : "Lucia", cognome: index === 1 ? "Rossi" : "Bianchi" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] } } }));
  const readOnlyGet = vi.fn(async (_pathname: string, params: URLSearchParams) => {
    const id = params.get("id")?.replace("eq.", "");
    const result = id ? rows.filter((row) => row.id === id) : rows.map(({ prodotto_installato: _p, fatture_urls: _f, documenti_aggiuntivi_urls: _d, dati_form: _df, ...row }) => row);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const storageGet = vi.fn(async () => new Response(options.image ? Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fixture")]) : "", { status: options.image ? 200 : 404, headers: { "Content-Type": options.image ? "image/png" : "text/plain" } }));
  const auth = { snapshot: () => ({ status: "authenticated" }), readOnlyGet, readOnlyStorageGet: storageGet } as unknown as PersistentAprCrmAuth;
  const workflow = new PersistentAprCrmIntegrationWorkflow(root);
  const incoming = new PersistentAprCrmIncomingReadOnly(root, auth as unknown as AprCrmReadOnlyTransport, workflow);
  const live = new PersistentAprCrmLiveProcessing(root, incoming, auth, async () => ({ text: options.image ? "PraticaRapida" : "testo locale sufficiente ".repeat(4), extractionMode: "native_text", pageCount: 1 }));
  return { root, rows, readOnlyGet, storageGet, workflow, incoming, live };
}

describe("PersistentAprCrmLiveProcessing", () => {
  it("porta due eventi reali fino al preflight locale senza azioni CRM o ENEA", async () => {
    const { incoming, live, readOnlyGet } = setup();
    const now = new Date("2026-08-17T11:00:00.000Z");
    await incoming.pollAndDispatch(now);
    for (let index = 0; index < 12 && !["completed", "operator_required"].includes(live.snapshot(now).status); index += 1) {
      await live.tick(new Date(now.getTime() + (index + 1) * 1000));
    }
    const snapshot = live.snapshot(now);
    expect(snapshot.status).toBe("operator_required");
    expect(snapshot.progress).toMatchObject({ total: 2, dossiersAcquired: 2, dossierBlocks: 0, preflightBlocked: 2 });
    expect(snapshot).toMatchObject({ externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false });
    expect(readOnlyGet.mock.calls.filter(([, params]) => params.has("id"))).toHaveLength(2);
    expect(snapshot.cases).toHaveLength(2);
  });

  it("riprende dopo riavvio e non ripete dossier già acquisiti", async () => {
    const { root, incoming, live, readOnlyGet } = setup();
    const now = new Date("2026-08-17T12:00:00.000Z");
    await incoming.pollAndDispatch(now);
    await live.tick(new Date("2026-08-17T12:00:01.000Z"));
    expect(live.snapshot(now).progress.dossiersAcquired).toBe(1);
    const restarted = new PersistentAprCrmLiveProcessing(root, incoming, live.auth, async () => ({ text: "testo locale sufficiente ".repeat(4), extractionMode: "native_text", pageCount: 1 }));
    for (let index = 0; index < 12 && !["completed", "operator_required"].includes(restarted.snapshot(now).status); index += 1) await restarted.tick(new Date(now.getTime() + (index + 2) * 1000));
    expect(restarted.snapshot(now).progress.dossiersAcquired).toBe(2);
    expect(readOnlyGet.mock.calls.filter(([, params]) => params.has("id"))).toHaveLength(2);
    expect(restarted.snapshot(now).cases).toHaveLength(2);
  });

  it("termina in intervento operatore se tutti i dossier vengono bloccati a monte", async () => {
    const { incoming, live, readOnlyGet } = setup();
    const now = new Date("2026-08-17T13:00:00.000Z");
    await incoming.pollAndDispatch(now);
    readOnlyGet.mockImplementation(async (_pathname: string, params: URLSearchParams) => new Response(JSON.stringify(params.has("id") ? [] : []), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    for (let index = 0; index < 8 && live.snapshot(now).status !== "operator_required"; index += 1) {
      await live.tick(new Date(now.getTime() + (index + 1) * 1000));
    }
    const snapshot = live.snapshot(now);
    expect(snapshot).toMatchObject({ status: "operator_required", phase: "completed", progress: { total: 2, dossiersAcquired: 0, dossierBlocks: 2 } });
    expect(snapshot.reason).toContain("nessun caso e' stato perso");
    expect(snapshot.cases).toHaveLength(0);
  });

  it("acquisisce e analizza un PNG originario una sola volta prima del preflight", async () => {
    const { incoming, live, storageGet } = setup({ image: true });
    const now = new Date("2026-08-17T14:00:00.000Z");
    await incoming.pollAndDispatch(now);
    for (let index = 0; index < 20 && !["completed", "operator_required"].includes(live.snapshot(now).status); index += 1) {
      await live.tick(new Date(now.getTime() + (index + 1) * 1000));
    }
    const snapshot = live.snapshot(now);
    expect(snapshot).toMatchObject({ status: "operator_required", progress: { total: 2, documentsDownloaded: 1, documentBlocks: 0, documentsAnalyzed: 1, analysisBlocks: 0, nonFiscalImagesExcluded: 1, preflightBlocked: 2 } });
    expect(storageGet).toHaveBeenCalledTimes(1);
    expect(live.analysis.snapshot(now).items[0]).toMatchObject({ state: "analyzed", extractionMode: "native_text", nonFiscalImageExcluded: true, invoiceResult: null });
    expect(live.documents.snapshot(now).items[0].localPath).toMatch(/\.png$/);
    await live.tick(new Date("2026-08-17T14:01:00.000Z"));
    expect(storageGet).toHaveBeenCalledTimes(1);
  });
});
