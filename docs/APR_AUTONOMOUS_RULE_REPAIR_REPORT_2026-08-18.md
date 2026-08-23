# APR — report correzione autonoma regole e casi residui

Data: 18 agosto 2026

## Esito

La rilettura locale delle fonti originarie della coorte di confronto ha individuato e corretto quattro difetti riutilizzabili:

1. superficie tecnica troncata a una cifra decimale;
2. cardinalità e attributi contaminati fra gruppi diversi nelle fatture LM Tende;
3. classificazione plurima ricavata dalla sola fascia dei piani nonostante `numero_appartamenti=1`;
4. identità principale del form mantenuta anche quando la fattura ripete un nominativo diverso con lo stesso CF.

Le correzioni sono collegate al registro unico, alla matrice `apr-enea-rule-test-matrix-v28`, al registro `enea-operational-registry-v45` e a bundle persistenti con fingerprint `fb03893c7ac28a6ab4aa62d65b4b392d6ee16c7106dde2facf5019c5106aaab6`.

## Verifica sui dossier originari

Il preflight locale è verde, senza blocker, per:

- Claudio Beghini
- Cristina Ricchi
- Federigo Cileo
- Gianluigi Chiolini, risolto come **Gianluigi Chiolin** per precedenza della fattura sul form a parità di CF
- Luca Callegari
- Massimiliano Gaetano Khemara
- Matteo Maranesi
- Monica Ambra Fioravanti
- Tommaso Cecchi
- Zeno Righetti, con 12 prodotti fisici distinti e unità immobiliare unica

Gianluca Dalle Donne resta escluso dai test futuri su disposizione dell'utente.

## Casi senza metodo automatico

Nessuno fra i dieci dossier riesaminati. Rimane una differenza di benchmark, ma non un blocco: per Matteo Maranesi la fonte originaria non riporta motore o motorizzazione, quindi APR applica `Manuale`; il valore `Automatico` della pratica CRM manuale non è supportato dalle fonti originarie disponibili e non viene copiato.

## Evidenze di qualità

- test mirati identità/edificio/preflight: 66 verdi;
- certificazione completa: 118 file e 797 test verdi;
- typecheck runner: verde;
- hash dei tre bundle installati identici ai bundle certificati;
- nessuna anteprima, submit, ricevuta, email o comunicazione eseguita durante questa correzione.

Il risultato è un aggiornamento del software APR; non costituisce un nuovo test operativo sul portale ENEA né disponibilità in produzione.
