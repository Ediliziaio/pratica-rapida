import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { clearImportedPractice, ENEA_SHADOW_IMPORT_STORAGE_KEY, IMPORT_CONFIRMATION_PHRASE, loadImportedPractice, prepareSinglePracticeImport, saveImportedPractice, toShadowQueuePractice, withVerifiedReseller, withVerifiedTechnicalSnapshot, type CrmReadOnlySnapshot } from "./importBridge";

const syntheticSnapshot: CrmReadOnlySnapshot = {
  id: "11111111-2222-4333-8444-555555555555",
  code: "CRM-DEMO-001",
  cliente_nome: "Persona",
  cliente_cognome: "Sintetica",
  cliente_email: "persona.sintetica@example.invalid",
  cliente_telefono: "+39 000 123 4567",
  cliente_cf: "DMOSNT80A01F205X",
  prodotto_installato: "Schermature Solari",
  ricevuta_at: "2026-08-12T10:00:00.000Z",
  data_fine_lavori: "2026-07-31",
  document_count: 4,
  form_complete: true,
};
const consent = { confirmationPhrase: IMPORT_CONFIRMATION_PHRASE, singlePracticeConfirmed: true, localOnlyConfirmed: true, communicationsBlockedConfirmed: true };

describe("ponte importazione CRM ombra", () => {
  it("aggiunge soltanto un identificatore rivenditore minimizzato", () => {
    const result = prepareSinglePracticeImport([syntheticSnapshot], consent);
    if (result.ok === false) throw new Error(result.reason);
    expect(withVerifiedReseller(result.practice, "sima-home")?.resellerIdentifier).toBe("sima-home");
    expect(withVerifiedReseller(result.practice, "Nome con spazi")).toBeNull();
  });

  it("conserva solo uno snapshot tecnico minimizzato con impronta opaca", () => {
    const result = prepareSinglePracticeImport([syntheticSnapshot], consent);
    if (result.ok === false) throw new Error(result.reason);
    const updated = withVerifiedTechnicalSnapshot(result.practice, {
      buildingFingerprint: "building-deadbeef",
      plant: { type: "centralizzato", terminals: "caloriferi", fuel: "gas_metano", boiler: "gas_a_condensazione", airConditioning: true },
      screenings: [{ type: "tenda_da_sole", exposure: "sud_est", widthCm: 380, heightCm: 200, motorized: true }],
    });
    expect(updated?.technicalSnapshot?.buildingFingerprint).toBe("building-deadbeef");
    expect(JSON.stringify(updated)).not.toMatch(/via|foglio|mappale|subalterno/i);
  });
  it("richiede opt-in completo e una sola pratica", () => {
    expect(prepareSinglePracticeImport([], consent).ok).toBe(false);
    expect(prepareSinglePracticeImport([syntheticSnapshot, syntheticSnapshot], consent).ok).toBe(false);
    expect(prepareSinglePracticeImport([syntheticSnapshot], { ...consent, communicationsBlockedConfirmed: false }).ok).toBe(false);
  });

  it("minimizza e maschera lo snapshot prima della persistenza", () => {
    const result = prepareSinglePracticeImport([syntheticSnapshot], consent, new Date("2026-08-12T11:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.practice);
    expect(result.practice).toMatchObject({ customerLabel: "Cliente reale mascherato", maskedEmail: "***@example.invalid", maskedPhone: "***4567", maskedFiscalCode: "************205X" });
    expect(serialized).not.toContain("Persona");
    expect(serialized).not.toContain("Sintetica");
    expect(serialized).not.toContain(syntheticSnapshot.id);
    expect(Object.values(result.practice.communicationPolicy)).toEqual(["blocked", "blocked", "blocked", "blocked", "blocked"]);
  });

  it("usa uno storage separato e rifiuta policy di comunicazione alterate", () => {
    const result = prepareSinglePracticeImport([syntheticSnapshot], consent);
    if (result.ok === false) throw new Error(result.reason);
    const storage = { setItem: vi.fn(), getItem: vi.fn(() => JSON.stringify(result.practice)) };
    expect(saveImportedPractice(storage, result.practice)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(ENEA_SHADOW_IMPORT_STORAGE_KEY, expect.any(String));
    expect(loadImportedPractice(storage)).toEqual(result.practice);
    expect(saveImportedPractice(storage, { ...result.practice, communicationPolicy: { ...result.practice.communicationPolicy, email: "allowed" as "blocked" } })).toBe(false);
    storage.getItem.mockReturnValue(JSON.stringify({ ...result.practice, communicationPolicy: {} }));
    expect(loadImportedPractice(storage)).toBeNull();
  });

  it("conserva come sconosciuta la ricezione non esposta senza inventarla", () => {
    const result = prepareSinglePracticeImport([{ ...syntheticSnapshot, ricevuta_at: null }], consent, new Date("2026-08-13T10:00:00Z"));
    if (result.ok === false) throw new Error(result.reason);
    expect(result.practice.receivedAt).toBeNull();
    expect(result.practice.importedAt).toBe("2026-08-13T10:00:00.000Z");
    expect(toShadowQueuePractice(result.practice).ricevutaAt).toBe(result.practice.importedAt);
    expect(result.practice).not.toHaveProperty("operatorStatus");
  });

  it("non importa client CRM, rete, mutation, RPC o upload", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/features/enea-shadow-crm/importBridge.ts"), "utf8");
    expect(source).not.toMatch(/supabase|fetch\(|XMLHttpRequest|WebSocket|\.from\(|\.insert\(|\.update\(|\.rpc\(|upload\(/i);
  });

  it("crea una voce coda mascherata e resetta soltanto lo snapshot corrispondente", () => {
    const result = prepareSinglePracticeImport([syntheticSnapshot], consent);
    if (result.ok === false) throw new Error(result.reason);
    const values: Record<string, string> = {};
    const storage = {
      getItem: vi.fn((key: string) => values[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { values[key] = value; }),
      removeItem: vi.fn((key: string) => { delete values[key]; }),
    };
    expect(saveImportedPractice(storage, result.practice)).toBe(true);
    expect(toShadowQueuePractice(result.practice)).toMatchObject({ id: result.practice.localId, clienteNome: "Cliente reale", clienteCognome: "mascherato", documentPaths: [] });
    expect(JSON.stringify(toShadowQueuePractice(result.practice))).not.toContain("Persona");
    expect(clearImportedPractice(storage, "local-import-deadbeef")).toBe(false);
    expect(clearImportedPractice(storage, result.practice.localId)).toBe(true);
    expect(values[ENEA_SHADOW_IMPORT_STORAGE_KEY]).toBeUndefined();
  });
});
