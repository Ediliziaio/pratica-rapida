# APR SHADOW — Gate 1 locale e runtime persistente

Data: 2026-08-18

## Esito

Il modello operativo SHADOW è stato aggiunto senza ricostruire APR e senza modificare CRM o ENEA.

Sono attivi nel runtime persistente:

- separazione `MATTEO = produzione reale` / `APR = produzione shadow`;
- sigillo immutabile del risultato APR prima del rilascio del risultato umano;
- checkpoint idempotente e riprendibile;
- confronto campo per campo con arbitraggio tramite fonte originaria;
- categorie complete di match, differenze, blocker e possibile errore umano;
- metriche cumulative e rolling 50/100;
- report giornaliero automatico e idempotente alle 19:00 Europe/Rome;
- gate produzione sempre chiuso.

## Verifiche

1. **Codice e regressioni**
   - typecheck runner: verde;
   - modello/checkpoint SHADOW: 10/10 test verdi;
   - dashboard HTTP: 9/9 test verdi;
   - set di regressione APR correlato: 149/149 verde;
   - build applicazione: verde.
2. **Bundle persistenti**
   - supervisor SHA-256 `ceaadd463c785b7929d228d0b68e7683ed9142c4b896e362500c15b8c6885eb2`;
   - worker SHA-256 `787d864af77c149e686e0f630bccbc0790a49b0004435c8cd5265d37961bab7c`;
   - watchdog SHA-256 `8c6d8808174b1cb1159756feda4263feb9f1edad89f018630d7a94b58f940ed4`;
   - SHA costruiti e installati identici.
3. **Runtime**
   - supervisor, worker e watchdog LaunchAgent `cohort52` attivi dopo riavvio controllato;
   - checkpoint `shadow-comparison` persistente con audit e ID regola;
   - dashboard `http://127.0.0.1:4483/` raggiungibile;
   - API `/api/shadow-comparison` espone fase `SHADOW`, produzione non autorizzata e campione `0/400`;
   - primo report giornaliero persistente creato senza pratiche e senza azioni esterne.

## Limiti reali

- Il motore SHADOW è installato, ma non ha ancora acquisito pratiche reali: campione 0/400.
- Il collegamento CRM resta GET/read-only e non alimenta ancora automaticamente il nuovo store con coppie APR/Matteo.
- Il confronto operativo reale e il collaudo CI completo della baseline schermature restano il prossimo gate.
- VEPA è soltanto il prossimo modulo pianificato: non è ancora abilitato shadow.
- Preview, submit, ricevute, comunicazioni e produzione restano vietati.
