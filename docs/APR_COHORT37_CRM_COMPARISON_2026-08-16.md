# APR — confronto read-only coorte 37 con CRM

Data: 16 agosto 2026  
Bozze: Amelia Lerose `412018`, Cataldo Cassone `412021`, Lea Dettori `412025`  
Modalità: confronto locale/read-only; nessuna modifica a CRM, ENEA, bozze o fonti.

## Perimetro e fonti

Il confronto usa:

- righe correnti della view CRM `enea_practices_public`, acquisite da APR via GET e conservate con fingerprint;
- `dati_form` delle pratiche archiviate;
- fatture originarie acquisite via GET e analizzate localmente;
- pacchetti bozza congelati e checkpoint di salvataggio con prove server per ogni pagina.

Non sono stati consultati documenti/PDF ENEA storici. Come previsto dalla policy di confronto TEST sono esclusi dati dell'impianto termico, risparmio energetico stimato, finestre protette e data di fine lavori.

## Differenze verificabili

### Amelia Lerose — CF

- CRM, `cliente_cf` e `dati_form.richiedente.cf`: `LRSMLA52B50D222C`.
- Bozza ENEA 412018: `LRSMLA52B50D122C`.
- Fatture originarie: `LRSMLA52B50D122C` in entrambe le copie sorgente analizzate.

La differenza è intenzionale e già coperta dalla regola del registro: il CF del form è formalmente invalido; il CF valido della fattura originaria prevale quando coerente con l'anagrafica. Non è un errore introdotto dalla ripetizione.

### Lea Dettori — cointestatario correttamente escluso per precedenza fattura

- CRM, `dati_form.cointestazione`: presente, Luigi Bellenchia, CF `BLLLGU65E28F205E`.
- Entrambe le fatture originarie: blocco cliente intestato esclusivamente a Lea Dettori, CF `DTTLEA66C62F205Q`; nessuna presenza di Luigi Bellenchia o del relativo CF.
- Pacchetto/bozza APR: nessun cointestatario.

La precedente classificazione come lacuna del workflow è superata dalla regola utente del 16/08/2026: per l'identità documentata la fattura originaria prevale sul form cliente. APR ha quindi operato correttamente non inserendo il cointestatario; la differenza resta visibile come warning auditato, non come blocker.

## Trasformazione prevista, non incongruenza

Il form CRM di Amelia contiene una sola riga generica di schermatura. Le fatture originarie identificano tre prodotti fisici; la bozza contiene correttamente tre righe separate da 15,3 m², 1,3 m² e 6,1 m², tutte con gTot 0,13. È l'applicazione prevista della cardinalità 1:1, non una differenza errata.

## Campi senza differenze verificabili

- Cataldo Cassone: nessuna incongruenza nei campi confrontabili. CF/anagrafica, immobile e catastali, unità singola, schermatura 3,8 m², esposizione Sud, gTot 0,14 e spesa €1.403,00 coincidono con form e fatture originarie.
- Lea Dettori: nessuna incongruenza dopo l'applicazione della precedenza fattura sul form. CF/anagrafica principale, assenza di cointestatario in fattura e bozza, immobile e catastali, unità singola, schermatura 9,4 m², esposizione Sud, gTot 0,08 e spesa €1.982,50 coincidono.
- Amelia Lerose, escluso il CF corretto dalla fattura: nessuna altra incongruenza. Immobile/catastali, tre prodotti fisici, superfici, esposizione Sud-Est, gTot 0,13 e spesa €9.500,00 coincidono con le fonti CRM originarie.

## Copertura residua

L'aliquota/detrazione non è confrontabile in questo dataset: tutte e tre le pratiche dichiarano abitazione principale, ma il checkpoint espone `deductionRate=null` e il workflow portale non conserva un campo aliquota confrontabile. Non viene dichiarata concordanza su questo punto.

## Controlli indipendenti

1. Le righe CRM canoniche della prima e della seconda acquisizione hanno hash identici per ciascun cliente.
2. I pacchetti completi della prima e della seconda bozza hanno lo stesso fingerprint per ciascun cliente.
3. Il checkpoint ENEA della seconda prova mostra le pagine salvate e verificate lato server, con gli stessi package fingerprint associati alle bozze 412018, 412021 e 412025.
