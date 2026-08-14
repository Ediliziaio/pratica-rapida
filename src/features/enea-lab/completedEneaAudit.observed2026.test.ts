import { describe, expect, it } from "vitest";
import { parseCompletedEneaText } from "./completedEneaAudit";

/**
 * Fixture anonimizzata ricostruita dalla struttura di un PDF ENEA Ecobonus 2026
 * conclusivo realmente osservato nel laboratorio. Mantiene impaginazione logica,
 * etichette e valori tecnici rappresentativi, senza dati personali reali.
 */
describe("audit storico ENEA - PDF conclusivo 2026 osservato", () => {
  it("legge anagrafica, impianto e tutte le righe schermatura dal formato reale", () => {
    const snapshot = parseCompletedEneaText(`
      Ecobonus 2026
      Riqualificazione energetica - ex legge 296/2006
      Comma 345B - Schermature solari
      CPID 288717-2026E-ABCDEFGHIJKLMNOP
      Data chiusura 2026-07-14 9:57:39 CEST
      Dati generali
      1. Dati identificativi della struttura oggetto dell'intervento
      Ubicazione edificio
      Indirizzo: Via Esempio 75/130 - 21040 Rho (MI)
      Scala:
      Interno:
      Dati catastali
      Codice nazionale del Comune: H264
      Sezione:
      Foglio: 9
      Particella: 10986
      Subalterno: 32
      2. Anno di costruzione inserire anche se stimato 2022
      3. Proprietario o detentore dell'edificio o avente diritto
      Nome: Mario
      Cognome: Esempio
      Codice fiscale: TESTCF80A01H501X
      Sesso: M
      Data di nascita: 01/01/1980
      Comune di nascita: Rho (MI)
      Residenza: Via Residenza 10 - 21040 Uboldo (VA)
      4. Altri beneficiari (persone fisiche)
      5. Altri beneficiari (persone giuridiche)
      6. Titolo di possesso Proprietario o comproprietario
      7. Destinazione d'uso generale Residenziale
      8. Destinazione d'uso particolare Edifici adibiti a residenza e assimilabili (con carattere continuativo o saltuario)
      9. Tipologia edilizia Edificio a schiera e condominio fino a tre piani
      10. Superficie utile [m²] delle unità immobiliari interessate dall'intervento 140
      Dati intervento
      1. Intervento su Singola unità immobiliare (in un edificio costituito da più unità immobiliari)
      2. Unità immobiliari Numero totale delle unità immobiliari dell'edificio alla fine dei lavori 1
      3. Numero di unità immobiliari oggetto dell'intervento per cui si chiede la detrazione
      Si considera la situazione catastale all'inizio dei lavori 1
      4. Si sono verificati degli accorpamenti di unità immobiliari? Si fa riferimento alle unità immobiliari interessate dai lavori oggetto della presente scheda descrittiva No
      5. Data d'inizio dei lavori 09/04/2026
      6. Data di ultimazione dei lavori (collaudo) 14/07/2026
      IR. Impianto termico esistente
      1. Tipo di impianto Indicare la tipologia prevalente a. impianto autonomo
      2. Terminali di erogazione Indicare la tipologia prevalente f. pannelli radianti annegati nella struttura
      3. Tipo di distribuzione Indicare la tipologia prevalente
      4. Tipo di regolazione Indicare la tipologia prevalente
      5. Generatori esistenti prima dell'inizio dei lavori
      Tipo di generatore N. Rendimento al 100% della potenza / P.E.A. Potenza utile nominale [kW]
      Altro (energia elettrica) 1 ƞ = 94.8 % 24.1
      6. Vettore energetico Indicare la tipologia prevalente f. energia elettrica
      7. Impianto di climatizzazione estiva Sì
      Scheda intervento
      SS. Schermature solari
      # Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²] Resistenza termica supplementare (Rsupp) [Km²/W] Esposizione Modalità di calcolo Fattore di trasmissione solare (gtot) Materiale schermature Meccanismo di regolazione
      1 Altra schermatura solare Esterna 3.7 2.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      2 Altra schermatura solare Esterna 11.3 5.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      3 Altra schermatura solare Esterna 5.6 4.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      4 Altra schermatura solare Esterna 5.9 4.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      5 Altra schermatura solare Esterna 0.5 0.3 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
      Spese congrue sostenute [€] 13924
      Note
      1. Note
      Riepilogo
    `);

    expect(snapshot.cpid).toBe("288717-2026E-ABCDEFGHIJKLMNOP");
    expect(snapshot.screeningCount).toBe(5);
    expect(snapshot.fields["intervento.tipo"]).toBe("Comma 345B - Schermature solari");
    expect(snapshot.fields["immobile.indirizzo"]).toBe("Via Esempio");
    expect(snapshot.fields["immobile.civico"]).toBe("75/130");
    expect(snapshot.fields["beneficiario.comune_residenza"]).toBe("Uboldo");
    expect(snapshot.fields["impianto.numero_generatori"]).toBe("1");
    expect(snapshot.fields["impianto.rendimento"]).toBe("94.8");
    expect(snapshot.fields["impianto.potenza"]).toBe("24.1");
    expect(snapshot.fields["schermature.0.superficie"]).toBe("3.7");
    expect(snapshot.fields["schermature.0.rsupp"]).toBe("0.08");
    expect(snapshot.fields["schermature.4.superficie_finestrata"]).toBe("0.3");
    expect(snapshot.fields["schermature.4.gtot"]).toBe("0.13");
    expect(snapshot.fields["schermature.spesa"]).toBe("13924");
  });
});
