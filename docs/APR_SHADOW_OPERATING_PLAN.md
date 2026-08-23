# APR — piano operativo SHADOW

Versione: `apr-shadow-operating-model-v1`

## Obiettivo corrente

APR passa dalla sperimentazione per singola pratica a una modalità shadow misurabile e non interferente con il CRM PraticaRapida:

- `MATTEO` continua a produrre la pratica ufficiale;
- `APR` elabora in parallelo un risultato shadow separato;
- APR non può leggere il risultato umano prima di aver sigillato il proprio risultato;
- il risultato umano non alimenta mapper, regole o output APR;
- CRM mutativo, preview, submit, ricevute e comunicazioni restano disabilitati;
- il passaggio a produzione non è autorizzato.

## Avvio esplicito e centro di controllo

Il supervisore resta acceso, ma APR non interroga la pipeline `Pronte da fare` finché l'utente non preme **Avvia APR** nella dashboard locale. Il comando è persistente e idempotente: dopo un riavvio del computer il gate conserva lo stato scelto.

Quando il gate è attivo APR può acquisire, una alla volta, le nuove pratiche ENEA dalla pipeline. Una pratica bloccata viene isolata con motivo e prossima azione; non interrompe la coda successiva. **Sospendi nuove prese in carico** chiude soltanto l'ingresso e non cancella checkpoint, risultati o confronti.

Il centro di controllo mostra in una sola schermata:

- pratiche arrivate fino alla bozza salvata con ID e prova delle pagine;
- pratiche bloccate, motivazione leggibile e prossima azione;
- confronto APR ↔ pratica CRM dell'operatore, campo per campo e con fonte;
- stato del gate, conteggi e differenze critiche.

Il comando di avvio non abilita preview, submit, ricevute, email o comunicazioni.

## Sequenza dei gate

1. **Schermature — chiusura baseline shadow**
   - ultimo batch pulito senza correzioni durante l'esecuzione;
   - estrazione e mapping verificati contro fonti originarie;
   - blocker fail-closed;
   - confronto strutturato con pratica reale conclusa;
   - test automatici e CI verdi.
2. **VEPA — prossimo modulo Bonus Casa**
   - VEPA/vetrate scorrevoli sono instradate esclusivamente su Bonus Casa; Ecobonus è vietato;
   - beneficiario, cointestatari, codice fiscale, residenza, immobile e qualificazione edificio riusano il contratto APR condiviso;
   - il mapping dei campi specifici Bonus Casa resta disabilitato fino a osservazione read-only, versione del contratto, test e confronto reale;
   - analisi → mapping → blocker → test → confronto reale → CI → abilitazione shadow.
3. **Infissi — flusso comune e risoluzione fonti tecniche pronti localmente**
   - riusa beneficiario, cointestatari, immobile, date, impianto esistente, economia, aliquota 50%/36%, audit e coda delle schermature;
   - cambia soltanto il tipo intervento in `Comma 345A - Interventi sull'involucro`;
   - numero e misure provengono dalla fattura quando sono espliciti; altrimenti dai documenti tecnici originari allegati;
   - la trasmittanza esplicita di fattura o documento tecnico prevale; soltanto se assente in tutte le fonti si usa il fallback 1,3 W/m²K; ogni infisso resta una riga fisica 1:1;
   - la misura esterna complessiva e preferita, ma e ammessa un'altra misura documentata quando quella esterna non e isolabile; APR conserva la superficie esatta e prepara per ENEA l'arrotondamento a un decimale in metri quadrati;
   - materiale e vetro espliciti prevalgono; se assenti, i fallback sono PVC e vetro a bassa emissione;
   - il flag ENEA `Chiusure oscuranti` segue esclusivamente il SI/NO del form sulla contestuale installazione di infissi, zanzariere o persiane;
   - il mapping dei campi della pagina tecnica resta disabilitato fino alla sessione dedicata;
   - nessuna bozza reale è abilitata da questo gate.
4. **Pompe di calore** con lo stesso ciclo.
5. **Insufflaggio** con lo stesso ciclo.

Le sezioni condivise — beneficiario, edificio, documenti, date, fonti economiche, audit, coda, lock e checkpoint — restano comuni. Ogni prodotto aggiunge soltanto regole e mapping specifici.

## Isolamento contro la contaminazione

Per ogni pratica APR registra prima un risultato terminale immutabile con:

- fingerprint del risultato;
- timestamp di completamento e sigillo;
- valori campo per campo;
- fonti originarie;
- regole applicate;
- eventuale blocker informativo.

Il risultato umano può essere rilasciato al comparatore soltanto dopo quel sigillo. Un risultato APR già sigillato non può essere sostituito. La ripetizione dello stesso comando è idempotente.

## Confronto giornaliero

Il supervisore genera automaticamente e in modo idempotente il report alle **19:00 Europe/Rome**. L'orario è configurabile; il file giornaliero è persistente e un riavvio non ne crea una seconda copia.

Il comparatore classifica ogni caso e ogni campo come:

- match completo;
- differenza irrilevante/formale;
- differenza sostanziale;
- differenza critica;
- APR bloccato;
- pratica non confrontabile;
- possibile errore umano da verificare.

Matteo non è assunto automaticamente come fonte corretta. Quando disponibile, la fonte originaria arbitra il confronto; se APR coincide con la fonte e l'operatore differisce, il caso è marcato come possibile errore umano.

La dashboard espone:

- pratiche totali e completate APR;
- automation rate calcolato sull'intero ingresso;
- blocker rate;
- match rate sui casi confrontabili;
- differenze totali e critiche;
- differenze critiche non intercettate;
- motivi ricorrenti e blocker non ancora coperti;
- copertura per prodotto;
- metriche cumulative e rolling 50/100.

## Gate di avanzamento

Il primo target orientativo resta:

- almeno 400 pratiche, preferibilmente 500, raccolte in circa 2-3 mesi;
- blocker rolling-100 sotto il 15%, con obiettivo successivo sotto il 10%;
- zero differenze critiche non intercettate;
- differenze rilevanti spiegabili e provenienza verificabile;
- nessun valore inventato;
- regressioni automatiche verdi su più prodotti e rivenditori.

Il software può indicare soltanto `candidato al gate ASSISTED`. Non può autorizzare autonomamente `ASSISTED` o `PRODUZIONE`.

## Rischi di falsa sicurezza controllati

- L'automation rate include blocker e non confrontabili: non si migliora escludendo i casi difficili.
- Il confronto usa risultati sigillati indipendenti: APR non può imparare copiando l'operatore.
- Il match umano non basta: le fonti originarie restano il riferimento per l'arbitraggio.
- Un blocker senza codice, motivo e fonte è rifiutato come non informativo.
- Una nuova regola entra nel runtime soltanto dopo test di regressione e verifica del bundle installato.
- La distribuzione per prodotto e rivenditore va sorvegliata per evitare un campione numeroso ma poco rappresentativo.

## Stato dei diversi livelli

- **Test automatici/locali:** il modello shadow, il confronto, le metriche e il checkpoint possono essere collaudati senza sistemi esterni.
- **Test operativo reale:** richiede il collegamento CRM read-only verificato e l'acquisizione separata del risultato umano dopo il sigillo APR.
- **Produzione:** non autorizzata da questo piano.
