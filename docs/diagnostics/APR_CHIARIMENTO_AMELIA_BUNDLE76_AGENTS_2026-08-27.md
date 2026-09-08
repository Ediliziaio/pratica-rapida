# APR — chiarimento Amelia, bundle canonico 76 e modifica AGENTS.md

Il chiarimento è questo: `47c00c4` ha corretto la sicurezza, non il resolver. Definirlo “correzione del caso Amelia” senza questa distinzione era fuorviante.

## Cosa copriva davvero `47c00c4`

Il commit ha aggiunto una guardia fail-closed:

```ts
if (resolvedFamily !== "zanzariera"
    || input.materialSource !== "authorized_fallback") return null;

if (input.material.trim().toLocaleLowerCase("it-IT") === "misto") return null;

// altrimenti genera screening_fallback_material_category_conflict_N
```

Quindi:

- se il resolver produce `Misto`, la pratica può proseguire;
- se una riga riconosciuta come zanzariera riceve un fallback diverso, APR blocca il payload;
- il commit non cambia `Tessuto` in `Misto`;
- non modifica `resolveProductTechnicalAttributes()`.

Anche i test del commit lo dimostrano:

- test positivo: passa direttamente alla guardia un materiale già valorizzato `Misto`;
- test negativo: passa descrizione generica, tipo dichiarato `altra schermatura solare` e materiale `Tessuto`; il risultato atteso è esplicitamente il blocco.

## Perché Amelia presenta ancora tre conflitti

Le fonti di Amelia producono:

- form: un gruppo `tipo_prodotto: "altro"`;
- fattura: tre prodotti descritti genericamente come `Schermatura solare MOBILE`;
- tre righe fisiche correttamente conservate.

Il percorso è questo:

1. Il resolver del materiale legge `Schermatura solare MOBILE`.
2. Non trova la parola `zanzariera` né un materiale esplicito.
3. La vecchia logica cade sul fallback generico `Tessuto`.
4. Successivamente il mapping form riconosce `altro` come famiglia zanzariera.
5. La guardia introdotta da `47c00c4` rileva correttamente: categoria zanzariera + fallback `Tessuto`.
6. Genera tre blocker, uno per ciascuna riga.

Non si tratta quindi di:

- correzione non installata;
- correzione sovrascritta;
- percorso parzialmente coperto accidentalmente.

È un pezzo deliberatamente non implementato: la famiglia risolta attraverso fattura + form non viene ancora passata al resolver del materiale prima che questo scelga il fallback.

`git blame` conferma inoltre:

- resolver del materiale: ancora proveniente da `76598e7`;
- guardia e sua integrazione: `47c00c4`;
- i commit successivi hanno modificato soltanto scadenze e suffissi delle fatture, non questa logica.

La futura correzione generale dovrebbe quindi far usare al resolver la famiglia già riconciliata: se la famiglia finale è zanzariera e non esiste un materiale esplicito contrario, il fallback deve essere `Misto`. La guardia di sicurezza deve comunque restare. Non è stata implementata alcuna correzione: resta sospesa.

## Diff esatto di `AGENTS.md`

Non è stato eseguito alcun commit.

```diff
diff --git a/AGENTS.md b/AGENTS.md
index 198bcc9..7a19717 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -32,3 +32,10 @@ Questa regola si applica a tutte le future attività e chat che operano in quest
 - Il nome del cliente può apparire soltanto come fixture di regressione: il comportamento applicativo non deve dipendere dal cliente, dalla pratica o dalla coorte.
 - Dopo ogni correzione, rieseguire il caso dal checkpoint con APR e verificare stato, `report.blockers` e `/api/case-truth`; una correzione soltanto documentata o discussa non è una regola attiva.
 - Gli override caso-specifici devono essere auditati come non propagabili e non possono diventare fallback generali.
+
+# Regola permanente di autorizzazione dei test ENEA
+
+- La prima trasmissione al portale ENEA TEST dei dati di una pratica o di una coorte richiede conferma esplicita dell'utente immediatamente prima dell'avvio operativo.
+- Il rilancio dello stesso identico insieme di pratiche già autorizzato non richiede una nuova conferma: APR può ripeterlo direttamente per verificare nuove regole o correzioni, conservando identità della coorte, audit e idempotenza.
+- L'aggiunta anche di una sola pratica mai trasmessa prima rende il nuovo insieme non già autorizzato e richiede una nuova conferma esplicita prima della trasmissione.
+- L'autorizzazione al test consente esclusivamente creazione, compilazione e salvataggio di bozze TEST; anteprima, invio, protocollazione, ricevute, email e comunicazioni restano vietati salvo mandato futuro distinto.
```

## Bundle canonico 76

La designazione autorizzata è stata completata:

- puntatore: `canonical-bundle/current`;
- destinazione: `../cohorts/apr-pilot-76-night-new-balanced-10/install`;
- ricevuta: stato `PASS`;
- artifact ID: `66ccc2fbecd4ca2950feaee2276f442fdafe5c2dbdf141ade0bcee3f68588016`;
- commit/runtime: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`.

Tre verifiche concordano:

1. il collegamento punta esattamente alla coorte 76;
2. i tre hash riletti attraverso il puntatore coincidono con supervisor, worker e watchdog della coorte;
3. ricevuta e puntatore `latest-receipts` concordano su artifact, target e stato.

Nessun bundle è stato copiato o installato. Nessun servizio è stato avviato: i tre LaunchAgent della coorte 76 non risultano caricati, la porta 4501 non ascolta e il checkpoint supervisor resta `stopped`.
