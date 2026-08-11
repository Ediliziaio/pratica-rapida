# CRM Commerciale / Supervisor — protocollo validazione read-only

## Obiettivo

Confrontare la classificazione automatica con clienti reali già conosciuti prima di applicare migration o mostrare suggerimenti agli operatori.

## Regola

Nessuna azione di contatto durante il collaudo. Si osservano soltanto numeri, stato proposto e motivo.

## Campione minimo

Selezionare almeno:

1. un cliente stabile;
2. un cliente chiaramente in crescita;
3. un cliente con calo moderato;
4. un cliente con calo forte / stop recente;
5. un cliente inattivo da oltre 60 giorni;
6. un'azienda registrata senza prima pratica;
7. un cliente con prima pratica negli ultimi 30 giorni;
8. un lead nuovo non ancora contattato;
9. un lead già contattato ma fermo;
10. un lead già in demo/onboarding.

## Confronto per rivenditore

Registrare:

- totale pratiche;
- ultimi 30 giorni;
- 30 giorni precedenti;
- data prima pratica;
- data ultima pratica;
- stato atteso dall'operatore;
- stato proposto dal Supervisor;
- azione suggerita;
- eventuale falso positivo/falso negativo.

## Criteri di stop

Non integrare la UI se:

- un cliente nuovo viene scambiato per crescita matura;
- un cliente stabile genera un sollecito;
- un calo forte non sale tra le priorità;
- le pratiche conteggiate includono record che operativamente non devono rappresentare attività reale;
- le soglie 24h/72h dei lead generano rumore sistematico;
- il suggerimento non spiega con numeri il motivo della priorità.

## Criterio di uscita

Il Supervisor può entrare nella UI solo dopo un campione reale senza errori gravi e dopo revisione delle soglie sui falsi positivi. Anche dopo il collaudo, i contatti commerciali restano soggetti ad approvazione umana.
