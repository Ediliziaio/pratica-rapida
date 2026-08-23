import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";
import { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const row = (index: number, first = `Nome${index}`, last = `Cognome${index}`) => ({
  id: uuid(index), cliente_nome: first, cliente_cognome: last,
  updated_at: `2026-08-17T10:${String(index).padStart(2, "0")}:00.000Z`,
  form_compilato_at: "2026-08-17T09:00:00.000Z", current_stage_id: uuid(900 + index),
  pipeline_stages: { stage_type: "pronte_da_fare" },
});

function setup(rows: unknown[], status = "authenticated") {
  const root = mkdtempSync(path.join(tmpdir(), "apr-crm-incoming-"));
  const get = vi.fn(async (_path: string, params: URLSearchParams) => {
    expect(params.get("pipeline_stages.stage_type")).toBe("eq.pronte_da_fare");
    expect(params.get("archived_at")).toBe("is.null");
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  });
  const transport = { readOnlyGet: get, snapshot: () => ({ status }) } satisfies AprCrmReadOnlyTransport;
  const workflow = new PersistentAprCrmIntegrationWorkflow(root);
  const incoming = new PersistentAprCrmIncomingReadOnly(root, transport, workflow);
  return { root, get, workflow, incoming };
}

describe("PersistentAprCrmIncomingReadOnly", () => {
  it("legge soltanto Pronte da fare, persiste e inoltra due pratiche senza duplicarle", async () => {
    const { get, workflow, incoming } = setup([row(1), row(2)]);
    const now = new Date("2026-08-17T11:00:00.000Z");
    const first = await incoming.pollAndDispatch(now);
    expect(first.status).toBe("idle");
    expect(incoming.snapshot(now).progress).toMatchObject({ dispatched: 2, pending: 0 });
    expect(workflow.snapshot(now).progress.total).toBe(2);
    await incoming.pollAndDispatch(new Date("2026-08-17T11:05:00.000Z"));
    expect(get).toHaveBeenCalledTimes(2);
    expect(workflow.snapshot(now).progress.total).toBe(2);
    expect(incoming.snapshot(now).audit.filter((event) => event.type === "event_dispatched")).toHaveLength(2);
  });

  it("salva prima dell'inoltro e riprende dopo crash senza perdere o duplicare", async () => {
    const { root, workflow, incoming } = setup([row(3), row(4)]);
    const now = new Date("2026-08-17T12:00:00.000Z");
    await incoming.poll(now);
    incoming.dispatchPending(now, 1);
    expect(incoming.snapshot(now).progress).toMatchObject({ dispatched: 1, pending: 1 });
    const restarted = new PersistentAprCrmIncomingReadOnly(root, { readOnlyGet: vi.fn(), snapshot: () => ({ status: "authenticated" }) }, workflow);
    restarted.dispatchPending(new Date("2026-08-17T12:01:00.000Z"));
    expect(restarted.snapshot(now).progress).toMatchObject({ dispatched: 2, pending: 0 });
    expect(workflow.snapshot(now).progress.total).toBe(2);
  });

  it("chiude la finestra crash dopo ingest già riuscito usando la deduplica del workflow", async () => {
    const { root, workflow, incoming } = setup([row(5)]);
    const now = new Date("2026-08-17T13:00:00.000Z");
    const staged = await incoming.poll(now);
    const item = staged.items[0];
    workflow.ingest({ event: item.event!, displayName: item.displayName }, now);
    const restarted = new PersistentAprCrmIncomingReadOnly(root, { readOnlyGet: vi.fn(), snapshot: () => ({ status: "authenticated" }) }, workflow);
    restarted.dispatchPending(new Date("2026-08-17T13:01:00.000Z"));
    expect(workflow.snapshot(now).progress.total).toBe(1);
    expect(restarted.snapshot(now).progress.dispatched).toBe(1);
  });

  it("esclude Beatrice e isola una riga invalida senza fermare la valida", async () => {
    const invalid = { ...row(7), updated_at: "non-data" };
    const { workflow, incoming } = setup([row(6, "Beatrice", "Ciotta"), invalid, row(8)]);
    const now = new Date("2026-08-17T14:00:00.000Z");
    await incoming.pollAndDispatch(now);
    expect(incoming.snapshot(now).progress).toMatchObject({ dispatched: 1, excluded: 1, blocked: 1 });
    expect(workflow.snapshot(now).items.map((item) => item.displayName)).toEqual(["Nome8 Cognome8"]);
  });

  it("non emette GET senza autenticazione e accetta una coda vuota", async () => {
    const login = setup([], "login_required");
    expect((await login.incoming.poll()).status).toBe("login_required");
    expect(login.get).not.toHaveBeenCalled();
    const empty = setup([]);
    expect((await empty.incoming.pollAndDispatch()).status).toBe("idle");
    expect(empty.incoming.snapshot().progress.observed).toBe(0);
  });
});
