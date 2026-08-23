import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AprInfissiEneaDraftPayload } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";
import { buildAprInfissiDraftPackage } from "./infissiDraftPackage";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture(options: { rawSelfCoBeneficiary?: boolean; resolvedCoBeneficiaryPresent?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-draft-package-"));
  roots.push(root);
  const dossierPath = path.join(root, "dossier.json");
  writeFileSync(dossierPath, JSON.stringify({ row: {
    cliente_nome: "Ada", cliente_cognome: "Lovelace", cliente_cf: "LVLDAA80A41H501U",
    prodotto_installato: "Infissi / Serramenti", created_at: "2026-01-10T10:00:00Z",
    dati_form: {
      richiedente: { nome: "Ada", cognome: "Lovelace", cf: "LVLDAA80A41H501U", data_nascita: "1980-01-01", comune_nascita: "Roma", provincia_nascita: "Roma", telefono: "3330000000", abitazione_principale: true },
      residenza: { comune: "Roma", provincia: "Roma", indirizzo: "Via Test", civico: "1", cap: "00100", stesso_indirizzo_lavori: true },
      edificio: { tipologia: "casa_singola_o_plurifamiliare", superficie_mq: 100, anno_costruzione: 1980, titolo_richiedente: "proprietario_o_comproprietario", numero_appartamenti: 1 },
      catastali: { foglio: "1", mappale: "2" },
      impianto: { tipo: "autonomo", terminali: "caloriferi", combustibile: "gas_metano", tipo_caldaia: "altro", aria_condizionata: false },
      prodotto: { materiale_nuovi: "pvc", vetro_nuovi: "doppio", materiale_vecchi: "legno", vetro_vecchi: "singolo", zanzariere_tapparelle_persiane: false },
      cointestazione: options.rawSelfCoBeneficiary
        ? { presente: true, nome: "Ada", cognome: "Lovelace", cf: "LVLDAA80A41H501U" }
        : { presente: false },
    },
  } }));
  const payload: AprInfissiEneaDraftPayload = {
    version: "apr-infissi-enea-draft-payload-v1",
    practiceId: "11111111-1111-4111-8111-111111111111",
    interventionType: "comma_345a_building_envelope",
    physicalWindowCount: 1,
    windows: [{ physicalRowId: "window-1", widthM: 1, heightM: 1.2, areaM2: 1.2, sourceNewWindowThermalTransmittanceWm2K: 1.3, newWindowThermalTransmittanceWm2K: 1.3, oldWindowThermalTransmittanceWm2K: 5, frameMaterial: "pvc", glassType: "doppio", shadingClosuresChecked: false }],
    expenseGrossVatIncluded: 1000,
    portalManagedFields: { energySavings: "leave_unset_portal_computed" },
    audit: { appliedRuleIds: ["user-2026-08-19-infissi-portal-managed-energy-savings-v1"], fieldEvidence: [] },
  };
  const draftPackage = buildAprInfissiDraftPackage({ customerKey: "ada-lovelace", displayName: "Ada Lovelace", practiceId: payload.practiceId, dossierPath, startDate: "2026-01-10", completionDate: "2026-01-20", resolvedTaxCode: "LVLDAA80A41H501U", resolvedCoBeneficiaryPresent: options.resolvedCoBeneficiaryPresent, infissiPayload: payload, oldFrameMaterial: "legno", oldGlazingType: "vetro_singolo", sourceFingerprint: "source-infissi-fixture" });
  return { root, draftPackage };
}

describe("APR Infissi · pacchetto bozza persistente", () => {
  it("mappa le pagine comuni, una riga tecnica per pezzo e il costo senza risparmio energetico", () => {
    const { draftPackage } = fixture();
    expect(draftPackage.module).toBe("infissi");
    expect(draftPackage.workflow.supportedPages).toEqual(expect.arrayContaining(["Anagrafica Beneficiario", "Immobile", "Intervento", "Impianto termico esistente", "Serramenti e infissi", "Calcolo costi e detrazioni"]));
    expect(draftPackage.workflow.steps.find((step) => step.pageName === "Intervento")?.fields).toContainEqual(expect.objectContaining({ portalId: "id-comma-345a", control: "button" }));
    expect(draftPackage.workflow.steps.find((step) => step.pageName === "Serramenti e infissi")).toMatchObject({ markerIds: ["id-costo"], fields: [{ portalId: "id-costo", value: "1000,00" }] });
    expect(draftPackage.workflow.screeningItemCount).toBe(1);
    expect(draftPackage.workflow.screeningSteps[0]).toMatchObject({
      id: "infisso-1",
      fields: expect.arrayContaining([
        { portalId: "id-f_pre", control: "select", value: "Legno", selectValue: "61" },
        { portalId: "id-v_pre", control: "select", value: "Singolo", selectValue: "66" },
        { portalId: "id-sup", control: "input", value: "1,2" },
        { portalId: "id-f_post", control: "select", value: "PVC", selectValue: "62" },
        { portalId: "id-v_post", control: "select", value: "Doppio", selectValue: "67" },
        { portalId: "id-conf", control: "select", value: "Verso esterno", selectValue: "189" },
        { portalId: "id-osc", control: "checkbox", value: "false" },
      ]),
    });
    expect(draftPackage.workflow.steps.find((step) => step.pageName === "Calcolo costi e detrazioni")).toMatchObject({ markerIds: ["id-risp"], fields: [] });
    expect(draftPackage.workflow.steps.flatMap((step) => step.fields).some((field) => field.portalId === "id-risp")).toBe(false);
    expect(draftPackage.infissiPayload?.portalManagedFields.energySavings).toBe("leave_unset_portal_computed");
    expect(draftPackage.safety).toMatchObject({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
  });

  it("prepara in modo idempotente la coda da pacchetti Infissi", () => {
    const { root, draftPackage } = fixture();
    const second = { ...draftPackage, customerKey: "grace-hopper", displayName: "Grace Hopper", practiceId: "22222222-2222-4222-8222-222222222222", packageFingerprint: `${draftPackage.packageFingerprint}-second` };
    const firstStore = new PersistentAprEneaDraftExecution(root);
    const prepared = firstStore.preparePackages([draftPackage, second], "batch-source-fingerprint", new Date("2026-08-22T12:00:00Z"));
    expect(prepared).toMatchObject({ status: "ready", items: [{ customerKey: "ada-lovelace", state: "queued" }, { customerKey: "grace-hopper", state: "queued" }] });
    expect(prepared.items[0].expectedPageIds).toContain("page:Calcolo costi e detrazioni");
    const restarted = new PersistentAprEneaDraftExecution(root);
    const repeated = restarted.preparePackages([draftPackage, second], "batch-source-fingerprint", new Date("2026-08-22T12:01:00Z"));
    expect(repeated.revision).toBe(prepared.revision);
    expect(repeated.items).toHaveLength(2);
  });

  it("esclude dal pacchetto Infissi il beneficiario principale ripetuto nel form come cointestatario", () => {
    const { draftPackage } = fixture({ rawSelfCoBeneficiary: true, resolvedCoBeneficiaryPresent: false });
    const beneficiary = draftPackage.workflow.steps.find((step) => step.pageName === "Anagrafica Beneficiario");
    expect(beneficiary?.coBeneficiary).toBeUndefined();
    expect(beneficiary?.fields.some((field) => field.portalId.includes("cointestat"))).toBe(false);
  });
});
