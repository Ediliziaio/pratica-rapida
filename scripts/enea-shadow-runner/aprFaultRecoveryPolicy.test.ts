import { describe, expect, it } from "vitest";
import { decideAprFaultRecovery, planAprFaultRecovery, type AprFaultRecoveryInput } from "./aprFaultRecoveryPolicy";
import { disposeAprStoppedCases, type AprStopCaseInput } from "./aprStopDisposition";

const guasto = (faultText: string, previousAttempts = 0, customerKey = "danila-serpa"): AprFaultRecoveryInput =>
  ({ customerKey, faultText, previousAttempts });

/** Testi presi dalle disposizioni realmente prodotte sul lotto r121. */
const TESTI = {
  lease: "La sessione del browser e' scaduta durante la lavorazione: la pratica era pronta e non e' stata portata a termine. Va rilavorata.",
  nonDimostrabile: "APR non e' riuscito a dimostrare l'esito del salvataggio dopo l'unico tentativo di recupero autorizzato. La bozza puo' esistere o no: va riverificata.",
  acquisizione: "Nessun documento originario e' stato acquisito: il verdetto non riguarda la pratica ma l'acquisizione. Va rilavorata.",
  inCoda: "La pratica era pronta e in coda per il portale, ma il lotto si e' chiuso senza eseguirla. Va rilavorata.",
  mappatura: "I documenti non presentano conflitti ma APR non riesce a completare il payload della bozza: manca una mappatura nel modulo. E' un difetto da chiudere nel codice.",
  senzaMotivo: "APR si e' fermato senza registrare alcun motivo: non c'e' niente da chiedere all'operatore finche' il motivo non viene scritto.",
};

describe("un guasto di APR non e' un verdetto sulla pratica", () => {
  it("una sessione caduta si riprende subito", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.lease))).toMatchObject({
      faultClass: "sessione_browser_persa", action: "rilavora_subito", maxAttempts: 2,
    });
  });

  it("un esito non dimostrabile si riverifica a fine lotto, per non creare una seconda bozza", () => {
    const decisione = decideAprFaultRecovery(guasto(TESTI.nonDimostrabile));
    expect(decisione).toMatchObject({ faultClass: "esito_non_dimostrabile", action: "rilavora_a_fine_lotto" });
    expect(decisione.reason).toContain("una seconda");
  });

  it("un servizio esterno caduto si riprova a fine lotto", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.acquisizione))).toMatchObject({
      faultClass: "servizio_esterno_non_disponibile", action: "rilavora_a_fine_lotto", maxAttempts: 3,
    });
  });

  it("una pratica mai eseguita va semplicemente eseguita", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.inCoda))).toMatchObject({
      faultClass: "mai_eseguita", action: "rilavora_subito",
    });
  });

  it("una mappatura mancante non si risolve ritentando", () => {
    const decisione = decideAprFaultRecovery(guasto(TESTI.mappatura));
    expect(decisione).toMatchObject({ faultClass: "difetto_di_codice", action: "difetto_da_chiudere", maxAttempts: 0 });
    expect(decisione.reason).toContain("manca del codice");
  });

  it("una ferma senza motivo registrato non si ritenta al buio", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.senzaMotivo))).toMatchObject({
      faultClass: "motivo_non_registrato", action: "difetto_da_chiudere",
    });
  });

  it("lo stesso guasto ripetuto oltre il tetto smette di essere un incidente", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.lease, 1)).action).toBe("rilavora_subito");
    const esaurito = decideAprFaultRecovery(guasto(TESTI.lease, 2));
    expect(esaurito.action).toBe("difetto_da_chiudere");
    expect(esaurito.reason).toContain("non e' piu' un incidente");
  });

  it("un guasto sconosciuto si guarda, non si ripete", () => {
    expect(decideAprFaultRecovery(guasto("qualcosa che non abbiamo mai visto"))).toMatchObject({
      action: "difetto_da_chiudere",
    });
  });

  it("i tentativi negativi o frazionari non aggirano il tetto", () => {
    expect(decideAprFaultRecovery(guasto(TESTI.lease, -5)).attemptsSpent).toBe(0);
    expect(decideAprFaultRecovery(guasto(TESTI.lease, 2.9)).action).toBe("difetto_da_chiudere");
  });

  it("riproduce i 9 guasti del lotto r121", () => {
    const piano = planAprFaultRecovery([
      guasto(TESTI.lease, 0, "danila-serpa"),
      guasto(TESTI.lease, 0, "gloria-padoani"),
      guasto(TESTI.lease, 0, "lea-dettori"),
      guasto(TESTI.nonDimostrabile, 0, "paolino-bellini"),
      guasto(TESTI.nonDimostrabile, 0, "vincenzo-falconi"),
      guasto(TESTI.acquisizione, 0, "elena-depalma"),
      guasto(TESTI.acquisizione, 0, "fausta-de-filippo"),
      guasto(TESTI.mappatura, 0, "stefania-venturi"),
      guasto(TESTI.senzaMotivo, 0, "milena-fiorini"),
    ]);
    expect(piano.guasti).toBe(9);
    expect(piano.rilavoraSubito).toEqual(["danila-serpa", "gloria-padoani", "lea-dettori"]);
    expect(piano.rilavoraAFineLotto).toEqual(["elena-depalma", "fausta-de-filippo", "paolino-bellini", "vincenzo-falconi"]);
    expect(piano.difettiDaChiudere).toEqual(["milena-fiorini", "stefania-venturi"]);
  });

  /**
   * Le due meta' devono restare agganciate: se qualcuno riscrive il testo di
   * un guasto in aprStopDisposition e qui nessuno se ne accorge, il guasto
   * ricade nel ramo "non riconosciuto" e la pratica non viene piu' rilavorata.
   * E' esattamente l'errore trovato scrivendo questo modulo.
   */
  it("ogni guasto prodotto dalla disposizione viene riconosciuto dalla politica", () => {
    const ferma = (over: Partial<AprStopCaseInput>): AprStopCaseInput => ({
      customerKey: "x", state: "technical_block", blockerCodes: [],
      persistedQuestionCount: 0, documentsAcquired: true, ...over,
    });
    const fermate = [
      ferma({ customerKey: "acquisizione", documentsAcquired: false }),
      ferma({ customerKey: "crm", blockerCodes: ["crm_readonly_acquisition_invalid_response"] }),
      ferma({ customerKey: "payload", blockerCodes: ["draft_payload_mapping_incomplete"] }),
      ferma({ customerKey: "lease", executionReason: "Errore circoscritto alla pratica: apr_global_browser_lease_expired" }),
      ferma({ customerKey: "cdp", executionReason: "Errore circoscritto alla pratica: apr_cdp_enea_field_verification" }),
      ferma({ customerKey: "incerto", executionReason: "Anche l'unico recupero autorizzato ha esito incerto: Esito non dimostrabile" }),
      ferma({ customerKey: "coda", executionState: "queued" }),
    ];
    for (const disposizione of disposeAprStoppedCases(fermate).disposizioni) {
      const decisione = decideAprFaultRecovery({
        customerKey: disposizione.customerKey, faultText: disposizione.text, previousAttempts: 0,
      });
      expect(decisione.reason).not.toContain("Guasto non riconosciuto");
    }
  });
});
