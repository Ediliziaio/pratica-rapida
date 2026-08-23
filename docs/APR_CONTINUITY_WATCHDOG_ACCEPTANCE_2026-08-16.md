# APR — collaudo locale di continuità e watchdog (2026-08-16)

## Ambito certificato

Il collaudo certifica il runtime locale persistente APR. Non certifica ancora
un batch reale su CRM o portale ENEA e non ha eseguito preview, submit,
ricevute, email o comunicazioni.

## Risultato

- 64 test automatici pertinenti verdi su 64.
- Typecheck del runner verde.
- Due pratiche simulate elaborate in sequenza dall'identità
  `apr_browser_worker`, con crash tra le fasi e ripresa senza perdita o
  duplicazione.
- Un blocco per-pratica simulato è stato isolato come intervento operatore; la
  pratica successiva è stata completata.
- Il watchdog installato ha rilevato un preflight artificiosamente fermo da
  oltre cinque minuti, richiesto un solo riavvio del supervisore e verificato
  il passaggio PID `57562 -> 57886` con `recoveryCount = 1` nella fixture.
- Il watchdog installato ha rilevato un worker artificiosamente assente,
  richiesto un solo riavvio e verificato il PID `999999 -> 58010` con
  `recoveryCount = 1` nella fixture.
- Supervisore, worker e watchdog sono stati riavviati e hanno ripreso dai
  rispettivi checkpoint.
- Gli hash dei quattro checkpoint operativi sono rimasti invariati prima e
  dopo i riavvii:

  - acquisizione CRM: `fde1b80f54c19fec96a3455a25bc1a738fafdc8e1943a410f3394fd7b6a5cba3`
  - allegati originari: `4679fceafa7e610002f336df055edcf64240712d899eb1e18e9e3ed9eea3ba1b`
  - preflight locale: `cf40bfe3ebbcac98f9b0e42ef772fcdbf4fb075aa30b097f3618544c5982c55b`
  - piano bozza ENEA: `656ae1f84d2455daafb733fe00b518886a83a8da44797234533621e208072cc7`

## Installazione verificata

- Dashboard: `http://127.0.0.1:4465/`
- Stato: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-32`
- LaunchAgent supervisore: `com.praticarapida.apr-enea-cohort32-supervisor`
- LaunchAgent worker: `com.praticarapida.apr-enea-cohort32-worker`
- LaunchAgent watchdog: `com.praticarapida.apr-enea-cohort32-watchdog`
- Tutti e tre risultano `running`, `RunAtLoad = true` e `KeepAlive = true`.
- Il checkpoint pubblico attuale è `OPERATOR_REQUIRED`: la coda storica non
  contiene casi eseguibili e conserva sei blocchi per-pratica. Non viene quindi
  dichiarato falsamente `WORKING`.

## Hash dei bundle installati

- supervisore: `2b337746b3aaa65c1258ab9008946fcdc4d3c8e45c012ed4f9af678f3744f5e2`
- worker: `2a5d48a9ef6a1364023531a7d8871693c7fb836aad382642adeece5246429f52`
- watchdog: `7ca19d24e433241d508b3961bcb5d1868fc44fe9a70d23bbd166b0be7ed18d1e`

## Limiti residui reali

1. È verde il collaudo locale/simulato; non è ancora stato eseguito il
   collaudo di due pratiche reali consecutive sul portale ENEA.
2. I LaunchAgent utente partono dopo il login macOS, non prima.
3. La sessione ENEA dipende dalla validità SPID lato server. Il keepalive può
   soltanto preservare una sessione valida con letture innocue; non può evitare
   una scadenza o revoca imposta dal portale.
4. Il successo reale della fase bozza richiederà prova server della stessa
   bozza salvata. Preview e submit restano disabilitati.
