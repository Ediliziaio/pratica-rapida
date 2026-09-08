import { describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { isLineaSolePotitoPaperForm, lineaSolePotitoSupplierEvidence, parseLineaSolePotitoPaperForm, resolveLineaSolePotitoExposure, resolveLineaSolePotitoProtectedWindowSurface } from "./lineaSolePotitoPolicy";

describe("Linea Sole Potito — modulo cartaceo e fallback vendor-scoped", () => {
  it("fa match esclusivamente sul fornitore inequivoco", () => {
    expect(lineaSolePotitoSupplierEvidence({ companies: { ragione_sociale: "LINEA SOLE POTITO" } })).toMatchObject({ matched: true, match: { field: "row.companies.ragione_sociale" } });
    expect(lineaSolePotitoSupplierEvidence({ companies: { ragione_sociale: "Linea Sole Potito & Figli" } }).matched).toBe(false);
    expect(lineaSolePotitoSupplierEvidence({ fornitore: "Altro fornitore" }).matched).toBe(false);
  });

  it("riconosce solo il template cartaceo PraticaRapida per schermature", () => {
    expect(isLineaSolePotitoPaperForm("Compilazione a cura del richiedente la detrazione - DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO - INSTALLAZIONE DI SCHERMATURE SOLARI - Pag. 5/5")).toBe(true);
    expect(isLineaSolePotitoPaperForm("Fattura Linea Sole Potito per schermature solari")).toBe(false);
  });

  it("riconosce il pacchetto cartaceo parziale senza inventare la pagina tecnica mancante", () => {
    expect(isLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
DATI IDENTIFICATIVI IMPIANTO TERMICO ESISTENTE
PraticaRapida
Pag. 2/5`)).toBe(true);
  });

  // Regressione Berti/Mocenighi (2026-09-07): questo fixture usava un layout
  // catastale/edificio (valore prima dell'etichetta) mai osservato in un
  // modulo reale. Il layout reale, verificato su piu' pratiche, mette
  // sempre l'etichetta prima del valore ed "ANNO DI COSTRUZIONE" e' seguito
  // da "(anche presunto)" prima del valore.
  it("estrae soltanto i valori testuali inequivoci del modulo cartaceo", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
LILIANA GLORIA GLRLLN73B60A089P
Nome ____ Cognome ____ Codice Fiscale ____
AGRIGENTO AG 20 02 1973
Luogo di nascita ____ Prov. ____ Data di nascita
LUOGO DI RESIDENZA
VIA GIAMBELLINO 96
DX
Indirizzo ____
MILANO MI 20146
Comune ____ Prov. ____ Cap ____
3406539964 lili.gloria73@gmail.com
N. telefono /cell. ____ e-mail ____
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO
VIA GIAMBELLINO 96
DX
Indirizzo ____
MILANO MI 20146
Comune ____ Prov. ____ Cap ____
DATI CATASTALI
Foglio
511
Mappale o particella
257
Subalterno
157
ANNO DI COSTRUZIONE (anche presunto)
1973
superficie utile in mq
36
NUMERO DI UNITA’ IMMOBILIARI PRESENTI NELL’INTERO EDIFICIO
80
INSTALLAZIONE DI SCHERMATURE SOLARI
Pag. 5/5`, { name: "Liliana", surname: "Gloria" });
    expect(parsed).toMatchObject({
      richiedente: { nome: "Liliana", cognome: "Gloria", cf: "GLRLLN73B60A089P", comune_nascita: "AGRIGENTO", provincia_nascita: "AG", data_nascita: "1973-02-20" },
      residenza: { indirizzo: "VIA GIAMBELLINO 96", civico: "DX", comune: "MILANO", provincia: "MI", cap: "20146" },
      catastali: { foglio: "511", mappale: "257", subalterno: "157" },
      edificio: { anno_costruzione: "1973", superficie_mq: "36", numero_appartamenti: "80" },
    });
  });

  it("regressione Berti/Mocenighi: estrae singolarmente ogni campo catastale/edificio anche se un campo vicino e' vuoto o l'anno di costruzione e' incompleto", () => {
    const bertiStyle = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
ELENA MARCELLA BERTI BRTLMR63C57F205P
Nome ____ Cognome ____ Codice Fiscale ____
MILANO MI 17 03 1963
Luogo di nascita ____ Prov. ____ Data di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
DATI CATASTALI
Foglio
553
Mappale o particella
220
Subalterno
16
ANNO DI COSTRUZIONE (anche presunto)
19
superficie utile in mq
60
INSTALLAZIONE DI SCHERMATURE SOLARI
Pag. 5/5`, { name: "Elena Marcella", surname: "Berti" });
    expect(bertiStyle).toMatchObject({
      catastali: { foglio: "553", mappale: "220", subalterno: "16" },
      edificio: { anno_costruzione: "", superficie_mq: "60" },
    });
  });

  it("non estrae un valore catastale/edificio quando l'OCR e' troppo degradato per essere plausibile", () => {
    const codaStyle = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
RICCARDO CODA CDORCR50A30A859R
Nome ____ Cognome ____ Codice Fiscale ____
MILANO MI 30 01 1950
Luogo di nascita ____ Prov. ____ Data di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
DATI CATASTALI
Foglio ý6 4
Mappale o particella 2 gP
Subaltemo 7 o 7
ANNO DI COSTRUZIONE (anche presunto) 19†5
superficie utile in ma i3a
INSTALLAZIONE DI SCHERMATURE SOLARI
Pag. 5/5`, { name: "Riccardo", surname: "Coda" });
    expect(codaStyle).toMatchObject({
      catastali: { foglio: "", mappale: "", subalterno: "" },
      edificio: { anno_costruzione: "", superficie_mq: "" },
    });
  });

  it("legge orientamento e finestra quando la pagina prodotto e' compilata esplicitamente", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO
INSTALLAZIONE DI SCHERMATURE SOLARI
Prodotto: Tenda fronte soggiorno
Orientamento: Sud/Ovest
Dimensioni finestra protetta: 120 x 150 cm
Pag. 5/5`, { name: "Mario", surname: "Rossi" }) as Record<string, any>;
    expect(parsed.prodotto.schermature).toEqual([{ tipo_prodotto: "", direzione: "sud_ovest" }]);
    expect(parsed._lineaSolePotito.explicitScreenings[0]).toMatchObject({ direzione: "sud_ovest", protectedWindowSurfaceM2: 1.8 });
  });

  it("ripara soltanto la cifra iniziale 1 della data persa dall'OCR quando il CF valido concorda", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
ALICE MOLINARIS MLNLCA95A58F205J
MILANO MI 8 01 1995
Luogo di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
PraticaRapida Pag. 2/5`, { name: "Alice", surname: "Molinaris" }) as Record<string, any>;
    expect(parsed.richiedente.data_nascita).toBe("1995-01-18");
    expect(parsed._lineaSolePotito.birthDateResolution).toMatchObject({ repaired: true, observed: "1995-01-08" });
  });

  it("recupera l'identita attesa dai segmenti del CF quando nome e cognome manoscritti sono OCR illeggibili", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
Nome _ AUC Cognome H10UI NAMS Codice Fiscale MLNLCA95A58F205J
MILANO MI 8 01 1995
Luogo di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
PraticaRapida Pag. 2/5`, { name: "Alice", surname: "Molinaris" }) as Record<string, any>;
    expect(parsed.richiedente).toMatchObject({ nome: "Alice", cognome: "Molinaris", cf: "MLNLCA95A58F205J", data_nascita: "1995-01-18" });
  });

  it("usa il CF gia verificato nella fattura per il layout reale con etichette prima dei valori", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
Nome _ AUC Cognome H10UI NAMS Codice Fiscale MLNL CA9 SAS8F 205J
Luogo di nascita
MILANO
Prov._ MI Data di nascita 8 /01 / 1995
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
PraticaRapida Pag. 2/5`, { name: "Alice", surname: "Molinaris", taxCode: "MLNLCA95A58F205J" }) as Record<string, any>;
    expect(parsed.richiedente).toMatchObject({ nome: "Alice", cognome: "Molinaris", cf: "MLNLCA95A58F205J", data_nascita: "1995-01-18" });
  });

  it("ricompone il mese quando la barra OCR diventa 1 e verifica il risultato col CF di fattura", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
Nome MARIA SOFIA Cognome TOSATTI Codice Fiscale IST MSF 34M 58 C 209 W
Luogo di nascita
CASTELMASSA
Prov.
RO
Data di nascita 18
108,1934
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
PraticaRapida Pag. 2/5`, { name: "Maria Sofia", surname: "Tosatti", taxCode: "TSTMSF34M58C207W" }) as Record<string, any>;
    expect(parsed.richiedente).toMatchObject({
      nome: "Maria Sofia",
      cognome: "Tosatti",
      cf: "TSTMSF34M58C207W",
      comune_nascita: "CASTELMASSA",
      provincia_nascita: "RO",
      data_nascita: "1934-08-18",
    });
  });

  it("non modifica date OCR che non hanno una sola ricostruzione concordante col CF", () => {
    const parsed = parseLineaSolePotitoPaperForm(`Compilazione a cura del richiedente la detrazione
PERSONA FISICA
ALICE MOLINARIS MLNLCA95A58F205J
MILANO MI 7 01 1995
Luogo di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
PraticaRapida Pag. 2/5`, { name: "Alice", surname: "Molinaris" }) as Record<string, any>;
    expect(parsed.richiedente.data_nascita).toBe("1995-01-07");
    expect(parsed._lineaSolePotito.birthDateResolution.repaired).toBe(false);
  });

  it("usa Sud solo in assenza di orientamento esplicito", () => {
    expect(resolveLineaSolePotitoExposure(null)).toEqual({ value: "sud", source: "linea_sole_potito_fallback", ruleId: USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm });
    expect(resolveLineaSolePotitoExposure("Sud Ovest")).toEqual({ value: "sud_ovest", source: "paper_form_explicit", ruleId: USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm });
  });

  it("genera 2,0-2,9 in modo stabile per pratica+riga e lascia prevalere l'esplicito", () => {
    const first = resolveLineaSolePotitoProtectedWindowSurface({ practiceId: "P-1", rowId: "riga-1" })!;
    const restarted = resolveLineaSolePotitoProtectedWindowSurface({ practiceId: "P-1", rowId: "riga-1" })!;
    expect(first).toEqual(restarted);
    expect(first.value).toBeGreaterThanOrEqual(2);
    expect(first.value).toBeLessThanOrEqual(2.9);
    expect(Number.isInteger(first.value * 10)).toBe(true);
    expect(first).toMatchObject({ source: "linea_sole_potito_fallback", ruleId: USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm });
    expect(resolveLineaSolePotitoProtectedWindowSurface({ practiceId: "P-1", rowId: "riga-1", explicitValue: 4.2 })).toMatchObject({ value: 4.2, source: "paper_form_explicit", seed: null });
  });
});
