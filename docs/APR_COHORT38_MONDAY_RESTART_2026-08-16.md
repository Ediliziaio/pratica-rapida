# APR cohort38 — prova di ripartenza da zero

La coorte è composta da dieci pratiche lette dalla pipeline CRM `Archiviate`
con `brand=enea` e prodotto esplicito `Schermature Solari`. La selezione è
stata eseguita dal componente APR in sola lettura, con risposta sorgente
identificata dallo SHA-256
`ce023e259454f4b2bc526152904a5a4f125e87184e49d726cf1fab71d2755537`.

Vincoli della prova:

- esecutore delle pratiche: solo runtime persistente APR;
- dieci casi in sequenza, lock e checkpoint prima di ogni azione;
- un blocco per-pratica passa a `Richiesto intervento operatore` e non ferma
  la coda;
- stop alla bozza ENEA completa e salvata;
- anteprima, submit, ricevute, email e comunicazioni restano vietati;
- Beatrice Ciotta e tutti i clienti con una bozza APR precedente sono esclusi;
- prima del riavvio la coorte resta congelata: nessun dossier viene acquisito
  e nessuna azione ENEA viene eseguita.

La fonte versionata della coda è
`config/apr/cohort38-ten-archived-screenings.json`; la prova CRM completa resta
nel checkpoint persistente `archived-screening-discovery/checkpoint.json`.
