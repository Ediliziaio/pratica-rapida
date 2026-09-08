# APR — stato reale del lotto notturno da 50 pratiche

Verifica eseguita il 28/08/2026 alle 09:30 CEST, senza riavviare processi e senza effettuare nuove azioni su ENEA.

## Verdetto

- Totale coorte: **50**
- Bozze ENEA complete, salvate e verificate lato server: **7**
- Pratiche isolate in `OPERATOR_REQUIRED`: **0**
- Pratiche mai iniziate: **43**
- Anteprime, invii e comunicazioni: **0**

Il sequencer generale si è arrestato alle **02:47:11 CEST** con exit code 2, dopo aver registrato 6 risultati. Ha interpretato la temporanea attesa della sessione ENEA di Andrea Trabucco come problema tecnico comune. Questa classificazione era prematura: il worker persistente della coorte di Andrea era già operativo, ha creato la bozza alle 02:47:21 e l'ha completata alle 02:49:27. Il sequencer, essendo già terminato, non ha visto il settimo completamento e non ha avviato le 43 pratiche successive.

Quindi non è stato un blocco della singola pratica Andrea: è un difetto di orchestrazione del lotto. Il sequencer ha arrestato l'intera sequenza su uno stato transitorio mentre il worker sottostante stava avanzando normalmente.

## Stato dei processi alla verifica

- Sequencer `com.praticarapida.apr-night50-sequencer`: **fermo**, una esecuzione, exit code 2.
- Supervisor coorte 109: **attivo**, PID 80732; heartbeat aggiornato.
- Worker coorte 109: **attivo ma IDLE**, PID 80792; coda locale conclusa.
- Watchdog coorte 109: **attivo e IDLE**, PID 80785; coda vuota.
- Dashboard persistente coorte 109: **IDLE — coda vuota**, una bozza salvata, zero casi isolati.

## Bozze complete e salvate

| # | Pratica | ID pratica | Bozza ENEA | Pagine | Verifica server |
|---:|---|---|---:|---:|---|
| 1 | Fabio Sartori | `9b996147-82e1-4438-affe-9fcec062c003` | 438757 | 8/8 | presente |
| 2 | Tommasina Desando | `74f56c0b-e813-4c1a-9858-e9181c35269d` | 438758 | 8/8 | presente |
| 3 | Luigi Carfora | `0572b6a4-a44d-4f13-8fad-d8e91fc5c91d` | 438759 | 8/8 | presente |
| 4 | Noemi Fumagalli | `3c65af8b-00ad-43df-bc32-63d6620d3cbc` | 438760 | 8/8 | presente |
| 5 | Tommaso Cecchi | `c2c09108-de47-48b7-bd4f-c5896c935def` | 438761 | 8/8 | presente |
| 6 | Alessandra Vacca | `f749871b-18f1-4f9f-986f-2614626ee12d` | 438764 | 11/11 | presente |
| 7 | Andrea Trabucco | `fe20bff9-ded6-4380-9452-e20c4410a0c7` | 438767 | 8/8 | presente |

Per tutte e sette risultano: stato `saved`, tutte le pagine previste completate, evento finale `draft_saved` e prova di lettura/verifica completa lato server.

## Pratiche mai iniziate

1. Angelina Stricelli
2. Betti Boato
3. Elena Depalma
4. Fabrizio Ceci
5. Giuseppe Bonaventura
6. Marco Dall'Ara
7. Orietta Artuso
8. Pieraldo Casini
9. Eugenio Codognato
10. Roberto Marcello
11. Kitenge Ebambi
12. Besenval Fortunato
13. Armando Ranzoni
14. Sabrina Eustomi
15. Vera Buracchi
16. Mara Elena Maddiotto
17. Luca Cigognetti
18. Marco Colombo
19. Barbara Melis
20. Cesare Imperiali
21. Flavia Cipriani
22. Eleonora Meggiarin
23. Luca Callegari
24. Zeno Righetti
25. Lucia Lagrasta
26. Emanuela Parolo
27. Milena Albertoni
28. Cristina Ricchi
29. Cristina Dassi
30. Amelia Lerose
31. Francesco Fumagalli
32. Giovanni Pescatori
33. Caterina Claudia Garbato
34. Marco Tocchetti
35. Daniela Guidotti
36. Massimiliano Gaetano Khemara
37. Milena Fiorini
38. Claudio Beghini
39. Danila Serpa
40. Mario Donnarumma
41. Gabriella Bruno
42. Maria Sofia Tosatti
43. Fares Hassairi

## Prove indipendenti usate

1. `launchctl`: stato reale di sequencer, supervisor, worker e watchdog.
2. Checkpoint e journal persistenti: orari, transizioni, bozze, pagine e stato terminale.
3. Audit CDP/server e dashboard persistente: una verifica completa server per ciascuna delle sette bozze; dashboard finale della coorte 109 in `IDLE`.

Il report originario del sequencer, fermo a 6 risultati, è conservato come evidenza storica ma non rappresenta lo stato reale finale: non include Andrea Trabucco, completata dal worker dopo l'uscita prematura del sequencer.
