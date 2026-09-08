# APR — diagnosi dell'instabilità operativa fra sessioni

Data: 30 agosto 2026. Diagnosi in sola lettura; nessun test e nessuna modifica al runtime.

## Correzione di perimetro

Le bozze multiple sullo stesso SPID TEST sono normali e accettate. Non sono un difetto e non vengono proposte pulizia, consolidamento o prevenzione.

## Verdetto

La causa di fondo non è una singola pratica e non è l'accumulo di bozze. È la combinazione di tre fattori:

1. **I vecchi successi e i test attuali non usano lo stesso contratto di completamento.** Prima del 25 agosto APR poteva marcare una riga annidata come `saved` subito dopo la verifica della superficie della pagina. Dal commit `dfe3274` distingue invece correttamente `staged` da “persistita sul server” e pretende il Salva esterno più la rilettura server.
2. **Il livello operativo browser è stato un bersaglio mobile.** Fra il 18 e il 29 agosto i cinque moduli centrali dell'esecuzione ENEA hanno ricevuto 37 commit; rispetto alla baseline `76598e7`, il diff fino a `b36f99b` è di 1.531 righe aggiunte e 185 rimosse. I tentativi recenti di Ricchi e Righetti hanno usato cinque hash bundle diversi. Non è quindi stato ripetuto lo stesso test sulla stessa versione.
3. **Il gate monotono non copre l'esito operativo L5 sul portale.** Il replay ricostruisce documenti, preflight, routing, stato READY/OPERATOR_REQUIRED/INCONSISTENT e fingerprint del payload; non esegue Chrome, CDP, Salva, remount React né conferma server. Può quindi certificare correttamente L2-L4 mentre una regressione o una race condition L5 resta invisibile.

Il sintomo tecnico cambia perché APR è fail-closed e si ferma sul primo punto non dimostrabile della catena browser. In una sessione il primo segnale incerto è `id-costo`, in un'altra un timeout `Runtime.evaluate`, in un'altra la conferma della riga Schermature. Questi non sono necessariamente difetti indipendenti: appartengono alla stessa famiglia, cioè sincronizzazione CDP/DOM e prova di persistenza server nel livello L5.

## Prova 1 — i vecchi “successi” non sono equivalenti ai test attuali

### Cristina Ricchi

- Sei esecuzioni fra 16 e 18 agosto risultano `saved 10/10`.
- In tutte le sei `postCompletionVerification` è assente.
- Le righe `screening:1..3` risultano direttamente `saved`, senza stato intermedio `staged` e senza la successiva prova del Salva esterno introdotta il 25 agosto.
- Dal 26 agosto i tentativi si fermano dopo 1 o 5 pagine con sintomi diversi, ma tutti nel livello browser/verifica: `id-costo`, timeout `Runtime.evaluate`, esito incerto dopo Salva e intento persistente in attesa di prova server.

Conclusione: i sei successi storici provano che il vecchio worker percorreva il portale, ma non certificano lo stesso contratto di persistenza applicato oggi.

### Zeno Righetti

- Cinque esecuzioni fra 17 e 18 agosto risultano `saved 10/10`, senza `postCompletionVerification`.
- Il vecchio mapping prevedeva soltanto tre righe `screening:1..3`.
- Dal 26 agosto il mapping reale prevede dodici righe `screening:1..12`, quindi 19 pagine/passaggi complessivi.
- I due tentativi più recenti si fermano entrambi su `screening:2` nella stessa famiglia di conferma della persistenza; il precedente si era fermato per connessione CDP chiusa.

Conclusione: i cinque successi storici di Zeno non lavoravano lo stesso carico oggi riconosciuto. Il confronto “prima passava, ora no” non è un replay equivalente.

## Prova 2 — ogni giro recente usa un bundle diverso

Hash worker osservati nelle coorti recenti:

- `60ba60e932ee` — lotto 73, 26 agosto
- `908791c85f44` — lotto 75, 26 agosto
- `e7c86d7b698c` — test storico, 28 agosto
- `a91deb6b3fa7` — global controller, 29 agosto
- `4add68b40212` — replay autonomy30, 29 agosto

Non esiste quindi una serie di ripetizioni Ricchi/Righetti effettuata contro un unico artefatto operativo congelato. Fra un esito e l'altro sono cambiate gestione connessioni CDP, persistenza delle righe annidate, recuperi, timeout, controller globale e sonde brevi.

## Prova 3 — il gate monotono non osserva il browser reale

`aprLearningReplay.ts` esegue acquisizione locale, analisi documenti, preflight comune, preflight Infissi, routing e confronto degli stati/payload. Non avvia L5.

`aprMonotonicLearningGate.ts` rifiuta:

- pratica mancante;
- READY che regredisce localmente;
- nuova INCONSISTENT locale;
- fingerprint del payload READY modificato.

Non possiede invece un campo per:

- bozza realmente completata sul portale;
- pagina realmente persistita;
- timeout o chiusura CDP;
- durata/remount DOM;
- regressione dell'esecuzione browser della stessa pratica.

Per questo il gate può essere verde e il successivo test ENEA può comunque fermarsi.

## Causa comune dei sintomi recenti

La causa comune è **un processo di rilascio che certifica la logica locale ma non congela e non confronta il comportamento operativo L5**. Il portale dinamico introduce variazioni temporali; il codice L5, modificato frequentemente, decide quale variazione tollerare e quale trattare come esito incerto. Senza una baseline operativa ripetibile, ogni correzione può spostare il primo punto di arresto senza che il gate lo consideri regressione.

Questo spiega perché:

- la stessa pratica può arrivare più avanti o meno avanti fra due giri;
- il messaggio tecnico può cambiare;
- una correzione locale passa tutti i test ma non rende stabile il percorso completo;
- le ricorrenze si concentrano sempre nella stessa famiglia browser/persistenza, non nei dati economici già risolti.

## Cosa servirebbe per dimostrare stabilità

Non è una nuova architettura business. Serve una disciplina di verifica operativa:

1. congelare un unico bundle L5;
2. scegliere un piccolo corpus canary fisso comprendente Ricchi e Righetti;
3. eseguirlo più volte con lo stesso bundle e lo stesso contratto di completamento;
4. registrare per ogni pagina prova server, tempi e sintomo;
5. ammettere il bundle successivo soltanto se nessuna canary precedentemente completata regredisce nell'esecuzione reale.

Finché questa prova L5 non entra nel criterio di promozione, il gate monotono protegge correttamente la logica locale ma non può garantire stabilità operativa sul portale.

## Conclusione semplice

APR non sta dimostrando che “la stessa versione oggi fallisce dove ieri riusciva”. Sta confrontando versioni e criteri di successo diversi, mentre il solo livello che continua a cambiare e a produrre sintomi è quello browser. La causa di fondo è quindi il vuoto di certificazione operativa L5, aggravato dall'elevata frequenza di modifiche in quel livello.
