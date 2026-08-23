import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentAprCrmAuthenticatedReadOnly, type AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";

const directories: string[] = [];
const temporaryDirectory = () => { const directory = mkdtempSync(path.join(os.tmpdir(), "apr-crm-acquisition-")); directories.push(directory); return directory; };
const candidates = [
  { customerKey: "lorena-brendas", displayName: "Lorena Brendas" },
  { customerKey: "milena-albertoni", displayName: "Milena Albertoni" },
  { customerKey: "danila-serpa", displayName: "Danila Serpa" },
  { customerKey: "milena-fiorini", displayName: "Milena Fiorini" },
  { customerKey: "beatrice-ciotta", displayName: "Beatrice Ciotta" },
];
const fingerprint = "a".repeat(64);
const row = (firstName: string, lastName: string, suffix: string) => ({
  id: `00000000-0000-4000-8000-0000000000${suffix}`,
  cliente_nome: firstName,
  cliente_cognome: lastName,
  brand: "enea",
  fatture_urls: [`00000000-0000-4000-8000-0000000000${suffix}/fattura.pdf`],
  documenti_aggiuntivi_urls: [],
  dati_form: { richiedente: { nome: firstName, cognome: lastName } },
});

afterEach(() => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("acquisizione CRM autenticata e read-only APR", () => {
  it("acquisisce una pratica Archiviate per ID esatto senza ricerca per nome", async () => {
    const practiceId = "00000000-0000-4000-8000-000000000099";
    const archivedCandidates = [
      { customerKey: "mario-rossi", displayName: "Mario Rossi", practiceId, expectedStageType: "archiviate" as const, productModule: "screening" as const },
      { customerKey: "lucia-bianchi", displayName: "Lucia Bianchi", practiceId: "00000000-0000-4000-8000-000000000098", expectedStageType: "archiviate" as const, productModule: "infissi" as const },
    ];
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      expect(params.has("cliente_nome")).toBe(false);
      expect(params.get("pipeline_stages.stage_type")).toBe("eq.archiviate");
      const id = params.get("id")?.replace("eq.", "") ?? "";
      const candidate = archivedCandidates.find((item) => item.practiceId === id)!;
      const [firstName, lastName] = candidate.displayName.split(" ");
      return new Response(JSON.stringify([{ ...row(firstName, lastName, id.endsWith("99") ? "99" : "98"), id, pipeline_stages: { stage_type: "archiviate" } }]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const reader = new PersistentAprCrmAuthenticatedReadOnly(temporaryDirectory(), { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(archivedCandidates, "9".repeat(64));
    await reader.tick(); await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 2, acquired: 2, blocked: 0 } });
    expect(reader.snapshot().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ expectedPracticeId: practiceId, expectedStageType: "archiviate", productModule: "screening", practiceId }),
    ]));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("acquisisce eventi reali per ID esatto, uno alla volta, e riprende senza duplicare", async () => {
    const incoming = [
      { eventId: "crm-ready:event-1", practiceId: "00000000-0000-4000-8000-000000000071", displayName: "Mario Rossi" },
      { eventId: "crm-ready:event-2", practiceId: "00000000-0000-4000-8000-000000000072", displayName: "Lucia Bianchi" },
    ];
    const byId = new Map([
      [incoming[0].practiceId, { ...row("Mario", "Rossi", "71"), pipeline_stages: { stage_type: "pronte_da_fare" } }],
      [incoming[1].practiceId, { ...row("Lucia", "Bianchi", "72"), pipeline_stages: { stage_type: "pronte_da_fare" } }],
    ]);
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      expect(params.has("cliente_nome")).toBe(false);
      expect(params.get("pipeline_stages.stage_type")).toBe("eq.pronte_da_fare");
      const id = params.get("id")?.replace("eq.", "") ?? "";
      return new Response(JSON.stringify(byId.has(id) ? [byId.get(id)] : []), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const transport = { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get } satisfies AprCrmReadOnlyTransport;
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, transport);
    reader.prepareIncoming(incoming, new Date("2026-08-17T10:00:00.000Z"));
    await reader.tick(new Date("2026-08-17T10:00:01.000Z"));
    const restarted = new PersistentAprCrmAuthenticatedReadOnly(directory, transport);
    await restarted.tick(new Date("2026-08-17T10:00:02.000Z"));
    expect(restarted.snapshot()).toMatchObject({ status: "completed", progress: { total: 2, acquired: 2, blocked: 0, queued: 0 } });
    expect(restarted.snapshot().items.map((item) => item.expectedPracticeId)).toEqual(incoming.map((item) => item.practiceId).sort());
    expect(get).toHaveBeenCalledTimes(2);
    const replay = restarted.prepareIncoming([...incoming].reverse());
    expect(replay.revision).toBe(restarted.snapshot().revision);
  });

  it("acquisisce cinque dossier in sequenza e li riprende senza duplicare", async () => {
    const responses = new Map([
      ["Lorena Brendas", [row("Lorena", "Brendas", "01")]],
      ["Milena Albertoni", [row("Milena", "Albertoni", "02")]],
      ["Danila Serpa", [row("Danila", "Serpa", "03")]],
      ["Milena Fiorini", [row("Milena", "Fiorini", "04")]],
      ["Beatrice Ciotta", [row("Beatrice", "Ciotta", "05")]],
    ]);
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const name = `${params.get("cliente_nome")?.replace("ilike.", "")} ${params.get("cliente_cognome")?.replace("ilike.", "")}`;
      return new Response(JSON.stringify(responses.get(name) ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const transport: AprCrmReadOnlyTransport = { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get };
    const directory = temporaryDirectory();
    const first = new PersistentAprCrmAuthenticatedReadOnly(directory, transport);
    first.prepare(candidates, fingerprint, new Date("2026-08-15T15:00:00.000Z"));

    await first.tick(new Date("2026-08-15T15:00:01.000Z"));
    const restarted = new PersistentAprCrmAuthenticatedReadOnly(directory, transport);
    for (let index = 0; index < 8 && restarted.snapshot().status !== "completed"; index += 1) await restarted.tick(new Date(`2026-08-15T15:00:0${index + 2}.000Z`));

    const snapshot = restarted.snapshot();
    expect(snapshot).toMatchObject({ status: "completed", progress: { total: 5, acquired: 5, blocked: 0, queued: 0 }, externalActionAllowed: false });
    expect(get).toHaveBeenCalledTimes(5);
    expect(new Set(snapshot.items.map((item) => item.practiceId)).size).toBe(5);
    for (const item of snapshot.items) {
      expect(item.attemptCount).toBe(1);
      expect(item.dossierPath).toBeTruthy();
      const dossier = readFileSync(item.dossierPath!, "utf8");
      expect(dossier).toContain('"method": "GET"');
      expect(dossier).not.toContain("Authorization");
    }
  });

  it("risolve un nome composto provando partizioni controllate senza ricerca fuzzy", async () => {
    const compoundCandidates = [
      { customerKey: "elena-marcelli-berti", displayName: "Elena Marcelli Berti" },
      ...candidates.slice(1),
    ];
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const first = params.get("cliente_nome")?.replace("ilike.", "") ?? "";
      const last = params.get("cliente_cognome")?.replace("ilike.", "") ?? "";
      if (first === "Elena" && last === "Marcelli Berti") return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      if (first === "Elena Marcelli" && last === "Berti") return new Response(JSON.stringify([row(first, last, "31")]), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify([row(first, last, `7${last.length}`)]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(compoundCandidates, "c".repeat(64));
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();

    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 5, acquired: 5, blocked: 0, queued: 0 } });
    expect(get).toHaveBeenCalledTimes(6);
    const dossierPath = reader.snapshot().items[0].dossierPath!;
    expect(JSON.parse(readFileSync(dossierPath, "utf8")).source).toMatchObject({
      identityPartition: { firstName: "Elena Marcelli", lastName: "Berti" },
      partitionCount: 2,
    });
  });

  it("isola casi assenti o ambigui e conclude il resto della lista", async () => {
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const first = params.get("cliente_nome")?.replace("ilike.", "") ?? "";
      const last = params.get("cliente_cognome")?.replace("ilike.", "") ?? "";
      if (last === "Brendas") return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      if (last === "Albertoni") return new Response(JSON.stringify([row(first, last, "11"), row(first, last, "12")]), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify([row(first, last, `2${last.length}`)]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(candidates, fingerprint);
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();

    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 5, acquired: 3, blocked: 2, queued: 0 } });
    expect(reader.snapshot().items.map((item) => item.state)).toEqual(["blocked_not_found", "blocked_ambiguous", "acquired", "acquired", "acquired"]);
  });

  it("non effettua GET senza sessione autenticata e conserva la coda", async () => {
    const get = vi.fn();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(temporaryDirectory(), { snapshot: () => ({ status: "login_required" }), readOnlyGet: get });
    reader.prepare(candidates, fingerprint);
    const state = await reader.tick();
    expect(state.status).toBe("waiting_auth");
    expect(state.items.every((item) => item.state === "queued")).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("riarma soltanto gli HTTP 400 del contratto corretto e non duplica dossier gia acquisiti", async () => {
    const invalidBody = JSON.stringify({ code: "42703", message: "column data_fine_lavori does not exist" });
    const invalidHash = createHash("sha256").update(invalidBody).digest("hex");
    let repaired = false;
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const first = params.get("cliente_nome")?.replace("ilike.", "") ?? "";
      const last = params.get("cliente_cognome")?.replace("ilike.", "") ?? "";
      if (!repaired && last !== "Brendas") {
        return new Response(invalidBody, { status: 400, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([row(first, last, `3${last.length}`)]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(candidates, fingerprint);
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();

    expect(reader.snapshot()).toMatchObject({ progress: { acquired: 1, blocked: 4, queued: 0 } });
    repaired = true;
    const rearmed = reader.applyTransportRepair("remove-unexposed-column-v2", invalidHash);
    expect(rearmed.repairsApplied).toEqual(["remove-unexposed-column-v2"]);
    expect(rearmed.items.map((item) => item.state)).toEqual(["acquired", "queued", "queued", "queued", "queued"]);
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();

    const completed = reader.snapshot();
    expect(completed).toMatchObject({ status: "completed", progress: { acquired: 5, blocked: 0, queued: 0 } });
    expect(completed.items.map((item) => item.attemptCount)).toEqual([1, 2, 2, 2, 2]);
    expect(completed.repairsApplied).toEqual(["remove-unexposed-column-v2"]);
    expect(reader.applyTransportRepair("remove-unexposed-column-v2", invalidHash).revision).toBe(completed.revision);
    expect(get).toHaveBeenCalledTimes(9);
  });

  it("applica risoluzioni operatore per duplicato eliminato e pipeline Archiviate senza ripetere gli altri dossier", async () => {
    let resolutionsApplied = false;
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const first = params.get("cliente_nome")?.replace("ilike.", "") ?? "";
      const last = params.get("cliente_cognome")?.replace("ilike.", "") ?? "";
      if (!resolutionsApplied && ["Fiorini", "Ciotta"].includes(last)) {
        return new Response(JSON.stringify([row(first, last, "41"), row(first, last, "42")]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const selected = { ...row(first, last, `5${last.length}`), pipeline_stages: { stage_type: last === "Fiorini" ? "archiviate" : "pronte_da_fare" } };
      return new Response(JSON.stringify([selected]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(candidates, fingerprint);
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ progress: { acquired: 3, blocked: 2 } });

    resolutionsApplied = true;
    reader.applyRecordedOperatorResolutions();
    for (let index = 0; index < 6 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();

    const snapshot = reader.snapshot();
    expect(snapshot).toMatchObject({ status: "completed", progress: { acquired: 5, blocked: 0, queued: 0 } });
    expect(snapshot.items.map((item) => item.attemptCount)).toEqual([1, 1, 1, 2, 2]);
    expect(get).toHaveBeenCalledTimes(7);
    const fioriniCall = get.mock.calls.find(([, params]) => params.get("cliente_cognome") === "ilike.Fiorini" && params.has("pipeline_stages.stage_type"));
    expect(fioriniCall?.[1].get("pipeline_stages.stage_type")).toBe("eq.archiviate");
    expect(snapshot.audit.filter((event) => event.type === "operator_resolution")).toHaveLength(2);
    expect(reader.applyRecordedOperatorResolutions().revision).toBe(snapshot.revision);
  });

  it("riarma soltanto un nome non trovato dopo correzione operatore auditata", async () => {
    let corrected = false;
    const get = vi.fn(async (_pathname: string, params: URLSearchParams) => {
      const first = params.get("cliente_nome")?.replace("ilike.", "") ?? "";
      const last = params.get("cliente_cognome")?.replace("ilike.", "") ?? "";
      if (!corrected && last === "Brendas") return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify([row(first, last, `6${last.length}`)]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const directory = temporaryDirectory();
    const reader = new PersistentAprCrmAuthenticatedReadOnly(directory, { snapshot: () => ({ status: "authenticated" }), readOnlyGet: get });
    reader.prepare(candidates, fingerprint);
    for (let index = 0; index < 8 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ progress: { acquired: 4, blocked: 1 } });

    corrected = true;
    const rearmed = reader.correctNotFoundIdentity("lorena-brendas", {
      resolutionId: "user-2026-08-16-lorena-name-correction",
      displayName: "Lorena Corretta",
    });
    expect(rearmed.status).toBe("queued");
    expect(rearmed.items.map((item) => item.state)).toEqual(["queued", "acquired", "acquired", "acquired", "acquired"]);
    expect(rearmed.items[0].identityCorrection).toMatchObject({ originalDisplayName: "Lorena Brendas", correctedDisplayName: "Lorena Corretta" });

    await reader.tick();
    const completed = reader.snapshot();
    expect(completed).toMatchObject({ status: "completed", progress: { acquired: 5, blocked: 0, queued: 0 } });
    expect(completed.items.map((item) => item.attemptCount)).toEqual([2, 1, 1, 1, 1]);
    expect(completed.audit.filter((event) => event.type === "operator_resolution")).toHaveLength(1);
    expect(reader.correctNotFoundIdentity("lorena-brendas", { resolutionId: "user-2026-08-16-lorena-name-correction", displayName: "Lorena Corretta" }).revision).toBe(completed.revision);
  });
});
