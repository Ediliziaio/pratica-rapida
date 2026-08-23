import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentAprPilotSample } from "./pilotSample";
import { PersistentEneaRunner } from "./runner";
import { renderDashboardHtml } from "./dashboard";

const candidates = Array.from({ length: 15 }, (_, index) => ({
  customerKey: `customer-${String(index + 1).padStart(2, "0")}`,
  displayName: `Cliente reale ${String(index + 1).padStart(2, "0")}`,
}));

describe("campione pilot APR 5-su-15", () => {
  it("estrae cinque clienti univoci, congela la scelta e la riprende senza riselezionare", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pilot-"));
    try {
      const first = new PersistentAprPilotSample(directory);
      expect(first.initialize(new Date("2026-08-15T09:30:00Z"))).toMatchObject({ status: "awaiting_candidates", selected: [] });
      const selected = first.select(candidates, "crm-list-proof-001", new Date("2026-08-15T09:31:00Z"), () => 0);
      expect(selected).toMatchObject({ status: "selected", revision: 1, sourceEvidenceId: "crm-list-proof-001" });
      expect(selected.selected).toHaveLength(5);
      expect(new Set(selected.selected.map((candidate) => candidate.customerKey)).size).toBe(5);

      const restarted = new PersistentAprPilotSample(directory);
      const replay = restarted.select([...candidates].reverse(), "crm-list-proof-001", new Date("2026-08-15T09:32:00Z"), (upper) => upper - 1);
      expect(replay.selected).toEqual(selected.selected);
      expect(replay.revision).toBe(1);
      expect(replay.audit.filter((event) => event.type === "pilot_selected")).toHaveLength(1);
      expect(restarted.snapshot()).toMatchObject({ externalActionAllowed: false, operationalGate: "blocked_pending_real_readonly_preflight" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocca elenchi incompleti o duplicati e consente il recupero con 15 identità valide", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pilot-block-"));
    try {
      const store = new PersistentAprPilotSample(directory);
      const incomplete = store.select(candidates.slice(0, 14), "crm-list-proof-bad", new Date("2026-08-15T09:31:00Z"), () => 0);
      expect(incomplete).toMatchObject({ status: "blocked", selected: [] });
      expect(incomplete.reason).toContain("candidate_count_14_expected_15");

      const duplicate = store.select([...candidates.slice(0, 14), candidates[0]], "crm-list-proof-duplicate", new Date("2026-08-15T09:32:00Z"), () => 0);
      expect(duplicate.reason).toContain("duplicate_customer_key");

      const recovered = new PersistentAprPilotSample(directory).select(candidates, "crm-list-proof-green", new Date("2026-08-15T09:33:00Z"), () => 0);
      expect(recovered).toMatchObject({ status: "selected", revision: 3 });
      expect(recovered.selected).toHaveLength(5);
      expect(recovered.audit.map((event) => event.type)).toEqual([
        "pilot_initialized",
        "candidate_list_rejected",
        "candidate_list_rejected",
        "pilot_selected",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rifiuta la sostituzione del campione dopo la selezione", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pilot-replace-"));
    try {
      const store = new PersistentAprPilotSample(directory);
      store.select(candidates, "crm-list-proof-001", new Date("2026-08-15T09:31:00Z"), () => 0);
      expect(() => store.select(candidates.map((candidate, index) => index === 0 ? { ...candidate, displayName: "Nome mutato" } : candidate), "crm-list-proof-002"))
        .toThrow("sostituzione dei candidati vietata");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("conserva la provenienza di un elenco di 15 nomi fornito direttamente dall'utente", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pilot-user-source-"));
    try {
      const selected = new PersistentAprPilotSample(directory).select(
        candidates, "user-message-2026-08-15-15-candidates", new Date("2026-08-15T13:50:00Z"), () => 0, "user_supplied_candidate_list",
      );
      expect(selected).toMatchObject({ status: "selected", source: "user_supplied_candidate_list", sourceEvidenceId: "user-message-2026-08-15-15-candidates" });
      expect(selected.audit.at(-1)?.reason).toContain("fonte user_supplied_candidate_list");
      expect(() => new PersistentAprPilotSample(directory).select(candidates, "user-message-2026-08-15-15-candidates"))
        .toThrow("sostituzione dei candidati vietata");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rende visibili nel dashboard stato, motivo, prossima azione e chiamate modello nulle", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pilot-dashboard-"));
    try {
      const state = new PersistentEneaRunner(directory).initialize([]);
      const pilotStore = new PersistentAprPilotSample(directory);
      const pilot = pilotStore.initialize(new Date("2026-08-15T09:30:00Z"));
      const html = renderDashboardHtml(state, new Date("2026-08-15T09:30:01Z"), null, null, null, null, null, null, null, null, null, {
        ...pilot,
        externalActionAllowed: false,
        operationalGate: "blocked_pending_real_candidate_list",
        observedAt: "2026-08-15T09:30:01.000Z",
        lastEvent: pilot.audit.at(-1)!,
      });
      expect(html).toContain("Pilot casuale 5-su-15");
      expect(html).toContain("Nessun nome inventato o selezionato");
      expect(html).toContain("chiamate Codex/OpenAI runtime");
      expect(html).toContain("Acquisire esattamente 15 clienti reali univoci");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
