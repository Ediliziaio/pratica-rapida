Agisci come revisore tecnico rigoroso dell'architettura monotona APR. Non hai accesso al repository né a Internet. Tutto il materiale necessario è incluso integralmente in questo unico testo. Non chiedere altri file.

REVISIONE CORRENTE

Revisiona esclusivamente il commit originale:

aa77f5dea484848ac40fe514f53566722dfa03d7 — Completa le receipt APR dopo recovery

Devi valutarlo nel suo stato effettivo corrente, tenendo conto delle correzioni successive incluse:

- 2cef33f30b85fae5b1d43dd8b6ca3f7207163976 — separa il rollback servizi dalla promozione bundle;
- b85e08d9a2a6286637c6daef6c2956d6d04be7f8 — evita doppie activate/rollback quando la receipt è già persistita.

STATO DEI COMMIT ANCORA DA RIVEDERE DOPO b85e08d

Parzialmente estesi o superati in punti specifici:
- aa77f5d: la persistenza PASS/FAIL nel recovery resta attiva quando la receipt manca; è superata l'assunzione che la recovery debba sempre rieseguire l'azione e poi persistere nuovamente la receipt. b85e08d introduce il percorso receipt-first.
- 2383516: resta valida la durabilità; il precedente ritorno idempotente su transazione COMPLETE è stato rafforzato da b85e08d con verifica di coerenza della receipt.
- c683702: installazione atomica e controller simulato restano validi; l'interfaccia è stata estesa con il crash point after_receipt, senza cambiare il nucleo atomico.
- 5a0fdff: health deadline e finestra temporale restano invariati; b85e08d ne documenta esplicitamente il riuso durante recovery.

Invariati nel merito:
- 9ebd90d — health gate bloccante;
- 0e39ab4 — collegamento promozione verificata ai plist;
- 4d1f20b — verifica dei plist;
- 49f42b8 — formato canonico e persistenza della receipt; b85e08d ne aggiunge il consumo preventivo senza modificarne il formato.

Nessuno degli otto commit è completamente irrilevante. aa77f5d è il primo da revisionare perché la sua logica resta attiva nel ramo recovery senza receipt.

VINCOLI

- Nessuna modifica a CRM, ENEA, browser, SPID, LaunchAgent reali, regole business, dashboard o /api/case-truth.
- Non proporre refactoring estetici.
- Distingui sempre il diff storico dal comportamento corrente.
- La receipt di attivazione deve essere immutabile, coerente e sufficiente a rappresentare PASS/FAIL.
- Recovery non deve duplicare activate o rollback quando una receipt coerente esiste già.
- Slice 6 non deve mutare il puntatore bundle di Slice 5.

VERIFICHE CORRENTI

- typecheck: PASS;
- suite Slice 1-6: 65/65 PASS;
- suite Infissi: 90/90 PASS;
- suite correlate/dashboard: 103/103 PASS;
- build: PASS;
- test mirati post-commit: 24/24 PASS.

COSA DEVI CONTROLLARE SU aa77f5d

1. La receipt PASS viene sempre persistita prima di COMPLETE quando la recovery esegue realmente activate.
2. La receipt FAIL viene sempre persistita prima di COMPLETE quando la recovery esegue realmente rollback.
3. Se una receipt coerente esiste già, b85e08d evita la seconda azione e completa la transazione senza collisioni.
4. Una receipt trovata viene legata correttamente ad activationId, promotionReceiptId, versionId, fase e healthStatus.
5. Una transazione COMPLETE senza receipt fallisce in modo esplicito.
6. Una receipt FAIL trovata durante ROLLING_BACK dimostra rollback performed e verified e richiede plist già ripristinato.
7. Persistenza della receipt e transazione COMPLETE non possono produrre uno stato pubblico silenziosamente incoerente.
8. Individua eventuali finestre di crash ancora non coperte, specialmente:
   - dopo controller.activate ma prima della receipt;
   - dopo controller.rollback ma prima della receipt;
   - dopo receipt ma prima di COMPLETE;
   - durante la scrittura della receipt o della transazione.
9. Verifica se il percorso fisso receipts/<activationId>.json è sicuro con l'attuale modello di idempotenza.
10. Verifica se i test correnti dimostrano realmente PASS, FAIL, collision avoidance e receipt coherence.

FORMATO OBBLIGATORIO DELLA RISPOSTA

A. VERDETTO
Usa uno solo:
- APPROVATO;
- APPROVATO CON CORREZIONI NON BLOCCANTI;
- BLOCCATO PRIMA DEL PROSSIMO COMMIT.

B. PARTI DEL DIFF STORICO ANCORA ATTIVE
Indica le righe/logiche di aa77f5d ancora presenti nel comportamento corrente.

C. PARTI ESTESE O SUPERATE
Indica precisamente cosa è stato modificato da 2cef33f e b85e08d.

D. DIFETTI CONCRETI NEL CODICE CORRENTE
Per ogni difetto:
- gravità;
- file e funzione;
- scenario riproducibile;
- conseguenza;
- correzione minima;
- test automatico.

E. COPERTURA DEI TEST
Indica soltanto casi realmente mancanti.

F. PROSSIMO PASSO
Se esiste un difetto bloccante, prepara un unico prompt operativo completo per Codex. Se aa77f5d è approvato, scrivi esplicitamente che si può passare alla revisione di 2383516.

Non revisionare ancora gli altri commit.

# INIZIO GIT SHOW STORICO aa77f5d

commit aa77f5dea484848ac40fe514f53566722dfa03d7
Author: Giuliano Beretta <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date:   Mon Aug 24 00:50:59 2026 +0200

    Completa le receipt APR dopo recovery

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

# FINE GIT SHOW STORICO aa77f5d

# INIZIO GIT SHOW CORREZIONE 2cef33f

commit 2cef33f30b85fae5b1d43dd8b6ca3f7207163976
Author: Giuliano Beretta <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date:   Mon Aug 24 01:13:31 2026 +0200

    Separa il rollback servizi dalla promozione bundle

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 200ebef..6955d9b 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -1,5 +1,5 @@
 import { execFileSync } from "node:child_process";
-import { mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
+import { mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
 import os from "node:os";
 import path from "node:path";
 import { describe, expect, it } from "vitest";
@@ -138,8 +138,13 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "wrong-version"), promotionVersionId: "wrong-version", controller, activationId: "wrong-version" })).toThrow(/promotion_binding_mismatch/);
     let rollbackCalled = false;
     const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
+    const promotedBundleTarget = readlinkSync(promoted.activePointer);
     const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
     expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") }, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } }); expect(rollbackCalled).toBe(true);
+    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
+    const repeatedAfterFailedActivation = promoteAprBundles(verified);
+    expect(repeatedAfterFailedActivation.receipt.artifactId).toBe(promoted.receipt.artifactId);
+    expect(readlinkSync(repeatedAfterFailedActivation.activePointer)).toBe(promotedBundleTarget);
     let recoveryActivations = 0;
     const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
@@ -150,7 +155,9 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     let recoveryRollbacks = 0;
     const rollbackRecoveryController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { recoveryRollbacks += 1; return { restored: true }; } };
     expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback", crashAt: "during_rollback" })).toThrow(/simulated_crash_during_rollback/);
+    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ rollbackVerified: true });
+    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
     expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true });
     expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
     expect(recoveryRollbacks).toBe(1);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index 565726b..b9802ff 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -15,7 +15,7 @@ export interface AprServiceController {
 }
 export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
 export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
-interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; startedAt: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; previousBundleTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
+interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; startedAt: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
 class AprSimulatedActivationCrash extends Error {}
 
 const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
@@ -81,24 +81,22 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   if (!Number.isFinite(healthWindowMs) || healthWindowMs <= 0) throw new Error("apr_service_activation_health_window_invalid");
   const startedAt = startedAtDate.toISOString();
   const request = { activationId, versionId: input.promotionVersionId, startedAt, healthDeadlineAt: new Date(startedAtDate.getTime() + healthWindowMs).toISOString(), roles };
-  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, healthStatus: null });
   if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
   const runtime = input.controller.activate(request);
   const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
-  let rollback = { performed: false, verified: false, restoredBundlePointer: null as string | null, restoredPlistPointer: null as string | null };
+  let rollback = { performed: false, verified: false, restoredPlistPointer: null as string | null };
   if (healthGate.status === "FAIL") {
-    const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
-    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "ROLLING_BACK", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: "FAIL" });
-    replaceSymlink(bundlePointer, input.promotionReceipt.payload.previousTarget); replaceSymlink(pointer, previousPlistTarget);
+    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "ROLLING_BACK", request, previousPlistTarget, healthStatus: "FAIL" });
+    replaceSymlink(pointer, previousPlistTarget);
     if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
     const processRollback = input.controller.rollback(request);
-    const bundleVerified = currentSymlinkTarget(bundlePointer) === input.promotionReceipt.payload.previousTarget;
     const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
-    rollback = { performed: true, verified: processRollback.restored && bundleVerified && plistVerified, restoredBundlePointer: input.promotionReceipt.payload.previousTarget, restoredPlistPointer: previousPlistTarget };
+    rollback = { performed: true, verified: processRollback.restored && plistVerified, restoredPlistPointer: previousPlistTarget };
     if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
   }
   const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
-  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
+  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, healthStatus: healthGate.status });
   return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
 }
 
@@ -106,7 +104,7 @@ export function recoverAprServiceActivation(input: { activationRoot: string; pro
   const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
   if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
   if (transaction.phase === "COMPLETE") return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const };
-  const plistPointer = path.join(path.resolve(input.activationRoot), "current"); const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
+  const plistPointer = path.join(path.resolve(input.activationRoot), "current");
   if (transaction.phase === "POINTER_SWITCHED") {
     const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
     if (health.status === "PASS") {
@@ -115,10 +113,10 @@ export function recoverAprServiceActivation(input: { activationRoot: string; pro
       return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
     }
     writeTransaction(input.activationRoot, { ...transaction, phase: "ROLLING_BACK", healthStatus: "FAIL" });
-    replaceSymlink(bundlePointer, transaction.previousBundleTarget); replaceSymlink(plistPointer, transaction.previousPlistTarget);
+    replaceSymlink(plistPointer, transaction.previousPlistTarget);
   }
   const rollback = input.controller.rollback(transaction.request);
-  const verified = rollback.restored && currentSymlinkTarget(bundlePointer) === transaction.previousBundleTarget && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
+  const verified = rollback.restored && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
   if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
   const recoveredHealth: AprRuntimeHealthGate = { status: "FAIL", reasons: ["recovered_failed_health_gate"], dashboardResponding: false, roles: transaction.request.roles.map((item) => ({ role: item.role, pidOk: false, heartbeatAdvanced: false, checkpointAdvanced: false, bundleVersionOk: false })) };
   persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "FAIL", healthGate: recoveredHealth, observations: [], dashboardResponding: false, reasons: recoveredHealth.reasons, rollback: { performed: true, verified: true } });

# FINE GIT SHOW CORREZIONE 2cef33f

# INIZIO GIT SHOW CORREZIONE b85e08d

commit b85e08d9a2a6286637c6daef6c2956d6d04be7f8
Author: Giuliano Beretta <giulianolavoro@MBPdiGiiano2026.homenet.telecomitalia.it>
Date:   Mon Aug 24 01:31:08 2026 +0200

    Evita doppie attivazioni nel recovery APR

diff --git a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
index 6955d9b..0be7206 100644
--- a/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
+++ b/scripts/enea-shadow-runner/aprPreDeployVerification.test.ts
@@ -52,6 +52,13 @@ function fixture() {
   return { root, repositoryRoot, certificatePath: persisted.path, stagingDirectory, baselinePath };
 }
 
+function activationFixture(attemptId: string) {
+  const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
+  const promoted = promoteAprBundles(verified, { attemptId });
+  const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 });
+  return { value, verified, promoted, prepared };
+}
+
 describe("APR independent pre-deploy verification and installation guard", () => {
   it("rilegge e verifica da disco certificato, prove, Git, differenziale e bundle", () => {
     const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath, { now: new Date("2026-08-23T22:31:00.000Z") });
@@ -169,6 +176,36 @@ describe("APR independent pre-deploy verification and installation guard", () =>
     expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), mismatchedReceipt, { ...options, installDirectory: path.join(value.root, "mismatched") })).toThrow(/certificate_mismatch/);
   });
 
+  it("non riattiva i servizi se trova una receipt PASS scritta prima del crash", () => {
+    const { value, promoted, prepared } = activationFixture("recovery-pass-receipt"); let activationCalls = 0;
+    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 700 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    const activationRoot = path.join(value.root, "pass-receipt-crash");
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "pass-receipt-crash", crashAt: "after_receipt", now: new Date("2026-08-24T01:00:00.000Z") })).toThrow(/simulated_crash_after_receipt/);
+    expect(activationCalls).toBe(1);
+    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "pass-receipt-crash" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
+    expect(activationCalls).toBe(1);
+  });
+
+  it("non ripete il rollback se trova una receipt FAIL scritta prima del crash", () => {
+    const { value, promoted, prepared } = activationFixture("recovery-fail-receipt"); let activationCalls = 0; let rollbackCalls = 0;
+    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }; }, rollback: () => { rollbackCalls += 1; return { restored: true }; } };
+    const activationRoot = path.join(value.root, "fail-receipt-crash");
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "fail-receipt-crash", crashAt: "after_receipt", now: new Date("2026-08-24T01:01:00.000Z") })).toThrow(/simulated_crash_after_receipt/);
+    expect({ activationCalls, rollbackCalls }).toEqual({ activationCalls: 1, rollbackCalls: 1 });
+    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "fail-receipt-crash" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
+    expect({ activationCalls, rollbackCalls }).toEqual({ activationCalls: 1, rollbackCalls: 1 });
+  });
+
+  it("riusa durante la recovery la deadline originale persistita", () => {
+    const { value, promoted, prepared } = activationFixture("recovery-original-deadline"); let observedDeadline: string | null = null;
+    const controller: AprServiceController = { activate: (request) => { observedDeadline = request.healthDeadlineAt; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 800 + index, bundlePath: role.bundlePath, heartbeatAt: "2020-01-01T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
+    const activationRoot = path.join(value.root, "original-deadline-crash");
+    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "original-deadline-crash", crashAt: "after_pointer", now: new Date("2020-01-01T00:00:00.000Z"), healthWindowMs: 30_000 })).toThrow(/simulated_crash_after_pointer/);
+    expect(observedDeadline).toBeNull();
+    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "original-deadline-crash" })).toMatchObject({ health: { status: "PASS" } });
+    expect(observedDeadline).toBe("2020-01-01T00:00:30.000Z");
+  });
+
   it("non sposta il puntatore attivo se un hash post-copy non coincide", () => {
     const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
     expect(() => promoteAprBundles(verified, { attemptId: "failed-copy", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
diff --git a/scripts/enea-shadow-runner/aprServiceActivation.ts b/scripts/enea-shadow-runner/aprServiceActivation.ts
index b9802ff..d2f92aa 100644
--- a/scripts/enea-shadow-runner/aprServiceActivation.ts
+++ b/scripts/enea-shadow-runner/aprServiceActivation.ts
@@ -4,7 +4,7 @@ import path from "node:path";
 import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
 import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
 import { canonicalJson } from "./aprMonotonicArtifacts";
-import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt } from "./aprServiceActivationReceipt";
+import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt, type AprServiceActivationReceipt } from "./aprServiceActivationReceipt";
 
 export type AprServiceRole = "supervisor" | "worker" | "watchdog";
 export interface AprServiceActivationRequest { activationId: string; versionId: string; startedAt: string; healthDeadlineAt: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
@@ -43,6 +43,15 @@ function writeTransaction(root: string, transaction: AprActivationTransaction) {
   renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
 }
 
+function loadExistingActivationReceipt(activationRoot: string, activationId: string) {
+  try { return loadAprServiceActivationReceipt(activationRoot, activationId); }
+  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
+}
+
+function assertActivationReceiptCoherent(receipt: AprServiceActivationReceipt, transaction: AprActivationTransaction, promotionReceipt: AprBundlePromotionReceipt) {
+  if (receipt.payload.activationId !== transaction.activationId || receipt.payload.promotionReceiptId !== promotionReceipt.payload.receiptId || transaction.request.versionId !== promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_receipt_mismatch");
+}
+
 export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
   const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
   const roles = input.request.roles.map((expected) => {
@@ -59,7 +68,7 @@ export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActiva
   return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
 }
 
-export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback"; now?: Date; healthWindowMs?: number }) {
+export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" | "after_receipt"; now?: Date; healthWindowMs?: number }) {
   const binding = assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
   if (binding.promotionReceiptArtifactId !== input.promotionReceipt.artifactId || binding.promotionVersionId !== input.promotionVersionId || input.promotionReceipt.payload.versionId !== input.promotionVersionId) throw new Error("apr_service_activation_promotion_binding_mismatch");
   const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
@@ -67,7 +76,10 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
   const existingTransactionPath = transactionPath(input.activationRoot, activationId);
   if (existsSync(existingTransactionPath)) {
     const existing = JSON.parse(readFileSync(existingTransactionPath, "utf8")) as AprActivationTransaction;
-    if (existing.phase === "COMPLETE") return { activationId, idempotent: true as const, receipt: loadAprServiceActivationReceipt(input.activationRoot, activationId) };
+    if (existing.phase === "COMPLETE") {
+      const receipt = loadAprServiceActivationReceipt(input.activationRoot, activationId); assertActivationReceiptCoherent(receipt, existing, input.promotionReceipt);
+      return { activationId, idempotent: true as const, receipt };
+    }
   }
   const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
   const roles = input.prepared.entries.map((entry) => {
@@ -96,6 +108,7 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
     if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
   }
   const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
+  if (input.crashAt === "after_receipt") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_receipt");
   writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, healthStatus: healthGate.status });
   return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
 }
@@ -103,7 +116,21 @@ export function activatePreparedAprServices(input: { prepared: AprVerifiedCohort
 export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
   const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
   if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
-  if (transaction.phase === "COMPLETE") return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const };
+  if (transaction.request.versionId !== input.promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_promotion_mismatch");
+  const existingReceipt = loadExistingActivationReceipt(input.activationRoot, input.activationId);
+  if (existingReceipt) {
+    assertActivationReceiptCoherent(existingReceipt, transaction, input.promotionReceipt);
+    const expectedStatus = transaction.phase === "COMPLETE" ? transaction.healthStatus : transaction.phase === "ROLLING_BACK" ? "FAIL" : "PASS";
+    if (expectedStatus === null) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
+    if (existingReceipt.payload.status !== expectedStatus || (expectedStatus === "FAIL" && (!existingReceipt.payload.rollback.performed || !existingReceipt.payload.rollback.verified))) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
+    if (transaction.phase === "ROLLING_BACK") {
+      const plistPointer = path.join(path.resolve(input.activationRoot), "current");
+      if (currentSymlinkTarget(plistPointer) !== transaction.previousPlistTarget) throw new Error("apr_service_activation_recovery_plist_not_restored");
+    }
+    if (transaction.phase !== "COMPLETE") writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: existingReceipt.payload.status });
+    return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const, receipt: existingReceipt };
+  }
+  if (transaction.phase === "COMPLETE") throw new Error("apr_service_activation_recovery_complete_receipt_missing");
   const plistPointer = path.join(path.resolve(input.activationRoot), "current");
   if (transaction.phase === "POINTER_SWITCHED") {
     const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });

# FINE GIT SHOW CORREZIONE b85e08d

# INIZIO CODICE CORRENTE aprServiceActivation.ts

```ts
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
import { canonicalJson } from "./aprMonotonicArtifacts";
import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt, type AprServiceActivationReceipt } from "./aprServiceActivationReceipt";

export type AprServiceRole = "supervisor" | "worker" | "watchdog";
export interface AprServiceActivationRequest { activationId: string; versionId: string; startedAt: string; healthDeadlineAt: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
export interface AprServiceController {
  activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean };
  rollback(request: AprServiceActivationRequest): { restored: boolean };
}
export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; startedAt: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
class AprSimulatedActivationCrash extends Error {}

const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

function copyAtomic(source: string, target: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, readFileSync(source)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
}

function currentSymlinkTarget(pointer: string) { return existsSync(pointer) && lstatSync(pointer).isSymbolicLink() ? readlinkSync(pointer) : null; }
function replaceSymlink(pointer: string, target: string | null) {
  mkdirSync(path.dirname(pointer), { recursive: true, mode: 0o700 });
  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); } return; }
  const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
  const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function transactionPath(root: string, activationId: string) { return path.join(path.resolve(root), "transactions", `${activationId}.json`); }
function writeTransaction(root: string, transaction: AprActivationTransaction) {
  const target = transactionPath(root, transaction.activationId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${canonicalJson(transaction)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function loadExistingActivationReceipt(activationRoot: string, activationId: string) {
  try { return loadAprServiceActivationReceipt(activationRoot, activationId); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function assertActivationReceiptCoherent(receipt: AprServiceActivationReceipt, transaction: AprActivationTransaction, promotionReceipt: AprBundlePromotionReceipt) {
  if (receipt.payload.activationId !== transaction.activationId || receipt.payload.promotionReceiptId !== promotionReceipt.payload.receiptId || transaction.request.versionId !== promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_receipt_mismatch");
}

export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
  const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
  const roles = input.request.roles.map((expected) => {
    const observed = input.runtime.observations.find((item) => item.role === expected.role); const before = baseline.get(expected.role);
    const pidOk = Boolean(observed?.pid && observed.pid > 0);
    const heartbeatTime = observed?.heartbeatAt ? Date.parse(observed.heartbeatAt) : Number.NaN;
    const heartbeatAdvanced = Number.isFinite(heartbeatTime) && heartbeatTime >= Date.parse(input.request.startedAt) && heartbeatTime <= Date.parse(input.request.healthDeadlineAt) && (!before?.heartbeatAt || heartbeatTime > Date.parse(before.heartbeatAt));
    const checkpointAdvanced = Boolean(observed?.checkpointRevision !== null && observed?.checkpointRevision !== undefined && (!before || before.checkpointRevision === null || observed.checkpointRevision > before.checkpointRevision));
    const bundleVersionOk = observed?.bundlePath === expected.bundlePath && expected.bundlePath.includes(input.request.versionId);
    if (!pidOk) reasons.push(`${expected.role}:pid_missing`); if (!heartbeatAdvanced) reasons.push(`${expected.role}:heartbeat_not_advanced`); if (!checkpointAdvanced) reasons.push(`${expected.role}:checkpoint_not_advanced`); if (!bundleVersionOk) reasons.push(`${expected.role}:bundle_version_mismatch`);
    return { role: expected.role, pidOk, heartbeatAdvanced, checkpointAdvanced, bundleVersionOk };
  });
  if (!input.runtime.dashboardResponding) reasons.push("dashboard_unreachable");
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
}

export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" | "after_receipt"; now?: Date; healthWindowMs?: number }) {
  const binding = assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
  if (binding.promotionReceiptArtifactId !== input.promotionReceipt.artifactId || binding.promotionVersionId !== input.promotionVersionId || input.promotionReceipt.payload.versionId !== input.promotionVersionId) throw new Error("apr_service_activation_promotion_binding_mismatch");
  const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(activationId) || activationId.includes("..")) throw new Error("apr_service_activation_id_invalid");
  const existingTransactionPath = transactionPath(input.activationRoot, activationId);
  if (existsSync(existingTransactionPath)) {
    const existing = JSON.parse(readFileSync(existingTransactionPath, "utf8")) as AprActivationTransaction;
    if (existing.phase === "COMPLETE") {
      const receipt = loadAprServiceActivationReceipt(input.activationRoot, activationId); assertActivationReceiptCoherent(receipt, existing, input.promotionReceipt);
      return { activationId, idempotent: true as const, receipt };
    }
  }
  const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  const roles = input.prepared.entries.map((entry) => {
    const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
    return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
  });
  const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
  symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
  if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
  const startedAtDate = input.now ?? new Date(); const healthWindowMs = input.healthWindowMs ?? 30_000;
  if (!Number.isFinite(healthWindowMs) || healthWindowMs <= 0) throw new Error("apr_service_activation_health_window_invalid");
  const startedAt = startedAtDate.toISOString();
  const request = { activationId, versionId: input.promotionVersionId, startedAt, healthDeadlineAt: new Date(startedAtDate.getTime() + healthWindowMs).toISOString(), roles };
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, healthStatus: null });
  if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
  const runtime = input.controller.activate(request);
  const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
  let rollback = { performed: false, verified: false, restoredPlistPointer: null as string | null };
  if (healthGate.status === "FAIL") {
    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "ROLLING_BACK", request, previousPlistTarget, healthStatus: "FAIL" });
    replaceSymlink(pointer, previousPlistTarget);
    if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
    const processRollback = input.controller.rollback(request);
    const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
    rollback = { performed: true, verified: processRollback.restored && plistVerified, restoredPlistPointer: previousPlistTarget };
    if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
  }
  const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
  if (input.crashAt === "after_receipt") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_receipt");
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, healthStatus: healthGate.status });
  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
}

export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
  const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
  if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
  if (transaction.request.versionId !== input.promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_promotion_mismatch");
  const existingReceipt = loadExistingActivationReceipt(input.activationRoot, input.activationId);
  if (existingReceipt) {
    assertActivationReceiptCoherent(existingReceipt, transaction, input.promotionReceipt);
    const expectedStatus = transaction.phase === "COMPLETE" ? transaction.healthStatus : transaction.phase === "ROLLING_BACK" ? "FAIL" : "PASS";
    if (expectedStatus === null) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
    if (existingReceipt.payload.status !== expectedStatus || (expectedStatus === "FAIL" && (!existingReceipt.payload.rollback.performed || !existingReceipt.payload.rollback.verified))) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
    if (transaction.phase === "ROLLING_BACK") {
      const plistPointer = path.join(path.resolve(input.activationRoot), "current");
      if (currentSymlinkTarget(plistPointer) !== transaction.previousPlistTarget) throw new Error("apr_service_activation_recovery_plist_not_restored");
    }
    if (transaction.phase !== "COMPLETE") writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: existingReceipt.payload.status });
    return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const, receipt: existingReceipt };
  }
  if (transaction.phase === "COMPLETE") throw new Error("apr_service_activation_recovery_complete_receipt_missing");
  const plistPointer = path.join(path.resolve(input.activationRoot), "current");
  if (transaction.phase === "POINTER_SWITCHED") {
    const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
    if (health.status === "PASS") {
      persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "PASS", healthGate: health, observations: runtime.observations, dashboardResponding: health.dashboardResponding, reasons: health.reasons, rollback: { performed: false, verified: false } });
      writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "PASS" });
      return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
    }
    writeTransaction(input.activationRoot, { ...transaction, phase: "ROLLING_BACK", healthStatus: "FAIL" });
    replaceSymlink(plistPointer, transaction.previousPlistTarget);
  }
  const rollback = input.controller.rollback(transaction.request);
  const verified = rollback.restored && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
  if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
  const recoveredHealth: AprRuntimeHealthGate = { status: "FAIL", reasons: ["recovered_failed_health_gate"], dashboardResponding: false, roles: transaction.request.roles.map((item) => ({ role: item.role, pidOk: false, heartbeatAdvanced: false, checkpointAdvanced: false, bundleVersionOk: false })) };
  persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "FAIL", healthGate: recoveredHealth, observations: [], dashboardResponding: false, reasons: recoveredHealth.reasons, rollback: { performed: true, verified: true } });
  writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "FAIL" });
  return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, rollbackVerified: true as const };
}

```
# FINE CODICE CORRENTE aprServiceActivation.ts

# INIZIO CODICE CORRENTE aprServiceActivationReceipt.ts

```ts
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import type { AprRuntimeHealthGate, AprServiceRole, AprServiceRuntimeObservation } from "./aprServiceActivation";

export const APR_SERVICE_ACTIVATION_RECEIPT_VERSION = "apr-service-activation-receipt-v1" as const;
export interface AprServiceActivationReceiptPayload {
  schemaVersion: typeof APR_SERVICE_ACTIVATION_RECEIPT_VERSION;
  activationId: string;
  promotionReceiptId: string;
  timestamp: string;
  gitCommit: string;
  runtimeRevision: string;
  status: "PASS" | "FAIL";
  roles: Array<{ role: AprServiceRole; observedPid: number | null; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }>;
  dashboardResponding: boolean;
  reasons: string[];
  rollback: { performed: boolean; verified: boolean };
}
export type AprServiceActivationReceipt = AprImmutableArtifactEnvelope<AprServiceActivationReceiptPayload, { activationRoot: string; receiptPath: string }>;

export function persistAprServiceActivationReceipt(input: Omit<AprServiceActivationReceiptPayload, "schemaVersion" | "roles"> & { activationRoot: string; healthGate: AprRuntimeHealthGate; observations: AprServiceRuntimeObservation[] }) {
  const directory = path.join(path.resolve(input.activationRoot), "receipts"); const target = path.join(directory, `${input.activationId}.json`);
  const { activationRoot, healthGate, observations, ...payload } = input;
  const roles = healthGate.roles.map((health) => ({ ...health, observedPid: observations.find((item) => item.role === health.role)?.pid ?? null }));
  const receipt = envelopeImmutableArtifact({ ...payload, roles, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, schemaVersion: APR_SERVICE_ACTIVATION_RECEIPT_VERSION }, { activationRoot: path.resolve(activationRoot), receiptPath: target });
  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_service_activation_receipt_invalid");
  mkdirSync(directory, { recursive: true, mode: 0o700 }); const contents = `${canonicalJson(receipt)}\n`;
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
    if (!verifyImmutableArtifactEnvelope(existing) || canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("apr_service_activation_receipt_collision");
    return { receipt: existing, path: target, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600); try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  return { receipt, path: target, created: true };
}

export function loadAprServiceActivationReceipt(activationRoot: string, activationId: string) {
  const target = path.join(path.resolve(activationRoot), "receipts", `${activationId}.json`); const receipt = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
  if (!verifyImmutableArtifactEnvelope(receipt) || receipt.payload.activationId !== activationId) throw new Error("apr_service_activation_receipt_load_invalid");
  return receipt;
}

```
# FINE CODICE CORRENTE aprServiceActivationReceipt.ts

# INIZIO TEST CORRENTI aprPreDeployVerification.test.ts

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import type { AprDifferentialSnapshot } from "./aprDifferentialReport";
import type { AprMonotonicBootstrapBaseline } from "./aprMonotonicBootstrapBaseline";
import { canonicalJson, envelopeImmutableArtifact } from "./aprMonotonicArtifacts";
import { persistAprReplayDifferential } from "./aprPersistentReplayDifferential";
import { createAprPersistedTestRunReport, createAprRuleTestEvidenceManifest, PersistentAprTestEvidenceStore } from "./aprPersistedTestEvidence";
import { createAprMonotonicPreDeployCertificate, persistAprMonotonicPreDeployCertificate } from "./aprPreDeployCertificate";
import { guardAprInstallation, verifyAprStagingImmediatelyBeforePromotion, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
import { promoteAprBundles, recoverAprBundlePromotion } from "./aprBundlePromotion";
import { prepareVerifiedAprCohortLaunchAgents } from "./aprCohortLaunchAgents";
import { activatePreparedAprServices, recoverAprServiceActivation, type AprServiceController } from "./aprServiceActivation";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
const corpus = computeAprInputCorpusFingerprint({ corpusVersion: "verify-40-v1", cases: keys.map((customerKey) => ({ customerKey, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const snapshot = (runId: string): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: corpus, cases: keys.map((customerKey) => ({ customerKey, status: "READY", blockerCodes: [], payloadFingerprint: sha("c"), appliedRuleIds: ["rule-verify"] })) });
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function repository(contents = "baseline\n") {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-repo-")); git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "APR Fixture"]);
  writeFileSync(path.join(root, "tracked.txt"), contents);
  const testFile = path.join(root, "tests", "verify.test.ts"); mkdirSync(path.dirname(testFile), { recursive: true }); writeFileSync(testFile, "// test\n");
  git(root, ["add", "tracked.txt", "tests/verify.test.ts"]); git(root, ["commit", "-qm", "baseline"]);
  return root;
}

function fixture() {
  const repositoryRoot = repository(); const gitCommit = git(repositoryRoot, ["rev-parse", "HEAD"]); const treeHash = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-evidence-"));
  const baseline: AprMonotonicBootstrapBaseline = envelopeImmutableArtifact({ schemaVersion: "apr-monotonic-bootstrap-baseline-v1", createdAt: "2026-08-23T22:30:00.000Z", sourceCommit: gitCommit, sourceTree: treeHash, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus,
    caseOutputs: keys.map((customerKey) => ({ customerKey, publicStatus: "READY", payloadSha256: sha("c"), blockerSetSha256: sha("d"), appliedRuleSetSha256: sha("e") })),
    bundleHashes: (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, stagedRef: role, stagedSha256: sha("f") })), testEvidenceIds: ["verify"], status: "FROZEN" });
  const baselinePath = path.join(root, "baseline.json"); writeFileSync(baselinePath, `${canonicalJson(baseline)}\n`);
  const differential = persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate: snapshot("candidate"), gitCommit, runtimeRevision: "runtime-verify", now: new Date("2026-08-23T22:30:01.000Z") });
  const testFile = path.join(repositoryRoot, "tests", "verify.test.ts");
  const rawReportPath = path.join(root, "vitest.json"); writeFileSync(rawReportPath, JSON.stringify({ success: true, testResults: [{ name: testFile, assertionResults: [{ fullName: "verify positive", status: "passed" }, { fullName: "verify negative", status: "passed" }] }] }));
  const testStore = new PersistentAprTestEvidenceStore(root); const run = testStore.persistRunReport(createAprPersistedTestRunReport({ commit: gitCommit, treeHash, runtimeRevision: "runtime-verify", command: "vitest --reporter=json", exitCode: 0, timestamp: "2026-08-23T22:30:02.000Z", rawReportPath }));
  testStore.persistManifest(createAprRuleTestEvidenceManifest({ repositoryRoot, createdAt: "2026-08-23T22:30:03.000Z", rules: [{ ruleId: "rule-verify", records: [
    { polarity: "POSITIVE", testFile, testId: "verify positive", result: "passed", testRunReportPath: run.path },
    { polarity: "NEGATIVE", testFile, testId: "verify negative", result: "passed", testRunReportPath: run.path },
  ] }] }));
  const stagingDirectory = path.join(root, "staging"); mkdirSync(stagingDirectory);
  for (const filename of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(stagingDirectory, filename), `// ${filename}\n`);
  const certificate = createAprMonotonicPreDeployCertificate({ repositoryRoot, baselinePath, differentialReportPath: differential.path, testEvidenceRoot: root, stagingDirectory, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus, newRuleIds: ["rule-verify"], now: new Date("2026-08-23T22:30:04.000Z") });
  const persisted = persistAprMonotonicPreDeployCertificate(path.join(root, "certificates"), certificate);
  return { root, repositoryRoot, certificatePath: persisted.path, stagingDirectory, baselinePath };
}

function activationFixture(attemptId: string) {
  const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
  const promoted = promoteAprBundles(verified, { attemptId });
  const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 });
  return { value, verified, promoted, prepared };
}

describe("APR independent pre-deploy verification and installation guard", () => {
  it("rilegge e verifica da disco certificato, prove, Git, differenziale e bundle", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath, { now: new Date("2026-08-23T22:31:00.000Z") });
    expect(verified).toMatchObject({ status: "VERIFIED_PASS" });
    expect(guardAprInstallation(verified)).toMatchObject({ allowed: true, certificateArtifactId: verified.certificateArtifactId });
  });

  it("rifiuta un certificato con payload manomesso", () => {
    const value = fixture(); const certificate = JSON.parse(readFileSync(value.certificatePath, "utf8")); certificate.payload.runtimeRevision = "altered";
    writeFileSync(value.certificatePath, `${canonicalJson(certificate)}\n`);
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/certificate_hash_mismatch/);
  });

  it("rifiuta baseline mancante, alterata o sostituita dopo la certificazione", () => {
    const missing = fixture(); unlinkSync(missing.baselinePath);
    expect(() => verifyPreDeployCertificate(missing.certificatePath)).toThrow();
    const altered = fixture(); const baseline = JSON.parse(readFileSync(altered.baselinePath, "utf8")); baseline.payload.bundleHashes[0].stagedSha256 = sha("0");
    writeFileSync(altered.baselinePath, `${canonicalJson(baseline)}\n`);
    expect(() => verifyPreDeployCertificate(altered.certificatePath)).toThrow(/baseline_envelope_invalid/);
    const replaced = fixture(); const replacement = envelopeImmutableArtifact({ ...JSON.parse(readFileSync(replaced.baselinePath, "utf8")).payload, createdAt: "2026-08-23T22:30:00.001Z" });
    writeFileSync(replaced.baselinePath, `${canonicalJson(replacement)}\n`);
    expect(() => verifyPreDeployCertificate(replaced.certificatePath)).toThrow(/baseline_replaced/);
  });

  it("rifiuta se il commit checked out è differente", () => {
    const value = fixture(); const otherRepository = repository("different\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath, { repositoryRoot: otherRepository })).toThrow(/git_commit_mismatch/);
  });

  it("rifiuta un bundle staged modificato dopo la certificazione", () => {
    const value = fixture(); writeFileSync(path.join(value.stagingDirectory, "apr-watchdog.mjs"), "// altered\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/bundle_hash_mismatch/);
  });

  it("rifiuta il report differenziale manomesso dopo la certificazione", () => {
    const value = fixture(); const certificate = JSON.parse(readFileSync(value.certificatePath, "utf8"));
    const differentialPath = certificate.localMetadata.differentialReportPath;
    const differential = JSON.parse(readFileSync(differentialPath, "utf8")); differential.payload.runtimeRevision = "altered";
    writeFileSync(differentialPath, `${canonicalJson(differential)}\n`);
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/differential_mismatch/);
  });

  it("la guardia rifiuta un oggetto costruito a mano con gli stessi campi", () => {
    const manual = { version: "apr-predeploy-verification-v1", certificatePath: "/tmp/fake", certificateArtifactId: sha("a"), gitCommit: sha("b").slice(0, 40), treeHash: sha("c").slice(0, 40), verifiedAt: "2026-08-23T22:31:00.000Z", status: "VERIFIED_PASS" } as AprVerifiedPreDeployCertificate;
    expect(() => guardAprInstallation(manual)).toThrow(/unverified_certificate/);
  });

  it("riverifica lo staging immediatamente prima della promozione", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(verifyAprStagingImmediatelyBeforePromotion(verified).observed).toHaveLength(3);
    writeFileSync(path.join(value.stagingDirectory, "apr-supervisor.mjs"), "// changed after verification\n");
    expect(() => verifyAprStagingImmediatelyBeforePromotion(verified)).toThrow(/staging_changed_after_verification/);
  });

  it("promuove i tre bundle in una versione atomica e conserva la versione precedente", () => {
    const first = fixture(); const verified = verifyPreDeployCertificate(first.certificatePath);
    const promoted = promoteAprBundles(verified);
    expect(promoted.installed).toHaveLength(3);
    expect(readFileSync(path.join(promoted.activePointer, "apr-enea-worker.mjs"), "utf8")).toContain("apr-enea-worker");
    expect(promoted.previousTarget).toBeNull();
    expect(promoted.receipt.payload.status).toBe("PASS");
  });

  it("prepara i plist soltanto con guardia emessa e receipt PASS dello stesso certificato", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    const promoted = promoteAprBundles(verified, { attemptId: "guarded-plist" });
    const options = { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 };
    const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, options);
    expect(prepared).toMatchObject({ ready: true, loadPerformed: false }); expect(prepared.entries).toHaveLength(3);
    for (const entry of prepared.entries) {
      expect(entry.path.startsWith(options.installDirectory)).toBe(true);
      expect(entry.bundlePath).toContain(path.join("versions", promoted.versionId));
      expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
    }
    let activationCalls = 0;
    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    const activation = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
    expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, receipt: { payload: { status: "PASS", promotionReceiptId: promoted.receipt.payload.receiptId } }, loadPerformed: true, simulated: true }); expect(activationCalls).toBe(1);
    const activationRoles = activation.roles; if (!activationRoles) throw new Error("expected_new_activation");
    expect(activationRoles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
    expect(activationCalls).toBe(1);
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "invalid-id"), promotionVersionId: promoted.versionId, controller, activationId: "../escape" })).toThrow(/activation_id_invalid/);
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "wrong-version"), promotionVersionId: "wrong-version", controller, activationId: "wrong-version" })).toThrow(/promotion_binding_mismatch/);
    let rollbackCalled = false;
    const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
    const promotedBundleTarget = readlinkSync(promoted.activePointer);
    const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
    expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") }, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } }); expect(rollbackCalled).toBe(true);
    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
    const repeatedAfterFailedActivation = promoteAprBundles(verified);
    expect(repeatedAfterFailedActivation.receipt.artifactId).toBe(promoted.receipt.artifactId);
    expect(readlinkSync(repeatedAfterFailedActivation.activePointer)).toBe(promotedBundleTarget);
    let recoveryActivations = 0;
    const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: false });
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: true });
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
    expect(recoveryActivations).toBe(1);
    let recoveryRollbacks = 0;
    const rollbackRecoveryController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { recoveryRollbacks += 1; return { restored: true }; } };
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback", crashAt: "during_rollback" })).toThrow(/simulated_crash_during_rollback/);
    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ rollbackVerified: true });
    expect(readlinkSync(promoted.activePointer)).toBe(promotedBundleTarget);
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true });
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
    expect(recoveryRollbacks).toBe(1);
    const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
    expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
    const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), failedReceipt, { ...options, installDirectory: path.join(value.root, "failed") })).toThrow(/receipt_not_pass/);
    const mismatchedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "mismatched-receipt", preDeployCertificateId: sha("9") }, promoted.receipt.localMetadata);
    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), mismatchedReceipt, { ...options, installDirectory: path.join(value.root, "mismatched") })).toThrow(/certificate_mismatch/);
  });

  it("non riattiva i servizi se trova una receipt PASS scritta prima del crash", () => {
    const { value, promoted, prepared } = activationFixture("recovery-pass-receipt"); let activationCalls = 0;
    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 700 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    const activationRoot = path.join(value.root, "pass-receipt-crash");
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "pass-receipt-crash", crashAt: "after_receipt", now: new Date("2026-08-24T01:00:00.000Z") })).toThrow(/simulated_crash_after_receipt/);
    expect(activationCalls).toBe(1);
    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "pass-receipt-crash" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
    expect(activationCalls).toBe(1);
  });

  it("non ripete il rollback se trova una receipt FAIL scritta prima del crash", () => {
    const { value, promoted, prepared } = activationFixture("recovery-fail-receipt"); let activationCalls = 0; let rollbackCalls = 0;
    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }; }, rollback: () => { rollbackCalls += 1; return { restored: true }; } };
    const activationRoot = path.join(value.root, "fail-receipt-crash");
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "fail-receipt-crash", crashAt: "after_receipt", now: new Date("2026-08-24T01:01:00.000Z") })).toThrow(/simulated_crash_after_receipt/);
    expect({ activationCalls, rollbackCalls }).toEqual({ activationCalls: 1, rollbackCalls: 1 });
    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "fail-receipt-crash" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
    expect({ activationCalls, rollbackCalls }).toEqual({ activationCalls: 1, rollbackCalls: 1 });
  });

  it("riusa durante la recovery la deadline originale persistita", () => {
    const { value, promoted, prepared } = activationFixture("recovery-original-deadline"); let observedDeadline: string | null = null;
    const controller: AprServiceController = { activate: (request) => { observedDeadline = request.healthDeadlineAt; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 800 + index, bundlePath: role.bundlePath, heartbeatAt: "2020-01-01T00:00:01.000Z", checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    const activationRoot = path.join(value.root, "original-deadline-crash");
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot, promotionVersionId: promoted.versionId, controller, activationId: "original-deadline-crash", crashAt: "after_pointer", now: new Date("2020-01-01T00:00:00.000Z"), healthWindowMs: 30_000 })).toThrow(/simulated_crash_after_pointer/);
    expect(observedDeadline).toBeNull();
    expect(recoverAprServiceActivation({ activationRoot, promotionReceipt: promoted.receipt, controller, activationId: "original-deadline-crash" })).toMatchObject({ health: { status: "PASS" } });
    expect(observedDeadline).toBe("2020-01-01T00:00:30.000Z");
  });

  it("non sposta il puntatore attivo se un hash post-copy non coincide", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { attemptId: "failed-copy", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
    expect(() => readFileSync(path.join(value.root, "installed", "current"))).toThrow();
    const receipts = path.join(value.root, "installed", "receipts", `promotion-${verified.certificateArtifactId}-failed-copy.json`);
    expect(JSON.parse(readFileSync(receipts, "utf8")).payload.status).toBe("FAIL");
  });

  it("consente un nuovo tentativo PASS dopo una receipt FAIL dello stesso certificato", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { attemptId: "attempt-fail", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
    const promoted = promoteAprBundles(verified, { attemptId: "attempt-pass", now: new Date("2026-08-23T22:41:00.000Z") });
    expect(promoted.receipt.payload).toMatchObject({ attemptId: "attempt-pass", status: "PASS" });
    const receiptFiles = readdirSync(path.join(value.root, "installed", "receipts")).sort();
    expect(receiptFiles).toEqual([`promotion-${verified.certificateArtifactId}-attempt-fail.json`, `promotion-${verified.certificateArtifactId}-attempt-pass.json`]);
    const latest = JSON.parse(readFileSync(path.join(value.root, "installed", "latest-receipts", `${verified.certificateArtifactId}.json`), "utf8"));
    expect(latest).toMatchObject({ receiptId: `promotion-${verified.certificateArtifactId}-attempt-pass`, status: "PASS" });
  });

  it("riprende dopo crash tra pointer e receipt senza duplicare la promozione", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { now: new Date("2026-08-23T22:41:00.000Z"), crashAfterPointerSwitch: true })).toThrow(/simulated_crash/);
    const recovered = recoverAprBundlePromotion(verified);
    const repeated = promoteAprBundles(verified, { now: new Date("2026-08-23T23:00:00.000Z") });
    expect(recovered.receipt.artifactId).toBe(repeated.receipt.artifactId);
    expect(recovered.installed.map((item) => item.installedSha256)).toEqual(repeated.installed.map((item) => item.installedSha256));
    expect(repeated.receipt.payload.promotedAt).toBe("2026-08-23T22:41:00.000Z");
  });
});

```
# FINE TEST CORRENTI aprPreDeployVerification.test.ts

