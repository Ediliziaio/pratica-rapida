import { describe, expect, it } from "vitest";
import { disposeAprStoppedCase, disposeAprStoppedCases, type AprStopCaseInput } from "./aprStopDisposition";

const ferma = (over: Partial<AprStopCaseInput> = {}): AprStopCaseInput => ({
  customerKey: "loretta-riviera",
  state: "technical_block",
  blockerCodes: [],
  executionState: null,
  executionReason: null,
  persistedQuestionCount: 0,
  documentsAcquired: true,
  ...over,
});

describe("nessuna pratica ferma resta muta", () => {
  it("un dato mancante diventa una domanda che dice cosa serve", () => {
    const esito = disposeAprStoppedCase(ferma({ blockerCodes: ["infissi_dimensions_and_cardinality_missing"] }));
    expect(esito.kind).toBe("domanda_operatore");
    expect(esito.field).toBe("infissi.dimensioni_e_numero");
    expect(esito.text).toContain("quanti serramenti");
  });

  it("un guasto di APR non diventa una domanda al cliente", () => {
    const esito = disposeAprStoppedCase(ferma({ blockerCodes: ["crm_readonly_acquisition_invalid_response"] }));
    expect(esito.kind).toBe("guasto_apr");
    expect(esito.text).toContain("non c'e' niente da chiedere");
  });

  it("classifica le sezioni obbligatorie mancanti del form come domanda_operatore", () => {
    const esito = disposeAprStoppedCase(ferma({ blockerCodes: ["customer_form_required_sections_missing"] }));
    expect(esito).toMatchObject({
      kind: "domanda_operatore",
      blockerCode: "customer_form_required_sections_missing",
      field: "customerForm.requiredSections",
    });
    expect(esito.text).toContain("edificio e dell'impianto");
  });

  it("una vera mappatura payload incompleta resta guasto_apr", () => {
    const esito = disposeAprStoppedCase(ferma({ blockerCodes: ["draft_payload_mapping_incomplete"] }));
    expect(esito).toMatchObject({
      kind: "guasto_apr",
      blockerCode: "draft_payload_mapping_incomplete",
      field: null,
    });
    expect(esito.text).toContain("difetto da chiudere nel codice");
  });

  it("una sessione scaduta e' un guasto, non una pratica incompleta", () => {
    const esito = disposeAprStoppedCase(ferma({
      state: "inconsistent", executionState: "operator_intervention",
      executionReason: "Errore circoscritto alla pratica: apr_global_browser_lease_expired",
    }));
    expect(esito).toMatchObject({ kind: "guasto_apr", blockerCode: null });
    expect(esito.text).toContain("sessione del browser e' scaduta");
  });

  it("un esito non dimostrabile va riverificato, non chiesto all'operatore", () => {
    const esito = disposeAprStoppedCase(ferma({
      executionState: "operator_intervention",
      executionReason: "Anche l'unico recupero autorizzato ha esito incerto: Esito non dimostrabile dopo l'unico recupero",
    }));
    expect(esito.kind).toBe("guasto_apr");
    expect(esito.text).toContain("riverificata");
  });

  it("un blocco con codice calcolato usa il motivo persistito invece di inventarne uno", () => {
    const esito = disposeAprStoppedCase(ferma({
      blockerCodes: ["invoice_929a8665"],
      blockerReasons: { invoice_929a8665: "Il totale di almeno un documento fiscale non e' stato riconosciuto." },
    }));
    expect(esito).toMatchObject({ kind: "domanda_operatore", blockerCode: "invoice_929a8665" });
    expect(esito.text).toContain("Il totale di almeno un documento fiscale");
    expect(esito.text).toContain("senza ricalcolarlo");
  });

  it("un dato gia' richiesto viene richiesto di nuovo con le parole della richiesta originale (Munafo)", () => {
    const esito = disposeAprStoppedCase(ferma({
      blockerCodes: ["operator_response_pending_external_data"],
      blockerReasons: { operator_response_pending_external_data: "Indica le misure della bioclimatica riportate nel foglio manoscritto corretto per questa pratica." },
    }));
    expect(esito.kind).toBe("domanda_operatore");
    expect(esito.text).toContain("misure della bioclimatica");
    expect(esito.text).not.toContain("dato mancante indicato nella richiesta");
  });

  // r125, 14/09/2026: il driver registrava gia' i campi rifiutati dal portale
  // (postClick.invalidControlIds) e nessuno li leggeva.
  it("un campo del cliente rifiutato dal portale e' una domanda che nomina il campo (Bellini, telefono)", () => {
    const esito = disposeAprStoppedCase(ferma({
      executionState: "operator_intervention",
      executionReason: "Il portale ENEA rifiuta la pagina page:Anagrafica Beneficiario: campo id-telefono (Inserire solo numeri.). Nessun recupero: riprovare con lo stesso valore non cambia l'esito.",
    }));
    expect(esito).toMatchObject({ kind: "domanda_operatore", blockerCode: "apr_enea_portal_field_rejected:id-telefono", field: "portal.id-telefono" });
    expect(esito.text).toContain("telefono");
    expect(esito.text).toContain("Inserire solo numeri");
  });

  it("un campo compilato da APR rifiutato dal portale e' un guasto nostro (Fiorini gtot, De Filippo gradi giorno)", () => {
    for (const [pagina, campo] of [["screening:1", "id-gtot"], ["page:Immobile", "id-gg"]]) {
      const esito = disposeAprStoppedCase(ferma({
        executionState: "operator_intervention",
        executionReason: `Il portale ENEA rifiuta la pagina ${pagina}: campo ${campo} (Valore obbligatorio.). Nessun recupero: riprovare con lo stesso valore non cambia l'esito.`,
      }));
      expect(esito.kind).toBe("guasto_apr");
      expect(esito.text).toContain(campo.replace("id-", ""));
      expect(esito.text).toContain("mappatura nostra");
    }
  });

  it("un fascicolo vuoto e' un guasto di acquisizione", () => {
    const esito = disposeAprStoppedCase(ferma({ documentsAcquired: false, blockerCodes: ["screenings_missing"] }));
    expect(esito.kind).toBe("guasto_apr");
    expect(esito.text).toContain("acquisizione");
  });

  it("un blocco specifico vince su uno generico", () => {
    expect(disposeAprStoppedCase(ferma({
      blockerCodes: ["screenings_missing", "screening_primary_measurements_missing"],
    })).blockerCode).toBe("screening_primary_measurements_missing");
  });

  it("non sapere cosa chiedere e' un difetto di APR, non una domanda generica", () => {
    const esito = disposeAprStoppedCase(ferma({ blockerCodes: ["codice_mai_visto"] }));
    expect(esito).toMatchObject({ kind: "guasto_apr", blockerCode: "codice_mai_visto" });
    expect(esito.text).toContain("non sa formulare la domanda");
  });

  it("una pratica ferma senza alcun motivo registrato lo dichiara", () => {
    expect(disposeAprStoppedCase(ferma()).text).toContain("senza registrare alcun motivo");
  });

  it("una domanda gia' scritta non viene contata fra quelle mancanti", () => {
    const report = disposeAprStoppedCases([
      ferma({ customerKey: "a", blockerCodes: ["customer_form_missing"], persistedQuestionCount: 1 }),
      ferma({ customerKey: "b", blockerCodes: ["tax_code_missing_or_invalid"] }),
      ferma({ customerKey: "c", blockerCodes: ["crm_readonly_acquisition_invalid_response"] }),
    ]);
    expect(report).toMatchObject({ ferme: 3, domandeOperatore: 2, guastiApr: 1, domandeMancanti: 1 });
  });

  it("ogni pratica ferma riceve sempre un esito: il silenzio non e' possibile", () => {
    const casi = [
      ferma({ customerKey: "a" }),
      ferma({ customerKey: "b", blockerCodes: ["ignoto"] }),
      ferma({ customerKey: "c", executionState: "queued" }),
      ferma({ customerKey: "d", documentsAcquired: false }),
    ];
    const report = disposeAprStoppedCases(casi);
    expect(report.disposizioni).toHaveLength(4);
    expect(report.disposizioni.every((item) => item.text.length > 0)).toBe(true);
    expect(report.domandeOperatore + report.guastiApr).toBe(4);
  });
});
