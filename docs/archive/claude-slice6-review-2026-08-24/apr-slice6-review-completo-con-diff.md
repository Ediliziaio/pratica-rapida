Agisci come revisore tecnico rigoroso dell’architettura monotona APR. Non hai accesso al repository né a Internet: devi basarti esclusivamente sulle informazioni e sui dieci diff Git reali riportati integralmente in fondo a questo stesso testo. Non proporre teoria generica e non riscrivere il progetto da zero. Analizza il codice effettivamente implementato e segnala difetti concreti con file, funzione, scenario di fallimento, gravità e correzione minima consigliata.

CONTESTO

APR è un runner persistente destinato, in futuro, a elaborare pratiche CRM e creare bozze sul portale ENEA. Questa revisione riguarda esclusivamente l’architettura tecnica monotona che governa verifica, promozione e attivazione dei bundle APR.

Lo Slice 6 collega la promozione verificata dello Slice 5 alla futura attivazione dei servizi APR, introducendo:

- preparazione controllata dei plist;
- staging separato;
- attivazione atomica simulata;
- health gate bloccante;
- rollback verificato;
- recovery dopo crash;
- ricevuta immutabile di attivazione;
- idempotenza;
- durabilità dei checkpoint transazionali.

VINCOLI DELLO SLICE 6

Durante lo sviluppo non sono stati usati:

- CRM reale;
- ENEA reale;
- browser;
- SPID;
- dati personali;
- preview;
- submit;
- email o comunicazioni;
- LaunchAgent o launchctl reali;
- modifiche alle regole business;
- modifiche a `/api/case-truth`;
- modifiche alla dashboard.

L’attivazione dei processi è rappresentata da un’interfaccia astratta con controller simulato. L’integrazione reale con launchctl resta intenzionalmente fuori dallo Slice 6.

BASELINE PRECEDENTE

Le ultime due correzioni dello Slice 5 risultavano già applicate e verificate prima dello Slice 6:

- `b715c8d` — receipt di promozione per singolo tentativo, con possibilità di retry dopo una receipt FAIL;
- `4f5d01f` — `testFileRef` reso un percorso relativo alla repository root, normalizzato e univoco.

I commit precedenti non sono stati modificati o sottoposti ad amend.

COMMIT DELLO SLICE 6

1. `0e39ab423389e4fd4790086d6b2e4342b849f865`
   Collega la promozione verificata ai plist APR.

2. `4d1f20ba8e659a1689e689e96f5bde44f35b8786`
   Verifica i plist sui bundle promossi APR.

3. `c683702c15c05fc77e4b121019ec8b0e4c4a196f`
   Attiva atomicamente i servizi APR simulati.

4. `9ebd90de4ce38b09fce6be53135119b53548543f`
   Blocca l’attivazione APR sul health gate.

5. `a114ab506156aba8dd083d69d6727fd341b8ca92`
   Ripristina APR dopo un health gate fallito.

6. `ccfce1d5d585f47b7b14d991efb28c5ddd91c475`
   Riprende l’attivazione APR dopo crash.

7. `49f42b88710eb39d9e4efc06627e8df107be3ee7`
   Registra la ricevuta di attivazione APR.

8. `aa77f5dea484848ac40fe514f53566722dfa03d7`
   Completa le receipt APR dopo recovery.

9. `2383516bb2494e5fdc36e1cca852142dc1e7b7ba`
   Vincola e rende durevole l’attivazione APR.

10. `5a0fdff`
    Vincola il health gate APR a una finestra temporale esplicita.

I primi sette commit corrispondono ai blocchi richiesti dallo Slice 6. Gli ultimi tre sono correzioni di hardening emerse durante la verifica e sono stati mantenuti separati per rendere la cronologia auditabile.

COMPORTAMENTO IMPLEMENTATO

1. PREPARAZIONE CONTROLLATA

`prepareVerifiedAprCohortLaunchAgents()` accetta esclusivamente:

- una guardia realmente emessa da `guardAprInstallation()`;
- una receipt di promozione immutabile e verificabile;
- una receipt con stato PASS;
- una receipt riferita allo stesso certificato verificato dalla guardia.

Una guardia ricostruita manualmente viene rifiutata tramite `WeakSet`. Una preparazione plist non emessa dal percorso verificato viene rifiutata tramite `WeakMap`.

2. BUNDLE PROMOSSO E PLIST

La funzione:

- legge il puntatore attivo della promozione;
- verifica che sia un symlink;
- verifica che il target coincida con `receipt.payload.activeTarget`;
- risolve i bundle installati per supervisor, worker e watchdog;
- genera i plist in una directory di staging;
- verifica testualmente che ogni plist contenga il percorso effettivo del bundle previsto per il proprio ruolo.

3. ATTIVAZIONE SIMULATA

`activatePreparedAprServices()`:

- accetta soltanto una preparazione verificata;
- verifica il legame fra preparazione, receipt e versione promossa;
- valida `activationId`;
- copia atomicamente i plist in una directory versionata;
- confronta gli SHA-256 dopo la copia;
- aggiorna un puntatore `current`;
- persiste una transazione prima dell’attivazione;
- usa esclusivamente `AprServiceController`, interfaccia astratta e simulata;
- non chiama launchctl.

4. HEALTH GATE

Il health gate verifica per supervisor, worker e watchdog:

- PID presente e positivo;
- heartbeat successivo all’inizio dell’attivazione;
- heartbeat entro `healthDeadlineAt`;
- heartbeat più recente dell’eventuale baseline;
- checkpoint avanzato;
- percorso bundle esattamente uguale a quello atteso;
- presenza della versione promossa nel percorso;
- dashboard raggiungibile.

Un solo controllo fallito produce stato FAIL, non un warning.

La finestra predefinita è 30 secondi. Una finestra nulla, negativa o non finita viene rifiutata.

5. ROLLBACK

Se il health gate fallisce:

- viene registrata la fase `ROLLING_BACK`;
- viene ripristinato il puntatore dei bundle precedente;
- viene ripristinato il puntatore dei plist precedente;
- viene invocato il rollback del controller simulato;
- vengono verificati entrambi i puntatori;
- una verifica incompleta produce errore;
- viene emessa una receipt FAIL con motivazioni e stato del rollback.

6. RECOVERY

La transazione persistente usa le fasi:

- `POINTER_SWITCHED`;
- `ROLLING_BACK`;
- `COMPLETE`.

Il recovery legge lo stato dal disco e:

- completa un’attivazione interrotta dopo lo spostamento del puntatore;
- completa il rollback interrotto;
- scrive la receipt mancante;
- porta la transazione a `COMPLETE`;
- su invocazioni successive risponde in modo idempotente;
- evita una seconda attivazione o un secondo rollback già completati.

I file di transazione vengono scritti con file temporaneo, `fsync`, rename atomico e `fsync` della directory. Anche gli aggiornamenti dei symlink eseguono il `fsync` della directory.

7. RECEIPT DI ATTIVAZIONE

La receipt contiene nel payload canonico:

- `activationId`;
- `promotionReceiptId`;
- timestamp;
- commit Git;
- revisione runtime;
- stato PASS/FAIL;
- risultato del health gate per ogni ruolo;
- PID osservato;
- avanzamento heartbeat;
- avanzamento checkpoint;
- corrispondenza del bundle;
- stato dashboard;
- motivazioni;
- rollback eseguito e verificato.

I percorsi assoluti sono confinati nei metadata locali, esclusi dal payload hashato.

La receipt è append-only: se il file esiste con contenuto differente viene generata una collisione esplicita. Se il contenuto è identico, viene restituita quella esistente.

TEST ESEGUITI

1. Typecheck runner ENEA/APR:
   PASS.

2. Suite architettura monotona Slice 1–6:
   11 file PASS;
   62 test su 62 PASS.

3. Suite Infissi:
   14 file PASS;
   90 test su 90 PASS.

4. Suite correlate e dashboard:
   8 file PASS;
   103 test su 103 PASS.

5. Build Vite:
   PASS.

6. `git diff --check`:
   PASS.

7. Working tree:
   pulito.

La suite monolitica globale conserva un precedente open handle che impedisce l’uscita regolare del comando unico. Le suite pertinenti richieste sono state eseguite separatamente e risultano tutte verdi. Questo limite non deve essere nascosto, ma non va confuso con un fallimento delle suite sopra elencate.

DIFF GIT REALI INCLUSI IN QUESTO TESTO

Le dieci patch riportate integralmente dopo le istruzioni corrispondono esattamente ai dieci commit:

- `0001-Collega-la-promozione-verificata-ai-plist-APR.patch`
- `0002-Verifica-i-plist-sui-bundle-promossi-APR.patch`
- `0003-Attiva-atomicamente-i-servizi-APR-simulati.patch`
- `0004-Blocca-l-attivazione-APR-sul-health-gate.patch`
- `0005-Ripristina-APR-dopo-un-health-gate-fallito.patch`
- `0006-Riprende-l-attivazione-APR-dopo-crash.patch`
- `0007-Registra-la-ricevuta-di-attivazione-APR.patch`
- `0008-Completa-le-receipt-APR-dopo-recovery.patch`
- `0009-Vincola-e-rende-durevole-l-attivazione-APR.patch`
- `0010-Vincola-il-health-gate-APR-alla-finestra-temporale.patch`

LIMITI RESIDUI DICHIARATI

- Non esiste ancora un’implementazione reale di `AprServiceController` basata su launchctl.
- I plist vengono preparati e attivati soltanto in fixture locali.
- Non vengono installati in `~/Library/LaunchAgents`.
- Non vengono caricati o riavviati servizi reali.
- Le osservazioni reali di PID, heartbeat, checkpoint, dashboard e percorso eseguibile devono essere implementate nel futuro adapter di sistema.
- `/api/case-truth` non è stato sostituito.
- La logica business non è stata riaperta.
- CRM, ENEA e browser non sono stati usati.
- L’open handle della suite monolitica globale resta da diagnosticare separatamente.

REVISIONE RICHIESTA

Esamina tutti i dieci patch reali e rispondi esclusivamente con una revisione tecnica concreta.

Controlla almeno:

1. Se la guardia basata su WeakSet/WeakMap impedisce davvero preparazioni o installazioni non autorizzate, oppure può essere aggirata accidentalmente.

2. Se il binding tra:
   - certificato;
   - installation guard;
   - promotion receipt;
   - versionId;
   - preparazione plist;
   - activationId;
   è completo e non consente di combinare artefatti appartenenti a promozioni differenti.

3. Se la verifica del puntatore attivo e dei bundle installati è resistente a:
   - symlink alterati;
   - path traversal;
   - sostituzione del target;
   - TOCTOU;
   - bundle cambiato dopo la preparazione dei plist.

4. Se l’installazione atomica dei plist è realmente durevole e se manca qualche `fsync`, verifica post-rename o controllo di permessi.

5. Se esistono finestre di crash non coperte:
   - prima della transazione;
   - dopo la copia dei plist;
   - durante lo spostamento del puntatore;
   - dopo l’attivazione ma prima della receipt;
   - dopo la receipt ma prima della transazione COMPLETE;
   - durante il rollback;
   - dopo il rollback ma prima della receipt FAIL.

6. Se il recovery può:
   - attivare due volte un processo;
   - ripetere un rollback;
   - produrre receipt incoerenti;
   - lasciare puntatori intermedi;
   - dichiarare COMPLETE uno stato non realmente verificato.

7. Se il health gate è abbastanza rigoroso:
   - verifica PID coerente con il processo appena attivato;
   - heartbeat realmente nuovo;
   - deadline temporale valida;
   - checkpoint realmente successivo;
   - dashboard della versione corretta;
   - bundle realmente eseguito e non soltanto percorso dichiarato dal controller.

8. Se la receipt di attivazione è:
   - canonica;
   - immutabile;
   - portabile;
   - sufficientemente legata alla promotion receipt;
   - resistente a collisioni;
   - corretta anche dopo recovery.

9. Se l’idempotenza basata sul solo `activationId` può restituire una receipt appartenente a una promozione o versione differente.

10. Se i test coprono realmente tutti i requisiti minimi oppure esistono percorsi importanti non verificati.

FORMATO OBBLIGATORIO DELLA RISPOSTA

A. VERDETTO

Usa uno solo di questi valori:

- APPROVATO;
- APPROVATO CON CORREZIONI NON BLOCCANTI;
- BLOCCATO PRIMA DELLO SLICE SUCCESSIVO.

B. DIFETTI CONCRETI

Per ogni difetto indica:

- gravità: CRITICO, ALTO, MEDIO o BASSO;
- patch/file coinvolto;
- funzione o punto preciso;
- scenario riproducibile;
- conseguenza;
- correzione minima consigliata;
- test automatico da aggiungere.

C. REQUISITI MANCANTI

Elenca soltanto requisiti realmente assenti o implementati in modo insufficiente, distinguendo:

- necessari prima dello slice successivo;
- rinviabili all’adapter launchctl reale.

D. VALUTAZIONE DEI TEST

Indica quali test sono solidi, quali sono troppo accorpati e quali casi negativi mancano.

E. PROSSIMO PASSO

Se il verdetto è BLOCCATO, prepara un unico prompt operativo completo per Codex che richieda esclusivamente le correzioni indispensabili, un commit separato per ciascuna correzione e i relativi diff reali.

Se il verdetto è APPROVATO, indica quale dovrebbe essere lo Slice 7 minimo, senza introdurre regole business e senza attivare servizi reali.

Non accettare dichiarazioni non dimostrate dai diff. Non proporre modifiche estetiche o refactoring generico. Dai priorità ad atomicità, binding crittografico, idempotenza, recovery, durabilità e impossibilità di attivare un bundle diverso da quello certificato.

---

# INIZIO DEI DIECI DIFF GIT REALI

From 0e39ab423389e4fd4790086d6b2e4342b849f865 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:41:37 +0200
Subject: [PATCH 01/10] Collega la promozione verificata ai plist APR

---
 .../aprCohortLaunchAgents.ts                  | 22 +++++++++++++++++++
 .../aprPreDeployVerification.test.ts          | 15 +++++++++++++
 .../aprPreDeployVerification.ts               | 17 ++++++++++++--
 3 files changed, 52 insertions(+), 2 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
index 2065804..690e819 100644
--- a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
+++ b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
@@ -1,5 +1,8 @@
 import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, accessSync } from "node:fs";
 import path from "node:path";
+import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
+import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
+import { assertAprInstallationGuard, type AprInstallationGuard } from "./aprPreDeployVerification";
 
 export interface AprCohortLaunchAgentOptions {
   cohortNumber: number;
@@ -72,3 +75,22 @@ export function prepareAprCohortLaunchAgents(options: AprCohortLaunchAgentOption
   });
   return { cohortNumber: options.cohortNumber, dashboardUrl: `http://127.0.0.1:${options.dashboardPort}/`, entries, ready: true, loadPerformed: false };
 }
+
+export interface AprVerifiedCohortLaunchAgentOptions extends Omit<AprCohortLaunchAgentOptions, "supervisorBundle" | "workerBundle" | "watchdogBundle"> {}
+
+export function prepareVerifiedAprCohortLaunchAgents(guard: AprInstallationGuard, receipt: AprBundlePromotionReceipt, options: AprVerifiedCohortLaunchAgentOptions) {
+  assertAprInstallationGuard(guard);
+  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_cohort_launch_agent_promotion_receipt_invalid");
+  if (receipt.payload.status !== "PASS") throw new Error("apr_cohort_launch_agent_promotion_receipt_not_pass");
+  if (receipt.payload.preDeployCertificateId !== guard.certificateArtifactId) throw new Error("apr_cohort_launch_agent_certificate_mismatch");
+  if (!receipt.localMetadata?.promotionRoot) throw new Error("apr_cohort_launch_agent_promotion_root_missing");
+  const bundleByRole = new Map(receipt.payload.bundles.map((bundle) => [bundle.role, bundle]));
+  for (const role of ["supervisor", "worker", "watchdog"] as const) if (!bundleByRole.has(role)) throw new Error(`apr_cohort_launch_agent_bundle_missing:${role}`);
+  const activeDirectory = path.join(receipt.localMetadata.promotionRoot, "current");
+  return prepareAprCohortLaunchAgents({
+    ...options,
+    supervisorBundle: path.join(activeDirectory, bundleByRole.get("supervisor")!.installedRef),
+    workerBundle: path.join(activeDirectory, bundleByRole.get("worker")!.installedRef),
+    watchdogBundle: path.join(activeDirectory, bundleByRole.get("watchdog")!.installedRef),
+  });
+}
diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index f1ba68b..d52fcd1 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -12,6 +12,7 @@ import { createAprPersistedTestRunReport, createAprRuleTestEvidenceManifest, Per
 import { createAprMonotonicPreDeployCertificate, persistAprMonotonicPreDeployCertificate } from "./aprPreDeployCertificate";
 import { guardAprInstallation, verifyAprStagingImmediatelyBeforePromotion, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
 import { promoteAprBundles, recoverAprBundlePromotion } from "./aprBundlePromotion";
+import { prepareVerifiedAprCohortLaunchAgents } from "./aprCohortLaunchAgents";
 
 const sha = (character: string) => character.repeat(64);
 const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
@@ -113,6 +114,20 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     expect(promoted.receipt.payload.status).toBe("PASS");
   });
 
+  it("prepara i plist soltanto con guardia emessa e receipt PASS dello stesso certificato", () => {
+    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
+    const promoted = promoteAprBundles(verified, { attemptId: "guarded-plist" });
+    const options = { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 };
+    const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, options);
+    expect(prepared).toMatchObject({ ready: true, loadPerformed: false }); expect(prepared.entries).toHaveLength(3);
+    const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
+    expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
+    const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
+    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), failedReceipt, { ...options, installDirectory: path.join(value.root, "failed") })).toThrow(/receipt_not_pass/);
+    const mismatchedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "mismatched-receipt", preDeployCertificateId: sha("9") }, promoted.receipt.localMetadata);
+    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), mismatchedReceipt, { ...options, installDirectory: path.join(value.root, "mismatched") })).toThrow(/certificate_mismatch/);
+  });
+
   it("non sposta il puntatore attivo se un hash post-copy non coincide", () => {
     const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
     expect(() => promoteAprBundles(verified, { attemptId: "failed-copy", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.ts
index 650347e..07ad795 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.ts
@@ -10,6 +10,7 @@ import type { AprPersistentReplayDifferential } from "./aprPersistentReplayDiffe
 
 export const APR_PREDEPLOY_VERIFICATION_VERSION = "apr-predeploy-verification-v1" as const;
 const verifiedResults = new WeakSet<object>();
+const installationGuards = new WeakSet<object>();
 const SHA256 = /^[a-f0-9]{64}$/;
 
 function verifyBaselineFromDisk(certificate: AprMonotonicPreDeployCertificate) {
@@ -71,9 +72,21 @@ export function verifyPreDeployCertificate(certificatePath: string, options: { r
   return result;
 }
 
-export function guardAprInstallation(verification: AprVerifiedPreDeployCertificate) {
+export interface AprInstallationGuard {
+  allowed: true;
+  certificateArtifactId: string;
+  verifiedAt: string;
+}
+
+export function guardAprInstallation(verification: AprVerifiedPreDeployCertificate): AprInstallationGuard {
   if (!verification || verification.status !== "VERIFIED_PASS" || !verifiedResults.has(verification)) throw new Error("apr_installation_guard_unverified_certificate");
-  return { allowed: true as const, certificateArtifactId: verification.certificateArtifactId, verifiedAt: verification.verifiedAt };
+  const guard = { allowed: true as const, certificateArtifactId: verification.certificateArtifactId, verifiedAt: verification.verifiedAt };
+  installationGuards.add(guard);
+  return guard;
+}
+
+export function assertAprInstallationGuard(guard: AprInstallationGuard) {
+  if (!guard || guard.allowed !== true || !installationGuards.has(guard)) throw new Error("apr_installation_guard_not_issued");
 }
 
 export function verifyAprStagingImmediatelyBeforePromotion(verification: AprVerifiedPreDeployCertificate) {
-- 
2.50.1 (Apple Git-155)


From 4d1f20ba8e659a1689e689e96f5bde44f35b8786 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:42:24 +0200
Subject: [PATCH 02/10] Verifica i plist sui bundle promossi APR

---
 .../enea-shadow-runner/aprCohortLaunchAgents.ts  | 16 ++++++++++------
 .../aprPreDeployVerification.test.ts             |  5 +++++
 2 files changed, 15 insertions(+), 6 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
index 690e819..4ff9a96 100644
--- a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
+++ b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
@@ -1,4 +1,4 @@
-import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, accessSync } from "node:fs";
+import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, writeFileSync, accessSync } from "node:fs";
 import path from "node:path";
 import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
@@ -70,8 +70,8 @@ export function prepareAprCohortLaunchAgents(options: AprCohortLaunchAgentOption
     const contents = plist(entry.label, entry.args, path.dirname(options.supervisorBundle), path.join(logs, `${entry.role}.stdout.log`), path.join(logs, `${entry.role}.stderr.log`));
     if (!existsSync(target) || readFileSync(target, "utf8") !== contents) atomicWrite(target, contents);
     const persisted = readFileSync(target, "utf8");
-    if (!persisted.includes(`<string>${entry.label}</string>`) || !persisted.includes("<key>RunAtLoad</key><true/>") || !persisted.includes("<key>KeepAlive</key><true/>") || persisted.includes("{{")) throw new Error(`apr_cohort_launch_agent_verification_failed:${entry.role}`);
-    return { ...entry, path: target };
+    if (!persisted.includes(`<string>${entry.label}</string>`) || !persisted.includes(`<string>${xml(entry.args[1])}</string>`) || !persisted.includes("<key>RunAtLoad</key><true/>") || !persisted.includes("<key>KeepAlive</key><true/>") || persisted.includes("{{")) throw new Error(`apr_cohort_launch_agent_verification_failed:${entry.role}`);
+    return { ...entry, bundlePath: entry.args[1], path: target };
   });
   return { cohortNumber: options.cohortNumber, dashboardUrl: `http://127.0.0.1:${options.dashboardPort}/`, entries, ready: true, loadPerformed: false };
 }
@@ -87,10 +87,14 @@ export function prepareVerifiedAprCohortLaunchAgents(guard: AprInstallationGuard
   const bundleByRole = new Map(receipt.payload.bundles.map((bundle) => [bundle.role, bundle]));
   for (const role of ["supervisor", "worker", "watchdog"] as const) if (!bundleByRole.has(role)) throw new Error(`apr_cohort_launch_agent_bundle_missing:${role}`);
   const activeDirectory = path.join(receipt.localMetadata.promotionRoot, "current");
+  if (!lstatSync(activeDirectory).isSymbolicLink()) throw new Error("apr_cohort_launch_agent_active_pointer_not_symlink");
+  const activeTarget = readlinkSync(activeDirectory);
+  if (activeTarget !== receipt.payload.activeTarget) throw new Error("apr_cohort_launch_agent_active_pointer_mismatch");
+  const resolveInstalledBundle = (role: "supervisor" | "worker" | "watchdog") => realpathSync(path.join(activeDirectory, bundleByRole.get(role)!.installedRef));
   return prepareAprCohortLaunchAgents({
     ...options,
-    supervisorBundle: path.join(activeDirectory, bundleByRole.get("supervisor")!.installedRef),
-    workerBundle: path.join(activeDirectory, bundleByRole.get("worker")!.installedRef),
-    watchdogBundle: path.join(activeDirectory, bundleByRole.get("watchdog")!.installedRef),
+    supervisorBundle: resolveInstalledBundle("supervisor"),
+    workerBundle: resolveInstalledBundle("worker"),
+    watchdogBundle: resolveInstalledBundle("watchdog"),
   });
 }
diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index d52fcd1..427306e 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -120,6 +120,11 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     const options = { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 };
     const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, options);
     expect(prepared).toMatchObject({ ready: true, loadPerformed: false }); expect(prepared.entries).toHaveLength(3);
+    for (const entry of prepared.entries) {
+      expect(entry.path.startsWith(options.installDirectory)).toBe(true);
+      expect(entry.bundlePath).toContain(path.join("versions", promoted.versionId));
+      expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
+    }
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
     const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
-- 
2.50.1 (Apple Git-155)


From c683702c15c05fc77e4b121019ec8b0e4c4a196f Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:43:36 +0200
Subject: [PATCH 03/10] Attiva atomicamente i servizi APR simulati

---
 .../aprCohortLaunchAgents.ts                  | 12 ++++++-
 .../aprPreDeployVerification.test.ts          |  6 ++++
 .../aprServiceActivation.test.ts              | 28 +++++++++++++++
 .../aprServiceActivation.ts                   | 34 +++++++++++++++++++
 4 files changed, 79 insertions(+), 1 deletion(-)
 create mode 100644 scripts/enea-shadow-runner/aprServiceActivation.test.ts
 create mode 100644 scripts/enea-shadow-runner/aprServiceActivation.ts

diff --git a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
index 4ff9a96..5338c00 100644
--- a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
+++ b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
@@ -4,6 +4,8 @@ import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
 import { assertAprInstallationGuard, type AprInstallationGuard } from "./aprPreDeployVerification";
 
+const verifiedPreparations = new WeakSet<object>();
+
 export interface AprCohortLaunchAgentOptions {
   cohortNumber: number;
   stateDirectory: string;
@@ -91,10 +93,18 @@ export function prepareVerifiedAprCohortLaunchAgents(guard: AprInstallationGuard
   const activeTarget = readlinkSync(activeDirectory);
   if (activeTarget !== receipt.payload.activeTarget) throw new Error("apr_cohort_launch_agent_active_pointer_mismatch");
   const resolveInstalledBundle = (role: "supervisor" | "worker" | "watchdog") => realpathSync(path.join(activeDirectory, bundleByRole.get(role)!.installedRef));
-  return prepareAprCohortLaunchAgents({
+  const prepared = prepareAprCohortLaunchAgents({
     ...options,
     supervisorBundle: resolveInstalledBundle("supervisor"),
     workerBundle: resolveInstalledBundle("worker"),
     watchdogBundle: resolveInstalledBundle("watchdog"),
   });
+  verifiedPreparations.add(prepared);
+  return prepared;
+}
+
+export type AprVerifiedCohortLaunchAgentPreparation = ReturnType<typeof prepareVerifiedAprCohortLaunchAgents>;
+
+export function assertVerifiedAprCohortLaunchAgentPreparation(prepared: AprVerifiedCohortLaunchAgentPreparation) {
+  if (!prepared || !verifiedPreparations.has(prepared)) throw new Error("apr_cohort_launch_agent_preparation_not_verified");
 }
diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 427306e..4047981 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -13,6 +13,7 @@ import { createAprMonotonicPreDeployCertificate, persistAprMonotonicPreDeployCer
 import { guardAprInstallation, verifyAprStagingImmediatelyBeforePromotion, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
 import { promoteAprBundles, recoverAprBundlePromotion } from "./aprBundlePromotion";
 import { prepareVerifiedAprCohortLaunchAgents } from "./aprCohortLaunchAgents";
+import { activatePreparedAprServices, type AprServiceController } from "./aprServiceActivation";
 
 const sha = (character: string) => character.repeat(64);
 const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
@@ -125,6 +126,11 @@ describe("APR independent pre-deploy verification and installation guard", () =>
       expect(entry.bundlePath).toContain(path.join("versions", promoted.versionId));
       expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
     }
+    let activated = false;
+    const controller: AprServiceController = { activate: (request) => { activated = true; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; } };
+    const activation = activatePreparedAprServices({ prepared, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
+    expect(activation).toMatchObject({ activationId: "activation-ok", loadPerformed: true, simulated: true }); expect(activated).toBe(true);
+    expect(activation.roles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
     const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.test.ts b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
new file mode 100644
index 0000000..b86f819
--- /dev/null
+++ b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
@@ -0,0 +1,28 @@
+import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import { describe, expect, it } from "vitest";
+import { activatePreparedAprServices, type AprServiceActivationRequest, type AprServiceController } from "./aprServiceActivation";
+
+describe("APR service activation simulation", () => {
+  it("rifiuta una preparazione non emessa dal collegamento verificato", () => {
+    const root = mkdtempSync(path.join(os.tmpdir(), "apr-activation-"));
+    const forged = { entries: [], ready: true, loadPerformed: false } as never;
+    const controller: AprServiceController = { activate: () => ({ observations: [], dashboardResponding: true }) };
+    expect(() => activatePreparedAprServices({ prepared: forged, activationRoot: root, promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
+  });
+
+  it("installa plist atomici e usa esclusivamente il controller simulato", async () => {
+    const module = await import("./aprCohortLaunchAgents");
+    const root = mkdtempSync(path.join(os.tmpdir(), "apr-activation-")); const bin = path.join(root, "bin"); mkdirSync(bin);
+    const node = path.join(bin, "node"); writeFileSync(node, "#!/bin/sh\n"); chmodSync(node, 0o700);
+    const bundles = ["supervisor.mjs", "worker.mjs", "watchdog.mjs"].map((name) => { const target = path.join(bin, name); writeFileSync(target, "export {};\n"); return target; });
+    const raw = module.prepareAprCohortLaunchAgents({ cohortNumber: 61, stateDirectory: path.join(root, "state"), installDirectory: path.join(root, "staging"), nodeExecutable: node, supervisorBundle: bundles[0], workerBundle: bundles[1], watchdogBundle: bundles[2], dashboardPort: 4493 });
+    // The public activation intentionally rejects raw preparations; verified integration is covered end-to-end elsewhere.
+    expect(raw.entries).toHaveLength(3); expect(readFileSync(raw.entries[0].path, "utf8")).toContain(raw.entries[0].bundlePath);
+    let observed: AprServiceActivationRequest | null = null;
+    const controller: AprServiceController = { activate: (request) => { observed = request; return { observations: [], dashboardResponding: true }; } };
+    expect(() => activatePreparedAprServices({ prepared: raw as never, activationRoot: path.join(root, "activation"), promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
+    expect(observed).toBeNull();
+  });
+});
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
new file mode 100644
index 0000000..7212cb0
--- /dev/null
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -0,0 +1,34 @@
+import { createHash, randomUUID } from "node:crypto";
+import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
+import path from "node:path";
+import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
+
+export type AprServiceRole = "supervisor" | "worker" | "watchdog";
+export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
+export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
+export interface AprServiceController { activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean } }
+
+const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
+
+function copyAtomic(source: string, target: string) {
+  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
+  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
+  try { writeFileSync(descriptor, readFileSync(source)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
+  renameSync(temporary, target);
+  if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
+}
+
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string }) {
+  assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
+  const activationId = input.activationId ?? randomUUID();
+  const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
+  const roles = input.prepared.entries.map((entry) => {
+    const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
+    return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
+  });
+  const pointer = path.join(path.resolve(input.activationRoot), "current"); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
+  symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
+  if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
+  const runtime = input.controller.activate({ activationId, versionId: input.promotionVersionId, roles });
+  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, loadPerformed: true as const, simulated: true as const };
+}
-- 
2.50.1 (Apple Git-155)


From 9ebd90de4ce38b09fce6be53135119b53548543f Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:44:45 +0200
Subject: [PATCH 04/10] Blocca l'attivazione APR sul health gate

---
 .../aprPreDeployVerification.test.ts          |  2 +-
 .../aprServiceActivation.test.ts              | 23 +++++++++++++++++-
 .../aprServiceActivation.ts                   | 24 ++++++++++++++++---
 3 files changed, 44 insertions(+), 5 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 4047981..3c6ef24 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -129,7 +129,7 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     let activated = false;
     const controller: AprServiceController = { activate: (request) => { activated = true; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; } };
     const activation = activatePreparedAprServices({ prepared, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
-    expect(activation).toMatchObject({ activationId: "activation-ok", loadPerformed: true, simulated: true }); expect(activated).toBe(true);
+    expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, loadPerformed: true, simulated: true }); expect(activated).toBe(true);
     expect(activation.roles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.test.ts b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
index b86f819..7180f91 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.test.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
@@ -2,7 +2,7 @@ import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "
 import os from "node:os";
 import path from "node:path";
 import { describe, expect, it } from "vitest";
-import { activatePreparedAprServices, type AprServiceActivationRequest, type AprServiceController } from "./aprServiceActivation";
+import { activatePreparedAprServices, verifyAprServiceRuntimeHealth, type AprServiceActivationRequest, type AprServiceController } from "./aprServiceActivation";
 
 describe("APR service activation simulation", () => {
   it("rifiuta una preparazione non emessa dal collegamento verificato", () => {
@@ -25,4 +25,25 @@ describe("APR service activation simulation", () => {
     expect(() => activatePreparedAprServices({ prepared: raw as never, activationRoot: path.join(root, "activation"), promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
     expect(observed).toBeNull();
   });
+
+  it.each([
+    ["PID mancante", { pid: null }, "pid_missing"],
+    ["heartbeat fermo", { heartbeatAt: "2026-08-24T00:00:00.000Z" }, "heartbeat_not_advanced"],
+    ["checkpoint fermo", { checkpointRevision: 1 }, "checkpoint_not_advanced"],
+    ["bundle precedente", { bundlePath: "/installed/old/worker.mjs" }, "bundle_version_mismatch"],
+  ])("rende FAIL il health gate con %s", (_label, override, reason) => {
+    const roles = (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, plistPath: `/plist/${role}.plist`, bundlePath: `/installed/version-new/${role}.mjs` }));
+    const request = { activationId: "activation", versionId: "version-new", roles };
+    const observations = roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 }));
+    Object.assign(observations[1], override);
+    const health = verifyAprServiceRuntimeHealth({ request, runtime: { observations, dashboardResponding: true }, baseline: { roles: roles.map((role) => ({ role: role.role, heartbeatAt: "2026-08-24T00:00:00.000Z", checkpointRevision: 1 })) } });
+    expect(health.status).toBe("FAIL"); expect(health.reasons.join(" ")).toContain(reason);
+  });
+
+  it("rende FAIL il health gate se la dashboard non risponde", () => {
+    const roles = (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, plistPath: `/plist/${role}.plist`, bundlePath: `/installed/version-new/${role}.mjs` }));
+    const request = { activationId: "activation", versionId: "version-new", roles };
+    const observations = roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 }));
+    expect(verifyAprServiceRuntimeHealth({ request, runtime: { observations, dashboardResponding: false } })).toMatchObject({ status: "FAIL", reasons: expect.arrayContaining(["dashboard_unreachable"]) });
+  });
 });
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index 7212cb0..5ececaa 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -7,6 +7,8 @@ export type AprServiceRole = "supervisor" | "worker" | "watchdog";
 export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
 export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
 export interface AprServiceController { activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean } }
+export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
+export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
 
 const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
 
@@ -18,7 +20,22 @@ function copyAtomic(source: string, target: string) {
   if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
 }
 
-export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string }) {
+export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
+  const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
+  const roles = input.request.roles.map((expected) => {
+    const observed = input.runtime.observations.find((item) => item.role === expected.role); const before = baseline.get(expected.role);
+    const pidOk = Boolean(observed?.pid && observed.pid > 0);
+    const heartbeatAdvanced = Boolean(observed?.heartbeatAt && (!before?.heartbeatAt || Date.parse(observed.heartbeatAt) > Date.parse(before.heartbeatAt)));
+    const checkpointAdvanced = Boolean(observed?.checkpointRevision !== null && observed?.checkpointRevision !== undefined && (!before || before.checkpointRevision === null || observed.checkpointRevision > before.checkpointRevision));
+    const bundleVersionOk = observed?.bundlePath === expected.bundlePath && expected.bundlePath.includes(input.request.versionId);
+    if (!pidOk) reasons.push(`${expected.role}:pid_missing`); if (!heartbeatAdvanced) reasons.push(`${expected.role}:heartbeat_not_advanced`); if (!checkpointAdvanced) reasons.push(`${expected.role}:checkpoint_not_advanced`); if (!bundleVersionOk) reasons.push(`${expected.role}:bundle_version_mismatch`);
+    return { role: expected.role, pidOk, heartbeatAdvanced, checkpointAdvanced, bundleVersionOk };
+  });
+  if (!input.runtime.dashboardResponding) reasons.push("dashboard_unreachable");
+  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
+}
+
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline }) {
   assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
   const activationId = input.activationId ?? randomUUID();
   const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
@@ -29,6 +46,7 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   const pointer = path.join(path.resolve(input.activationRoot), "current"); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
   symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
   if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
-  const runtime = input.controller.activate({ activationId, versionId: input.promotionVersionId, roles });
-  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, loadPerformed: true as const, simulated: true as const };
+  const request = { activationId, versionId: input.promotionVersionId, roles }; const runtime = input.controller.activate(request);
+  const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
+  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, loadPerformed: true as const, simulated: true as const };
 }
-- 
2.50.1 (Apple Git-155)


From a114ab506156aba8dd083d69d6727fd341b8ca92 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:45:53 +0200
Subject: [PATCH 05/10] Ripristina APR dopo un health gate fallito

---
 .../aprPreDeployVerification.test.ts          |  8 +++--
 .../aprServiceActivation.test.ts              |  8 ++---
 .../aprServiceActivation.ts                   | 31 ++++++++++++++++---
 3 files changed, 36 insertions(+), 11 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 3c6ef24..6a6ffb6 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -127,10 +127,14 @@ describe("APR independent pre-deploy verification and installation guard", () =>
       expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
     }
     let activated = false;
-    const controller: AprServiceController = { activate: (request) => { activated = true; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; } };
-    const activation = activatePreparedAprServices({ prepared, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
+    const controller: AprServiceController = { activate: (request) => { activated = true; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    const activation = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
     expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, loadPerformed: true, simulated: true }); expect(activated).toBe(true);
     expect(activation.roles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
+    let rollbackCalled = false;
+    const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
+    const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
+    expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") } }); expect(rollbackCalled).toBe(true);
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
     const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.test.ts b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
index 7180f91..537bc32 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.test.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
@@ -8,8 +8,8 @@ describe("APR service activation simulation", () => {
   it("rifiuta una preparazione non emessa dal collegamento verificato", () => {
     const root = mkdtempSync(path.join(os.tmpdir(), "apr-activation-"));
     const forged = { entries: [], ready: true, loadPerformed: false } as never;
-    const controller: AprServiceController = { activate: () => ({ observations: [], dashboardResponding: true }) };
-    expect(() => activatePreparedAprServices({ prepared: forged, activationRoot: root, promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
+    const controller: AprServiceController = { activate: () => ({ observations: [], dashboardResponding: true }), rollback: () => ({ restored: true }) };
+    expect(() => activatePreparedAprServices({ prepared: forged, promotionReceipt: {} as never, activationRoot: root, promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
   });
 
   it("installa plist atomici e usa esclusivamente il controller simulato", async () => {
@@ -21,8 +21,8 @@ describe("APR service activation simulation", () => {
     // The public activation intentionally rejects raw preparations; verified integration is covered end-to-end elsewhere.
     expect(raw.entries).toHaveLength(3); expect(readFileSync(raw.entries[0].path, "utf8")).toContain(raw.entries[0].bundlePath);
     let observed: AprServiceActivationRequest | null = null;
-    const controller: AprServiceController = { activate: (request) => { observed = request; return { observations: [], dashboardResponding: true }; } };
-    expect(() => activatePreparedAprServices({ prepared: raw as never, activationRoot: path.join(root, "activation"), promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
+    const controller: AprServiceController = { activate: (request) => { observed = request; return { observations: [], dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    expect(() => activatePreparedAprServices({ prepared: raw as never, promotionReceipt: {} as never, activationRoot: path.join(root, "activation"), promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
     expect(observed).toBeNull();
   });
 
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index 5ececaa..db766c0 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -1,12 +1,16 @@
 import { createHash, randomUUID } from "node:crypto";
-import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
+import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
 import path from "node:path";
 import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
+import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 
 export type AprServiceRole = "supervisor" | "worker" | "watchdog";
 export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
 export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
-export interface AprServiceController { activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean } }
+export interface AprServiceController {
+  activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean };
+  rollback(request: AprServiceActivationRequest): { restored: boolean };
+}
 export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
 export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
 
@@ -20,6 +24,13 @@ function copyAtomic(source: string, target: string) {
   if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
 }
 
+function currentSymlinkTarget(pointer: string) { return existsSync(pointer) && lstatSync(pointer).isSymbolicLink() ? readlinkSync(pointer) : null; }
+function replaceSymlink(pointer: string, target: string | null) {
+  mkdirSync(path.dirname(pointer), { recursive: true, mode: 0o700 });
+  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); return; }
+  const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
+}
+
 export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
   const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
   const roles = input.request.roles.map((expected) => {
@@ -35,7 +46,7 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
   return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
 }
 
-export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline }) {
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline }) {
   assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
   const activationId = input.activationId ?? randomUUID();
   const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
@@ -43,10 +54,20 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
     const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
     return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
   });
-  const pointer = path.join(path.resolve(input.activationRoot), "current"); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
+  const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
   symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
   if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
   const request = { activationId, versionId: input.promotionVersionId, roles }; const runtime = input.controller.activate(request);
   const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
-  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, loadPerformed: true as const, simulated: true as const };
+  let rollback = { performed: false, verified: false, restoredBundlePointer: null as string | null, restoredPlistPointer: null as string | null };
+  if (healthGate.status === "FAIL") {
+    const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
+    replaceSymlink(bundlePointer, input.promotionReceipt.payload.previousTarget); replaceSymlink(pointer, previousPlistTarget);
+    const processRollback = input.controller.rollback(request);
+    const bundleVerified = currentSymlinkTarget(bundlePointer) === input.promotionReceipt.payload.previousTarget;
+    const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
+    rollback = { performed: true, verified: processRollback.restored && bundleVerified && plistVerified, restoredBundlePointer: input.promotionReceipt.payload.previousTarget, restoredPlistPointer: previousPlistTarget };
+    if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
+  }
+  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, loadPerformed: true as const, simulated: true as const };
 }
-- 
2.50.1 (Apple Git-155)


From ccfce1d5d585f47b7b14d991efb28c5ddd91c475 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:47:08 +0200
Subject: [PATCH 06/10] Riprende l'attivazione APR dopo crash

---
 .../aprPreDeployVerification.test.ts          | 14 ++++++-
 .../aprServiceActivation.ts                   | 39 ++++++++++++++++++-
 2 files changed, 50 insertions(+), 3 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 6a6ffb6..6faf467 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -13,7 +13,7 @@ import { createAprMonotonicPreDeployCertificate, persistAprMonotonicPreDeployCer
 import { guardAprInstallation, verifyAprStagingImmediatelyBeforePromotion, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
 import { promoteAprBundles, recoverAprBundlePromotion } from "./aprBundlePromotion";
 import { prepareVerifiedAprCohortLaunchAgents } from "./aprCohortLaunchAgents";
-import { activatePreparedAprServices, type AprServiceController } from "./aprServiceActivation";
+import { activatePreparedAprServices, recoverAprServiceActivation, type AprServiceController } from "./aprServiceActivation";
 
 const sha = (character: string) => character.repeat(64);
 const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
@@ -135,6 +135,18 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
     const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
     expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") } }); expect(rollbackCalled).toBe(true);
+    let recoveryActivations = 0;
+    const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:01:00.000Z", checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
+    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: false });
+    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: true });
+    expect(recoveryActivations).toBe(1);
+    let recoveryRollbacks = 0;
+    const rollbackRecoveryController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { recoveryRollbacks += 1; return { restored: true }; } };
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback", crashAt: "during_rollback" })).toThrow(/simulated_crash_during_rollback/);
+    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ rollbackVerified: true });
+    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true });
+    expect(recoveryRollbacks).toBe(1);
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
     const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index db766c0..d378eaa 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -3,6 +3,7 @@ import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readF
 import path from "node:path";
 import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
 import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
+import { canonicalJson } from "./aprMonotonicArtifacts";
 
 export type AprServiceRole = "supervisor" | "worker" | "watchdog";
 export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
@@ -13,6 +14,8 @@ export interface AprServiceController {
 }
 export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
 export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
+interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; previousBundleTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
+class AprSimulatedActivationCrash extends Error {}
 
 const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
 
@@ -30,6 +33,11 @@ function replaceSymlink(pointer: string, target: string | null) {
   if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); return; }
   const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
 }
+function transactionPath(root: string, activationId: string) { return path.join(path.resolve(root), "transactions", `${activationId}.json`); }
+function writeTransaction(root: string, transaction: AprActivationTransaction) {
+  const target = transactionPath(root, transaction.activationId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
+  const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, `${canonicalJson(transaction)}\n`, { mode: 0o600 }); renameSync(temporary, target);
+}
 
 export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
   const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
@@ -46,7 +54,7 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
   return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
 }
 
-export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline }) {
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" }) {
   assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
   const activationId = input.activationId ?? randomUUID();
   const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
@@ -57,17 +65,44 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
   symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
   if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
-  const request = { activationId, versionId: input.promotionVersionId, roles }; const runtime = input.controller.activate(request);
+  const request = { activationId, versionId: input.promotionVersionId, roles };
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
+  if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
+  const runtime = input.controller.activate(request);
   const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
   let rollback = { performed: false, verified: false, restoredBundlePointer: null as string | null, restoredPlistPointer: null as string | null };
   if (healthGate.status === "FAIL") {
     const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
+    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "ROLLING_BACK", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: "FAIL" });
     replaceSymlink(bundlePointer, input.promotionReceipt.payload.previousTarget); replaceSymlink(pointer, previousPlistTarget);
+    if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
     const processRollback = input.controller.rollback(request);
     const bundleVerified = currentSymlinkTarget(bundlePointer) === input.promotionReceipt.payload.previousTarget;
     const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
     rollback = { performed: true, verified: processRollback.restored && bundleVerified && plistVerified, restoredBundlePointer: input.promotionReceipt.payload.previousTarget, restoredPlistPointer: previousPlistTarget };
     if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
   }
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
   return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, loadPerformed: true as const, simulated: true as const };
 }
+
+export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
+  const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
+  if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
+  if (transaction.phase === "COMPLETE") return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const };
+  const plistPointer = path.join(path.resolve(input.activationRoot), "current"); const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
+  if (transaction.phase === "POINTER_SWITCHED") {
+    const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
+    if (health.status === "PASS") {
+      writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "PASS" });
+      return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
+    }
+    writeTransaction(input.activationRoot, { ...transaction, phase: "ROLLING_BACK", healthStatus: "FAIL" });
+    replaceSymlink(bundlePointer, transaction.previousBundleTarget); replaceSymlink(plistPointer, transaction.previousPlistTarget);
+  }
+  const rollback = input.controller.rollback(transaction.request);
+  const verified = rollback.restored && currentSymlinkTarget(bundlePointer) === transaction.previousBundleTarget && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
+  if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
+  writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "FAIL" });
+  return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, rollbackVerified: true as const };
+}
-- 
2.50.1 (Apple Git-155)


From 49f42b88710eb39d9e4efc06627e8df107be3ee7 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:48:55 +0200
Subject: [PATCH 07/10] Registra la ricevuta di attivazione APR

---
 .../aprPreDeployVerification.test.ts          | 13 +++---
 .../aprServiceActivation.ts                   | 11 ++++-
 .../aprServiceActivationReceipt.ts            | 42 +++++++++++++++++++
 3 files changed, 59 insertions(+), 7 deletions(-)
 create mode 100644 scripts/enea-shadow-runner/aprServiceActivationReceipt.ts

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 6faf467..43df378 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -126,15 +126,18 @@ describe("APR independent pre-deploy verification and installation guard", () =>
       expect(entry.bundlePath).toContain(path.join("versions", promoted.versionId));
       expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
     }
-    let activated = false;
-    const controller: AprServiceController = { activate: (request) => { activated = true; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    let activationCalls = 0;
+    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
     const activation = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
-    expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, loadPerformed: true, simulated: true }); expect(activated).toBe(true);
-    expect(activation.roles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
+    expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, receipt: { payload: { status: "PASS", promotionReceiptId: promoted.receipt.payload.receiptId } }, loadPerformed: true, simulated: true }); expect(activationCalls).toBe(1);
+    const activationRoles = activation.roles; if (!activationRoles) throw new Error("expected_new_activation");
+    expect(activationRoles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
+    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
+    expect(activationCalls).toBe(1);
     let rollbackCalled = false;
     const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
     const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
-    expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") } }); expect(rollbackCalled).toBe(true);
+    expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") }, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } }); expect(rollbackCalled).toBe(true);
     let recoveryActivations = 0;
     const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:01:00.000Z", checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index d378eaa..5550e35 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -4,6 +4,7 @@ import path from "node:path";
 import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
 import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 import { canonicalJson } from "./aprMonotonicArtifacts";
+import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt } from "./aprServiceActivationReceipt";
 
 export type AprServiceRole = "supervisor" | "worker" | "watchdog";
 export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
@@ -56,7 +57,12 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
 
 export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" }) {
   assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
-  const activationId = input.activationId ?? randomUUID();
+  const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
+  const existingTransactionPath = transactionPath(input.activationRoot, activationId);
+  if (existsSync(existingTransactionPath)) {
+    const existing = JSON.parse(readFileSync(existingTransactionPath, "utf8")) as AprActivationTransaction;
+    if (existing.phase === "COMPLETE") return { activationId, idempotent: true as const, receipt: loadAprServiceActivationReceipt(input.activationRoot, activationId) };
+  }
   const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
   const roles = input.prepared.entries.map((entry) => {
     const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
@@ -83,7 +89,8 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
     if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
   }
   writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
-  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, loadPerformed: true as const, simulated: true as const };
+  const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: new Date().toISOString(), gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
+  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
 }
 
 export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
diff --git a/scripts/enea-shadow-runner/aprServiceActivationReceipt.ts b/scripts/enea-shadow-runner/aprServiceActivationReceipt.ts
new file mode 100644
index 0000000..7a163e9
--- /dev/null
+++ b/scripts/enea-shadow-runner/aprServiceActivationReceipt.ts
@@ -0,0 +1,42 @@
+import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
+import path from "node:path";
+import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
+import type { AprRuntimeHealthGate, AprServiceRole, AprServiceRuntimeObservation } from "./aprServiceActivation";
+
+export const APR_SERVICE_ACTIVATION_RECEIPT_VERSION = "apr-service-activation-receipt-v1" as const;
+export interface AprServiceActivationReceiptPayload {
+  schemaVersion: typeof APR_SERVICE_ACTIVATION_RECEIPT_VERSION;
+  activationId: string;
+  promotionReceiptId: string;
+  timestamp: string;
+  gitCommit: string;
+  runtimeRevision: string;
+  status: "PASS" | "FAIL";
+  roles: Array<{ role: AprServiceRole; observedPid: number | null; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }>;
+  dashboardResponding: boolean;
+  reasons: string[];
+  rollback: { performed: boolean; verified: boolean };
+}
+export type AprServiceActivationReceipt = AprImmutableArtifactEnvelope<AprServiceActivationReceiptPayload, { activationRoot: string; receiptPath: string }>;
+
+export function persistAprServiceActivationReceipt(input: Omit<AprServiceActivationReceiptPayload, "schemaVersion" | "roles"> & { activationRoot: string; healthGate: AprRuntimeHealthGate; observations: AprServiceRuntimeObservation[] }) {
+  const directory = path.join(path.resolve(input.activationRoot), "receipts"); const target = path.join(directory, `${input.activationId}.json`);
+  const { activationRoot, healthGate, observations, ...payload } = input;
+  const roles = healthGate.roles.map((health) => ({ ...health, observedPid: observations.find((item) => item.role === health.role)?.pid ?? null }));
+  const receipt = envelopeImmutableArtifact({ ...payload, roles, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, schemaVersion: APR_SERVICE_ACTIVATION_RECEIPT_VERSION }, { activationRoot: path.resolve(activationRoot), receiptPath: target });
+  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_service_activation_receipt_invalid");
+  mkdirSync(directory, { recursive: true, mode: 0o700 }); const contents = `${canonicalJson(receipt)}\n`;
+  if (existsSync(target)) {
+    const existing = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
+    if (!verifyImmutableArtifactEnvelope(existing) || canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("apr_service_activation_receipt_collision");
+    return { receipt: existing, path: target, created: false };
+  }
+  const descriptor = openSync(target, "wx", 0o600); try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
+  return { receipt, path: target, created: true };
+}
+
+export function loadAprServiceActivationReceipt(activationRoot: string, activationId: string) {
+  const target = path.join(path.resolve(activationRoot), "receipts", `${activationId}.json`); const receipt = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
+  if (!verifyImmutableArtifactEnvelope(receipt) || receipt.payload.activationId !== activationId) throw new Error("apr_service_activation_receipt_load_invalid");
+  return receipt;
+}
-- 
2.50.1 (Apple Git-155)


From aa77f5dea484848ac40fe514f53566722dfa03d7 Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:50:59 +0200
Subject: [PATCH 08/10] Completa le receipt APR dopo recovery

---
 .../aprPreDeployVerification.test.ts               |  2 ++
 scripts/enea-shadow-runner/aprServiceActivation.ts | 14 +++++++++-----
 2 files changed, 11 insertions(+), 5 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 43df378..f772ad5 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -143,12 +143,14 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: false });
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: true });
+    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
     expect(recoveryActivations).toBe(1);
     let recoveryRollbacks = 0;
     const rollbackRecoveryController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { recoveryRollbacks += 1; return { restored: true }; } };
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback", crashAt: "during_rollback" })).toThrow(/simulated_crash_during_rollback/);
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ rollbackVerified: true });
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true });
+    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
     expect(recoveryRollbacks).toBe(1);
     const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
     expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index 5550e35..e9724f0 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -15,7 +15,7 @@ export interface AprServiceController {
 }
 export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
 export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
-interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; previousBundleTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
+interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; startedAt: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; previousBundleTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
 class AprSimulatedActivationCrash extends Error {}
 
 const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
@@ -72,14 +72,15 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
   if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
   const request = { activationId, versionId: input.promotionVersionId, roles };
-  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
+  const startedAt = new Date().toISOString();
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
   if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
   const runtime = input.controller.activate(request);
   const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
   let rollback = { performed: false, verified: false, restoredBundlePointer: null as string | null, restoredPlistPointer: null as string | null };
   if (healthGate.status === "FAIL") {
     const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
-    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "ROLLING_BACK", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: "FAIL" });
+    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "ROLLING_BACK", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: "FAIL" });
     replaceSymlink(bundlePointer, input.promotionReceipt.payload.previousTarget); replaceSymlink(pointer, previousPlistTarget);
     if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
     const processRollback = input.controller.rollback(request);
@@ -88,8 +89,8 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
     rollback = { performed: true, verified: processRollback.restored && bundleVerified && plistVerified, restoredBundlePointer: input.promotionReceipt.payload.previousTarget, restoredPlistPointer: previousPlistTarget };
     if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
   }
-  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
-  const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: new Date().toISOString(), gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
+  const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
   return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
 }
 
@@ -101,6 +102,7 @@ export function recoverAprServiceActivation(input: { activationRoot: string; pro
   if (transaction.phase === "POINTER_SWITCHED") {
     const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
     if (health.status === "PASS") {
+      persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "PASS", healthGate: health, observations: runtime.observations, dashboardResponding: health.dashboardResponding, reasons: health.reasons, rollback: { performed: false, verified: false } });
       writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "PASS" });
       return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
     }
@@ -110,6 +112,8 @@ export function recoverAprServiceActivation(input: { activationRoot: string; pro
   const rollback = input.controller.rollback(transaction.request);
   const verified = rollback.restored && currentSymlinkTarget(bundlePointer) === transaction.previousBundleTarget && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
   if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
+  const recoveredHealth: AprRuntimeHealthGate = { status: "FAIL", reasons: ["recovered_failed_health_gate"], dashboardResponding: false, roles: transaction.request.roles.map((item) => ({ role: item.role, pidOk: false, heartbeatAdvanced: false, checkpointAdvanced: false, bundleVersionOk: false })) };
+  persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "FAIL", healthGate: recoveredHealth, observations: [], dashboardResponding: false, reasons: recoveredHealth.reasons, rollback: { performed: true, verified: true } });
   writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "FAIL" });
   return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, rollbackVerified: true as const };
 }
-- 
2.50.1 (Apple Git-155)


From 2383516bb2494e5fdc36e1cca852142dc1e7b7ba Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:53:01 +0200
Subject: [PATCH 09/10] Vincola e rende durevole l'attivazione APR

---
 scripts/enea-shadow-runner/aprCohortLaunchAgents.ts   |  8 +++++---
 .../aprPreDeployVerification.test.ts                  |  2 ++
 scripts/enea-shadow-runner/aprServiceActivation.ts    | 11 ++++++++---
 3 files changed, 15 insertions(+), 6 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
index 5338c00..7d5c4cc 100644
--- a/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
+++ b/scripts/enea-shadow-runner/aprCohortLaunchAgents.ts
@@ -4,7 +4,7 @@ import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
 import { assertAprInstallationGuard, type AprInstallationGuard } from "./aprPreDeployVerification";
 
-const verifiedPreparations = new WeakSet<object>();
+const verifiedPreparations = new WeakMap<object, { promotionReceiptArtifactId: string; promotionVersionId: string }>();
 
 export interface AprCohortLaunchAgentOptions {
   cohortNumber: number;
@@ -99,12 +99,14 @@ export function prepareVerifiedAprCohortLaunchAgents(guard: AprInstallationGuard
     workerBundle: resolveInstalledBundle("worker"),
     watchdogBundle: resolveInstalledBundle("watchdog"),
   });
-  verifiedPreparations.add(prepared);
+  verifiedPreparations.set(prepared, { promotionReceiptArtifactId: receipt.artifactId, promotionVersionId: receipt.payload.versionId });
   return prepared;
 }
 
 export type AprVerifiedCohortLaunchAgentPreparation = ReturnType<typeof prepareVerifiedAprCohortLaunchAgents>;
 
 export function assertVerifiedAprCohortLaunchAgentPreparation(prepared: AprVerifiedCohortLaunchAgentPreparation) {
-  if (!prepared || !verifiedPreparations.has(prepared)) throw new Error("apr_cohort_launch_agent_preparation_not_verified");
+  const binding = prepared ? verifiedPreparations.get(prepared) : undefined;
+  if (!binding) throw new Error("apr_cohort_launch_agent_preparation_not_verified");
+  return binding;
 }
diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index f772ad5..13bb60e 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -134,6 +134,8 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     expect(activationRoles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
     expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
     expect(activationCalls).toBe(1);
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "invalid-id"), promotionVersionId: promoted.versionId, controller, activationId: "../escape" })).toThrow(/activation_id_invalid/);
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "wrong-version"), promotionVersionId: "wrong-version", controller, activationId: "wrong-version" })).toThrow(/promotion_binding_mismatch/);
     let rollbackCalled = false;
     const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
     const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index e9724f0..7543a1b 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -31,13 +31,16 @@ function copyAtomic(source: string, target: string) {
 function currentSymlinkTarget(pointer: string) { return existsSync(pointer) && lstatSync(pointer).isSymbolicLink() ? readlinkSync(pointer) : null; }
 function replaceSymlink(pointer: string, target: string | null) {
   mkdirSync(path.dirname(pointer), { recursive: true, mode: 0o700 });
-  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); return; }
+  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); } return; }
   const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
+  const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
 }
 function transactionPath(root: string, activationId: string) { return path.join(path.resolve(root), "transactions", `${activationId}.json`); }
 function writeTransaction(root: string, transaction: AprActivationTransaction) {
   const target = transactionPath(root, transaction.activationId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
-  const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, `${canonicalJson(transaction)}\n`, { mode: 0o600 }); renameSync(temporary, target);
+  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
+  try { writeFileSync(descriptor, `${canonicalJson(transaction)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
+  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
 }
 
 export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
@@ -56,8 +59,10 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
 }
 
 export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" }) {
-  assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
+  const binding = assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
+  if (binding.promotionReceiptArtifactId !== input.promotionReceipt.artifactId || binding.promotionVersionId !== input.promotionVersionId || input.promotionReceipt.payload.versionId !== input.promotionVersionId) throw new Error("apr_service_activation_promotion_binding_mismatch");
   const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
+  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(activationId) || activationId.includes("..")) throw new Error("apr_service_activation_id_invalid");
   const existingTransactionPath = transactionPath(input.activationRoot, activationId);
   if (existsSync(existingTransactionPath)) {
     const existing = JSON.parse(readFileSync(existingTransactionPath, "utf8")) as AprActivationTransaction;
-- 
2.50.1 (Apple Git-155)


From 5a0fdfff1153c3ddadf7adaf67c6ac63d7aee12d Mon Sep 17 00:00:00 2001
From: Giuliano Beretta
 <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date: Mon, 24 Aug 2026 00:56:00 +0200
Subject: [PATCH 10/10] Vincola il health gate APR alla finestra temporale

---
 .../aprPreDeployVerification.test.ts                |  4 ++--
 .../enea-shadow-runner/aprServiceActivation.test.ts | 11 +++++++++--
 scripts/enea-shadow-runner/aprServiceActivation.ts  | 13 ++++++++-----
 3 files changed, 19 insertions(+), 9 deletions(-)

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 13bb60e..200ebef 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -127,7 +127,7 @@ describe("APR independent pre-deploy verification and installation guard", () =>
       expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
     }
     let activationCalls = 0;
-    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
     const activation = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
     expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, receipt: { payload: { status: "PASS", promotionReceiptId: promoted.receipt.payload.receiptId } }, loadPerformed: true, simulated: true }); expect(activationCalls).toBe(1);
     const activationRoles = activation.roles; if (!activationRoles) throw new Error("expected_new_activation");
@@ -141,7 +141,7 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
     expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") }, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } }); expect(rollbackCalled).toBe(true);
     let recoveryActivations = 0;
-    const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:01:00.000Z", checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: false });
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: true });
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.test.ts b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
index 537bc32..484c160 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.test.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.test.ts
@@ -33,7 +33,7 @@ describe("APR service activation simulation", () => {
     ["bundle precedente", { bundlePath: "/installed/old/worker.mjs" }, "bundle_version_mismatch"],
   ])("rende FAIL il health gate con %s", (_label, override, reason) => {
     const roles = (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, plistPath: `/plist/${role}.plist`, bundlePath: `/installed/version-new/${role}.mjs` }));
-    const request = { activationId: "activation", versionId: "version-new", roles };
+    const request = { activationId: "activation", versionId: "version-new", startedAt: "2026-08-24T00:00:00.000Z", healthDeadlineAt: "2026-08-24T00:00:30.000Z", roles };
     const observations = roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 }));
     Object.assign(observations[1], override);
     const health = verifyAprServiceRuntimeHealth({ request, runtime: { observations, dashboardResponding: true }, baseline: { roles: roles.map((role) => ({ role: role.role, heartbeatAt: "2026-08-24T00:00:00.000Z", checkpointRevision: 1 })) } });
@@ -42,8 +42,15 @@ describe("APR service activation simulation", () => {
 
   it("rende FAIL il health gate se la dashboard non risponde", () => {
     const roles = (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, plistPath: `/plist/${role}.plist`, bundlePath: `/installed/version-new/${role}.mjs` }));
-    const request = { activationId: "activation", versionId: "version-new", roles };
+    const request = { activationId: "activation", versionId: "version-new", startedAt: "2026-08-24T00:00:00.000Z", healthDeadlineAt: "2026-08-24T00:00:30.000Z", roles };
     const observations = roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:01.000Z", checkpointRevision: 2 }));
     expect(verifyAprServiceRuntimeHealth({ request, runtime: { observations, dashboardResponding: false } })).toMatchObject({ status: "FAIL", reasons: expect.arrayContaining(["dashboard_unreachable"]) });
   });
+
+  it("rifiuta un heartbeat successivo alla finestra di salute", () => {
+    const roles = (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, plistPath: `/plist/${role}.plist`, bundlePath: `/installed/version-new/${role}.mjs` }));
+    const request = { activationId: "activation", versionId: "version-new", startedAt: "2026-08-24T00:00:00.000Z", healthDeadlineAt: "2026-08-24T00:00:30.000Z", roles };
+    const observations = roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: "2026-08-24T00:00:31.000Z", checkpointRevision: 2 }));
+    expect(verifyAprServiceRuntimeHealth({ request, runtime: { observations, dashboardResponding: true } })).toMatchObject({ status: "FAIL", reasons: expect.arrayContaining(["supervisor:heartbeat_not_advanced"]) });
+  });
 });
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index 7543a1b..565726b 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -7,7 +7,7 @@ import { canonicalJson } from "./aprMonotonicArtifacts";
 import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt } from "./aprServiceActivationReceipt";
 
 export type AprServiceRole = "supervisor" | "worker" | "watchdog";
-export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
+export interface AprServiceActivationRequest { activationId: string; versionId: string; startedAt: string; healthDeadlineAt: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
 export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
 export interface AprServiceController {
   activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean };
@@ -48,7 +48,8 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
   const roles = input.request.roles.map((expected) => {
     const observed = input.runtime.observations.find((item) => item.role === expected.role); const before = baseline.get(expected.role);
     const pidOk = Boolean(observed?.pid && observed.pid > 0);
-    const heartbeatAdvanced = Boolean(observed?.heartbeatAt && (!before?.heartbeatAt || Date.parse(observed.heartbeatAt) > Date.parse(before.heartbeatAt)));
+    const heartbeatTime = observed?.heartbeatAt ? Date.parse(observed.heartbeatAt) : Number.NaN;
+    const heartbeatAdvanced = Number.isFinite(heartbeatTime) && heartbeatTime >= Date.parse(input.request.startedAt) && heartbeatTime <= Date.parse(input.request.healthDeadlineAt) && (!before?.heartbeatAt || heartbeatTime > Date.parse(before.heartbeatAt));
     const checkpointAdvanced = Boolean(observed?.checkpointRevision !== null && observed?.checkpointRevision !== undefined && (!before || before.checkpointRevision === null || observed.checkpointRevision > before.checkpointRevision));
     const bundleVersionOk = observed?.bundlePath === expected.bundlePath && expected.bundlePath.includes(input.request.versionId);
     if (!pidOk) reasons.push(`${expected.role}:pid_missing`); if (!heartbeatAdvanced) reasons.push(`${expected.role}:heartbeat_not_advanced`); if (!checkpointAdvanced) reasons.push(`${expected.role}:checkpoint_not_advanced`); if (!bundleVersionOk) reasons.push(`${expected.role}:bundle_version_mismatch`);
@@ -58,7 +59,7 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
   return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
 }
 
-export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" }) {
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback"; now?: Date; healthWindowMs?: number }) {
   const binding = assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
   if (binding.promotionReceiptArtifactId !== input.promotionReceipt.artifactId || binding.promotionVersionId !== input.promotionVersionId || input.promotionReceipt.payload.versionId !== input.promotionVersionId) throw new Error("apr_service_activation_promotion_binding_mismatch");
   const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
@@ -76,8 +77,10 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
   symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
   if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
-  const request = { activationId, versionId: input.promotionVersionId, roles };
-  const startedAt = new Date().toISOString();
+  const startedAtDate = input.now ?? new Date(); const healthWindowMs = input.healthWindowMs ?? 30_000;
+  if (!Number.isFinite(healthWindowMs) || healthWindowMs <= 0) throw new Error("apr_service_activation_health_window_invalid");
+  const startedAt = startedAtDate.toISOString();
+  const request = { activationId, versionId: input.promotionVersionId, startedAt, healthDeadlineAt: new Date(startedAtDate.getTime() + healthWindowMs).toISOString(), roles };
   writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
   if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
   const runtime = input.controller.activate(request);
-- 
2.50.1 (Apple Git-155)


# FINE DEI DIECI DIFF GIT REALI

