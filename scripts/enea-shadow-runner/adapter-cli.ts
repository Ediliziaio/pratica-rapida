#!/usr/bin/env node
import path from "node:path";
import { VERIFIED_LOCAL_READ_ONLY_FIXTURE } from "./fixtures/readOnlyAdapterFixture";
import { PersistentReadOnlyAdapter, ReadOnlyAdapterBusyError } from "./readOnlyAdapter";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const adapter = new PersistentReadOnlyAdapter(rootDirectory);

try {
  if (command === "init") adapter.initialize();
  else if (command === "fixture") adapter.runLocalFixture(
    VERIFIED_LOCAL_READ_ONLY_FIXTURE,
    option("--command-id") ?? `fixture:${VERIFIED_LOCAL_READ_ONLY_FIXTURE.id}:${crypto.randomUUID()}`,
  );
  else if (command === "block-chrome-unavailable") adapter.recordConnectionBlock({
    idempotencyKey: option("--command-id") ?? `chrome-unavailable:${crypto.randomUUID()}`,
    reason: "Chrome è in esecuzione e i componenti locali risultano installati, ma la connessione controllata non è disponibile; identità, profilo, schede, autenticazione e capability documenti non sono verificabili.",
    nextAction: "Autorizzare l'apertura controllata di una finestra del profilo Chrome per un ultimo tentativo di connessione; se fallisce, reinstallare il plugin Browser dalla UI di Codex. Non aprire nuove schede CRM/ENEA.",
  });
  else if (command === "block-existing-tabs-missing") adapter.recordConnectionBlock({
    idempotencyKey: option("--command-id") ?? `existing-tabs-missing:${crypto.randomUUID()}`,
    reason: "Discovery nativa verificata sull'unica istanza dell'estensione Chrome collegata, profilo Default (nome Giuliano): chrome.tabs.query({}) espone soltanto about:blank. Le finestre CRM/ENEA dichiarate esistenti non appartengono quindi al contesto profilo/estensione osservabile e non sono agganciabili da questa sessione.",
    nextAction: "Configurazione stabile richiesta: usare un'unica istanza Chrome persistente nel profilo Default/Giuliano con l'estensione abilitata e mantenere in quel solo contesto le schede CRM ed ENEA. Ripetere il gate read-only prima di abilitare la coda; nessuna pratica viene selezionata.",
  });
  else if (command === "block-enea-login-required") adapter.recordConnectionBlock({
    idempotencyKey: option("--command-id") ?? `enea-login-required:${crypto.randomUUID()}`,
    reason: "Configurazione Chrome stabile verificata nel profilo Default/Giuliano: sono enumerate esattamente una scheda CRM e una ENEA. Il CRM è autenticato; ENEA reindirizza la dashboard alla home pubblica e richiede login personale.",
    nextAction: "L'operatore deve autenticarsi personalmente nella scheda ENEA già aperta, senza condividere credenziali o OTP; poi va ripetuto il gate read-only. La coda resta bloccata e nessuna pratica viene selezionata.",
  });
  else if (command === "block-document-capability-unverified") adapter.recordConnectionBlock({
    idempotencyKey: option("--command-id") ?? `document-capability-unverified:${crypto.randomUUID()}`,
    reason: "Adattatore browser reale verificato in sola lettura su identità persistente, una scheda CRM e una ENEA, origini HTTPS allowlist, autenticazioni e GET innocuo della dashboard ENEA. La lettura di un allegato reale non è stata provata perché richiederebbe selezionare una pratica, azione vietata nel gate corrente.",
    nextAction: "Mantenere il blocco globale; acquisire in una fase separatamente autorizzata una sola prova read-only di allegato già noto, senza modificare o avviare la pratica, quindi ripetere il gate.",
  });
  else if (command === "record-browser-attachment-verified") adapter.recordBrowserReadOnlyVerifiedBeforeQueue({
    idempotencyKey: option("--command-id") ?? `browser-attachment-verified:${crypto.randomUUID()}`,
    profileName: option("--profile-name") ?? "",
    browserIdentity: option("--browser-identity") ?? "",
    crmOrigin: option("--crm-origin") ?? "",
    eneaOrigin: option("--enea-origin") ?? "",
    attachmentOrigin: option("--attachment-origin") ?? "",
    attachmentBucket: option("--attachment-bucket") ?? "",
    attachmentContentType: option("--attachment-content-type") ?? "",
    attachmentObjectDepth: Number(option("--attachment-object-depth") ?? "0"),
  });
  else if (command !== "status") throw new Error("Comando adattatore non valido. Usare: init, fixture, block-chrome-unavailable, block-existing-tabs-missing, block-enea-login-required, block-document-capability-unverified, record-browser-attachment-verified oppure status.");
  process.stdout.write(`${JSON.stringify(adapter.snapshot(), null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${error instanceof ReadOnlyAdapterBusyError ? "ADAPTER_BUSY" : "ADAPTER_ERROR"}: ${message}\n`);
  process.exitCode = 1;
}
