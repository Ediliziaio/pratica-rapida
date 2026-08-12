import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ENEA_SHADOW_IMPORT_STORAGE_KEY, IMPORT_CONFIRMATION_PHRASE, loadImportedPractice, prepareSinglePracticeImport, saveImportedPractice, type CrmReadOnlySnapshot } from "./importBridge";

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

  it("non importa client CRM, rete, mutation, RPC o upload", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/features/enea-shadow-crm/importBridge.ts"), "utf8");
    expect(source).not.toMatch(/supabase|fetch\(|XMLHttpRequest|WebSocket|\.from\(|\.insert\(|\.update\(|\.rpc\(|upload\(/i);
  });
});
