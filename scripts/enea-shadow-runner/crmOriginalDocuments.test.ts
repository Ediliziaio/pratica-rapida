import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentAprCrmOriginalDocuments, type AprCrmDocumentTransport } from "./crmOriginalDocuments";

const directories: string[] = [];
const temporaryDirectory = () => { const directory = mkdtempSync(path.join(os.tmpdir(), "apr-crm-documents-")); directories.push(directory); return directory; };
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005"];

function dossiers(directory: string, invalidLast = false) {
  const dossierDirectory = path.join(directory, "dossiers"); mkdirSync(dossierDirectory, { recursive: true });
  return ids.map((practiceId, index) => {
    const customerKey = `cliente-${index + 1}`; const dossierPath = path.join(dossierDirectory, `${customerKey}.json`);
    writeFileSync(dossierPath, JSON.stringify({ row: { id: practiceId, fatture_urls: [`${practiceId}/fattura/${index + 1}.pdf`], documenti_aggiuntivi_urls: index === 4 && invalidLast ? ["../storico-enea.pdf"] : [] } }));
    return { customerKey, practiceId, dossierPath };
  });
}

afterEach(() => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("acquisizione persistente allegati CRM originari", () => {
  it("scarica un PDF alla volta e riprende dopo riavvio senza duplicare", async () => {
    const get = vi.fn(async (_bucket: "enea-documents", objectPath: string) => new Response(Buffer.from(`%PDF-1.4\n${objectPath}`), { status: 200, headers: { "Content-Type": "application/pdf" } }));
    const transport: AprCrmDocumentTransport = { snapshot: () => ({ status: "authenticated" }), readOnlyStorageGet: get };
    const directory = temporaryDirectory(); const first = new PersistentAprCrmOriginalDocuments(directory, transport);
    first.prepare(dossiers(directory), new Date("2026-08-15T15:00:00Z")); await first.tick(new Date("2026-08-15T15:00:01Z"));
    const restarted = new PersistentAprCrmOriginalDocuments(directory, transport);
    for (let index = 0; index < 8 && restarted.snapshot().status !== "completed"; index += 1) await restarted.tick(new Date(`2026-08-15T15:00:0${index + 2}Z`));
    const snapshot = restarted.snapshot();
    expect(snapshot).toMatchObject({ status: "completed", progress: { total: 5, downloaded: 5, blocked: 0, queued: 0 }, externalActionAllowed: false });
    expect(get).toHaveBeenCalledTimes(5);
    expect(snapshot.items.map((item) => item.requestAttemptCount)).toEqual([1, 1, 1, 1, 1]);
    for (const item of snapshot.items) {
      expect(readFileSync(item.localPath!).subarray(0, 5).toString()).toBe("%PDF-");
      expect(item.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    const replayRevision = snapshot.revision; await restarted.tick();
    expect(restarted.snapshot().revision).toBe(replayRevision); expect(get).toHaveBeenCalledTimes(5);
  });

  it("blocca percorsi e firme di contenuto non coerenti continuando la lista", async () => {
    const get = vi.fn(async (_bucket: "enea-documents", objectPath: string) => new Response(Buffer.from(objectPath.endsWith("3.pdf") ? "not-pdf" : "%PDF-1.4\nok"), { status: 200, headers: { "Content-Type": "application/octet-stream" } }));
    const directory = temporaryDirectory(); const reader = new PersistentAprCrmOriginalDocuments(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyStorageGet: get });
    reader.prepare(dossiers(directory, true));
    for (let index = 0; index < 10 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 6, downloaded: 4, blocked: 2, queued: 0 } });
    expect(reader.snapshot().items.map((item) => item.state)).toContain("blocked_invalid_path");
    expect(reader.snapshot().items.map((item) => item.state)).toContain("blocked_unsupported_content");
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("conserva la coda senza GET quando la sessione non e autenticata", async () => {
    const get = vi.fn(); const directory = temporaryDirectory();
    const reader = new PersistentAprCrmOriginalDocuments(directory, { snapshot: () => ({ status: "login_required" }), readOnlyStorageGet: get });
    reader.prepare(dossiers(directory)); const state = await reader.tick();
    expect(state.status).toBe("waiting_auth"); expect(state.items.every((item) => item.state === "queued")).toBe(true); expect(get).not.toHaveBeenCalled();
  });

  it("acquisisce sia il PNG originario sia il PDF del form con firme e fingerprint distinti", async () => {
    const directory = temporaryDirectory(); const dossierDirectory = path.join(directory, "dossiers"); mkdirSync(dossierDirectory, { recursive: true });
    const practiceId = ids[0]; const dossierPath = path.join(dossierDirectory, "ivan-nalin.json");
    writeFileSync(dossierPath, JSON.stringify({ row: {
      id: practiceId,
      fatture_urls: [`${practiceId}/fattura/copia.png`],
      documenti_aggiuntivi_urls: [],
      dati_form: { fatture: { fattura: `${practiceId}/dynamic/originale.pdf` } },
    } }));
    const get = vi.fn(async (_bucket: "enea-documents", objectPath: string) => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(objectPath)]);
      return new Response(objectPath.endsWith(".png") ? png : Buffer.from(`%PDF-1.4\n${objectPath}`), { status: 200, headers: { "Content-Type": objectPath.endsWith(".png") ? "image/png" : "application/pdf" } });
    });
    const reader = new PersistentAprCrmOriginalDocuments(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyStorageGet: get });
    reader.prepare([{ customerKey: "ivan-nalin", practiceId, dossierPath }]);
    for (let index = 0; index < 4 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 2, downloaded: 2, blocked: 0, queued: 0 } });
    expect(reader.snapshot().items.map((item) => ({ sourcePath: item.sourcePath, state: item.state }))).toEqual([
      { sourcePath: `${practiceId}/fattura/copia.png`, state: "downloaded" },
      { sourcePath: `${practiceId}/dynamic/originale.pdf`, state: "downloaded" },
    ]);
    expect(reader.snapshot().items[0].localPath).toMatch(/\.png$/);
    expect(get).toHaveBeenCalledTimes(2);
    const terminalRevision = reader.snapshot().revision;
    writeFileSync(dossierPath, JSON.stringify({ row: {
      id: practiceId,
      fatture_urls: [`${practiceId}/fattura/copia.png`],
      documenti_aggiuntivi_urls: [],
      dati_form: { fatture: { fattura: [`${practiceId}/dynamic/originale.pdf`, `${practiceId}/dynamic/aggiunta-successiva.pdf`] } },
    } }));
    expect(reader.prepare([{ customerKey: "ivan-nalin", practiceId, dossierPath }]).revision).toBe(terminalRevision);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("riarma una sola volta un'immagine respinta dal vecchio contratto senza dichiarare un GET inesistente", async () => {
    const directory = temporaryDirectory(); const dossierDirectory = path.join(directory, "dossiers"); mkdirSync(dossierDirectory, { recursive: true });
    const practiceId = ids[0]; const dossierPath = path.join(dossierDirectory, "legacy-image.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: practiceId, fatture_urls: [`${practiceId}/fattura/legacy.png`], documenti_aggiuntivi_urls: [] } }));
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("legacy-image")]);
    const get = vi.fn(async () => new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }));
    const reader = new PersistentAprCrmOriginalDocuments(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyStorageGet: get });
    reader.prepare([{ customerKey: "legacy-image", practiceId, dossierPath }]);
    const legacy = JSON.parse(readFileSync(reader.checkpointPath, "utf8"));
    legacy.status = "completed"; legacy.items[0].state = "blocked_response"; legacy.items[0].requestAttemptCount = 1;
    legacy.items[0].reason = "Trasporto GET allegato non disponibile; nessun dato inventato."; legacy.items[0].endedAt = "2026-08-16T00:00:00.000Z";
    legacy.documentFormatRepairsApplied = ["original-images-png-jpeg-v1"];
    writeFileSync(reader.checkpointPath, `${JSON.stringify(legacy)}\n`);

    expect(reader.applyOriginalImageSupport("original-images-png-jpeg-v1").status).toBe("completed");
    const repaired = reader.applyOriginalImageSupport("original-images-storage-contract-v2");
    expect(repaired).toMatchObject({ status: "queued", documentFormatRepairsApplied: ["original-images-png-jpeg-v1", "original-images-storage-contract-v2"], items: [{ state: "queued", requestAttemptCount: 1 }] });
    await reader.tick();
    const completed = reader.snapshot();
    expect(completed).toMatchObject({ status: "completed", progress: { total: 1, downloaded: 1, blocked: 0 }, items: [{ state: "downloaded", requestAttemptCount: 2 }] });
    const revision = completed.revision;
    expect(reader.applyOriginalImageSupport("original-images-storage-contract-v2").revision).toBe(revision);
    await reader.tick();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("aggiunge dopo una correzione identita solo i nuovi allegati senza ripetere i GET conclusi", async () => {
    const directory = temporaryDirectory();
    const initialDossiers = dossiers(directory).slice(0, 2);
    const get = vi.fn(async (_bucket: "enea-documents", objectPath: string) => new Response(Buffer.from(`%PDF-1.4\n${objectPath}`), { status: 200, headers: { "Content-Type": "application/pdf" } }));
    const reader = new PersistentAprCrmOriginalDocuments(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyStorageGet: get });
    reader.prepare(initialDossiers);
    for (let index = 0; index < 4 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ progress: { total: 2, downloaded: 2 } });

    const practiceId = "00000000-0000-4000-8000-000000000099";
    const dossierPath = path.join(directory, "dossiers", "cliente-corretto.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: practiceId, fatture_urls: [`${practiceId}/fattura/corretta.pdf`], documenti_aggiuntivi_urls: [] } }));
    const extended = reader.extendAfterAcquisitionCorrection([...initialDossiers, { customerKey: "cliente-corretto", practiceId, dossierPath }]);
    expect(extended).toMatchObject({ status: "queued", items: [{ state: "downloaded" }, { state: "downloaded" }, { customerKey: "cliente-corretto", state: "queued" }] });
    await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 3, downloaded: 3, queued: 0 } });
    expect(reader.snapshot().items.map((item) => item.requestAttemptCount)).toEqual([1, 1, 1]);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
