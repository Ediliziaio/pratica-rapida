# BLOCCO 3/3 — APR: codice rilevante e contratti sanitizzati

> Questo blocco permette di ragionare sull'architettura senza accesso al repository.
> Gli estratti sono ridotti e sanitizzati: nessun URL reale, segreto, identificativo pratica o dato personale.

## 6. CODICE RILEVANTE

### Manifest dei file chiave

| File nel repository | Responsabilità |
|---|---|
| `src/features/enea-shadow-crm/operationalRegistry.ts` | registro unico versionato delle regole business e invarianti tecniche |
| `src/features/enea-shadow-crm/ruleTestMatrix.ts` | associa ogni regola ai test automatici dichiarati |
| `src/features/enea-shadow-crm/documentedProductRouting.ts` | determina il modulo dai prodotti rilevati nelle fonti originarie |
| `src/features/enea-shadow-crm/aprCrmIntegrationContract.ts` | contratto idempotente/reversibile delle future scritture CRM |
| `src/features/enea-shadow-crm/aprCrmReadOnlyContract.ts` | allowlist GET/HEAD e validazione fail-closed |
| `src/features/enea-shadow-crm/financialReconciliation.ts` | riconcilia fatture, bonifici, IVA e importo detraibile |
| `src/features/enea-shadow-crm/productCardinalityPolicy.ts` | impone una riga per prodotto fisico |
| `src/features/enea-shadow-crm/infissiTechnicalSources.ts` | risolve misure, quantità e trasmittanza Infissi |
| `src/features/enea-shadow-crm/infissiOldWindowTransmittance.ts` | matrice del vecchio infisso e fallback 6,0 |
| `src/features/enea-shadow-crm/infissiProductRules.ts` | materiale/vetro, chiusure oscuranti e fallback |
| `src/features/enea-shadow-crm/infissiEneaDraftPayload.ts` | payload auditato per la pagina tecnica Infissi |
| `src/features/enea-lab/invoiceParser.ts` | parsing fatture, righe tecniche e descrizioni narrative |
| `src/features/enea-lab/mapper.ts` | normalizzazione delle sezioni condivise ENEA |
| `src/features/enea-lab/portalBeneficiary.ts` | contratto DOM beneficiario/cointestatari |
| `src/features/enea-lab/portalBuilding.ts` | contratto DOM immobile e autocomplete comune |
| `src/features/enea-lab/portalIntervention.ts` | contratto DOM intervento |
| `src/features/enea-lab/portalPlant.ts` | contratto DOM impianto esistente |
| `src/features/enea-lab/portalScreening.ts` | contratto DOM singola schermatura |
| `src/features/enea-lab/portalCalculation.ts` | allocazione 50%/36% |
| `scripts/enea-shadow-runner/crmAuth.ts` | sessione CRM e accesso GET autenticato |
| `scripts/enea-shadow-runner/crmAuthenticatedReadOnly.ts` | acquisizione dossier e fingerprint |
| `scripts/enea-shadow-runner/crmOriginalDocuments.ts` | download e verifica allegati originari |
| `scripts/enea-shadow-runner/crmDocumentAnalysis.ts` | orchestrazione PDF/OCR |
| `scripts/enea-shadow-runner/crmLocalPreflight.ts` | preflight comune e blocker |
| `scripts/enea-shadow-runner/infissiBatchPreflight.ts` | preflight Infissi |
| `scripts/enea-shadow-runner/infissiDraftPackage.ts` | pacchetto workflow reale Infissi |
| `scripts/enea-shadow-runner/eneaDraftExecution.ts` | stato persistente della bozza |
| `scripts/enea-shadow-runner/aprEneaBrowserWorker.ts` | esecutore operativo APR |
| `scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts` | driver CDP del portale ENEA |
| `scripts/enea-shadow-runner/readinessLease.ts` | lease, keepalive e login_required globale |
| `scripts/enea-shadow-runner/caseStatusTruth.ts` | verità pubblica del caso |
| `scripts/enea-shadow-runner/deepCaseReview.ts` | classificazione approfondita dei casi fermati |
| `scripts/enea-shadow-runner/aprLearningBaseline.ts` | baseline di apprendimento |
| `scripts/enea-shadow-runner/aprLearningReplay.ts` | replay delle coorti |
| `scripts/enea-shadow-runner/aprRuleRuntimeRevision.ts` | WIP: revisioni runtime delle regole, non ancora certificato |
| `scripts/enea-shadow-runner/aprMonotonicLearningGate.ts` | WIP: gate monotono, non ancora certificato |

### 6.1 Contratto dell'evento CRM in ingresso

```ts
interface CrmInboundPracticeEvent {
  eventId: string;
  practiceId: string;
  customerId: string;
  module: "ENEA";
  crmRevision: number;
  currentPipeline: string;
  currentStatus: string;
  dossierLocator: string;
}

interface CrmIncomingState {
  revision: number;
  status: "idle" | "working" | "operator_required"
        | "login_required" | "technical_block";
  items: Array<{
    eventId: string;
    practiceId: string | null;
    displayName: string; // nelle fixture condivise usare <CLIENTE_ESEMPIO>
    state: "pending_dispatch" | "dispatched" | "excluded" | "blocked_invalid";
    firstObservedAt: string;
    dispatchedAt: string | null;
    responseSha256: string;
  }>;
  externalActionAllowed: false;
  mutationAllowed: false;
  transport: "authenticated_get_only";
  sourcePipeline: "Pronte da fare";
  reason: string;
  nextAction: string;
  audit: AuditEvent[];
}
```

Osservazione: `updated_at` viene convertito in revisione numerica e combinato con l'ID pratica per creare un evento idempotente.

### 6.2 Schema minimo del dossier CRM letto

```ts
type CrmDossier = {
  id: string;
  cliente_nome: string;
  cliente_cognome: string;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
  cliente_cf?: string | null;
  prodotto_installato?: string | null;
  fatture_urls: string[];
  documenti_aggiuntivi_urls: string[];
  dati_form: FormCliente;
  form_compilato_at?: string | null;
  created_at: string;
  updated_at: string;
  fornitore?: string | null;
  current_stage_id?: string | null;
  pipeline_stages: { stage_type: string } | Array<{ stage_type: string }>;
  companies?: { ragione_sociale?: string | null } | null;
};
```

Il trasporto reale usa concettualmente:

```ts
GET <CRM_REST_BASE>/enea_practices_public?<QUERY_ALLOWLISTATA>
GET <CRM_STORAGE_BASE>/<BUCKET>/<PERCORSO_VALIDATO>
```

Non allegare i valori reali di origin, header di autenticazione o chiavi.

### 6.3 Contratto delle future scritture CRM

```ts
interface CrmIntegrationCommand {
  contractVersion: string;
  kind: "move_customer" | "link_customer_artifact";
  execution: "local_simulation_only" | "future_adapter_only";
  idempotencyKey: string;
  eventId: string;
  practiceId: string;
  customerId: string;
  expected: {
    pipeline: string;
    status: string;
    crmRevision: number;
  };
  desired: {
    pipeline: string;
    status: string;
    operatorRequest?: OperatorRequest;
    clearOperatorRequest?: boolean;
    artifact?: { kind: "enea_pdf" | "enea_email_receipt"; fingerprint: string };
  };
  compensation: {
    pipeline: string;
    status: string;
    unlinkArtifactFingerprint?: string;
  };
  reason: string;
  appliedRuleIds: readonly string[];
  externalActionAllowed: false;
}
```

Problema da valutare: il contratto è buono come design, ma nessun adapter mutativo reale lo esegue.

### 6.4 Registro unico delle regole

Forma semplificata:

```ts
interface OperationalRegistryRule {
  id: string;
  kind: "business" | "system";
  step: string;
  condition: string;
  sourcePrecedence: readonly string[];
  deterministicAction: string;
  audit: string;
  outcome: "continue" | "operator_required" | "global_block";
}

const REGISTRY_VERSION = "<REGISTRY_VERSION>";
const REGISTRY: readonly OperationalRegistryRule[] = Object.freeze([
  /* regole versionate */
]);

function registryRule(id: string) {
  return REGISTRY_BY_ID.get(id) ?? null;
}
```

Gate di apprendimento desiderato:

```ts
function canActivateRule(input: {
  incidentId: string;
  blockerCode: string;
  ruleId: string;
  positiveTestPassed: boolean;
  negativeTestPassed: boolean;
  registryFingerprint: string;
  matrixFingerprint: string;
  builtBundleSha256: string;
  installedBundleSha256: string;
  replayOutcome: "improved" | "same" | "regressed";
}) {
  return Boolean(
    input.incidentId &&
    input.blockerCode &&
    input.ruleId &&
    input.positiveTestPassed &&
    input.negativeTestPassed &&
    input.registryFingerprint &&
    input.matrixFingerprint &&
    input.builtBundleSha256 === input.installedBundleSha256 &&
    input.replayOutcome !== "regressed"
  );
}
```

Nel progetto attuale questa idea esiste in più componenti, ma non è ancora l'unico passaggio obbligatorio di deploy.

### 6.5 Routing del prodotto dalle fonti

Comportamento semplificato:

```ts
type ProductModule = "screening" | "infissi" | "mixed" | "unresolved";

function routeFromOriginalSources(input: {
  documentedProductKinds: string[];
  crmLabel?: string | null;
}): {
  module: ProductModule;
  source: "original_documents" | "declared_label" | "unresolved";
  appliedRuleIds: string[];
} {
  const modules = classifyDocumentedProducts(input.documentedProductKinds);
  if (modules.length > 0) {
    return {
      module: modules.length > 1 ? "mixed" : modules[0],
      source: "original_documents",
      appliedRuleIds: ["documented-product-module-over-label"],
    };
  }
  return {
    module: classifyLabel(input.crmLabel) ?? "unresolved",
    source: input.crmLabel ? "declared_label" : "unresolved",
    appliedRuleIds: ["documented-product-module-over-label"],
  };
}
```

Una pratica mista deve conservare entrambe le famiglie; non va forzata nel modulo indicato dall'etichetta. VEPA viene riconosciuta da un contratto separato (`vepaModule.ts`) e non è ancora compresa in questa funzione di routing schermature/infissi.

### 6.6 Stato persistente della coda

```ts
type JobExecutionState =
  | "queued"
  | "checkpoint_resumable"
  | "draft_in_progress"
  | "draft_saved"
  | "waiting_enea_lease"
  | "operator_intervention"
  | "completed";

interface PersistentRunnerJob {
  practice: SanitizedPractice;
  executionState: JobExecutionState;
  checkpoint: {
    step: string;
    practiceRevision: number;
    resumable: boolean;
  };
  selectionCount: number;
  draftRun: {
    status: "creating" | "created" | "saved" | "failed";
    preflightId: string;
    policyRuleId: string;
    draftId: string | null;
    portalUrl: string | null;
    startedAt: string;
    savedAt: string | null;
    evidenceCount: number;
    error: string | null;
  } | null;
}

interface PersistentRunnerState {
  version: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  runner: {
    status: "off" | "running" | "stopped" | "completed";
    ownerId: string | null;
    leaseUntil: string | null;
    heartbeatAt: string | null;
    currentPracticeId: string | null;
    reason: string;
    nextAction: string;
  };
  queue: PersistentRunnerJob[];
  processedIdempotencyKeys: string[];
  audit: AuditEvent[];
}
```

Ogni evento audit deve contenere `idempotencyKey`, `appliedRuleIds`, motivo e prossima azione.

### 6.7 Download e verifica degli allegati

```ts
async function acquireOriginalDocument(item: DocumentItem) {
  assertPathBelongsToPractice(item.practiceId, item.sourcePath);
  persistIntentBeforeRequest(item.documentKey);

  const response = await readOnlyStorageGet(
    "<DOCUMENT_BUCKET>",
    item.sourcePath,
  );

  assert(response.ok);
  assert(contentLength(response) <= 20 * 1024 * 1024);
  const bytes = await response.arrayBuffer();
  assert(detectBinaryFormat(bytes) === expectedFormat(item));

  const fingerprint = sha256(bytes);
  atomicWriteProtectedLocalCopy(bytes);
  persistDownloadedEvidence({ fingerprint, mime: response.contentType });
}
```

I documenti ENEA storici non possono alimentare il mapper; sono ammessi solo come benchmark post-bozza.

### 6.8 Matrice della trasmittanza del vecchio infisso

```ts
const OLD_WINDOW_U: Record<string, Record<string, number>> = {
  vetro_singolo: {
    legno: 5.0,
    pvc: 5.0,
    metallo_taglio_termico: 5.3,
    metallo_senza_taglio_termico: 6.0,
    misto: 5.2,
  },
  vetro_doppio: {
    legno: 3.0,
    pvc: 3.5,
    metallo_taglio_termico: 3.5,
    metallo_senza_taglio_termico: 4.1,
    misto: 3.2,
  },
  vetro_triplo: {
    legno: 2.1,
    pvc: 2.1,
    metallo_taglio_termico: 2.5,
    metallo_senza_taglio_termico: 3.4,
    misto: 2.4,
  },
  pannello: {
    legno: 2.8,
    pvc: 2.8,
    metallo_taglio_termico: 5.3,
    metallo_senza_taglio_termico: 6.0,
    misto: 5.2,
  },
};

function resolveOldWindowU(material?: string, glazing?: string, doubt = false) {
  if (doubt || !isExactMaterial(material) || !isExactGlazing(glazing)) {
    return {
      value: 6.0,
      source: "authorized_precautionary_fallback",
      ruleId: "infissi-old-window-transmittance-matrix",
    };
  }
  return {
    value: OLD_WINDOW_U[glazing][material],
    source: "form_matrix_combination",
    ruleId: "infissi-old-window-transmittance-matrix",
  };
}
```

### 6.9 Payload Infissi

```ts
interface InfissiDraftPayload {
  version: string;
  practiceId: string;
  interventionType: "comma_345a_building_envelope";
  physicalWindowCount: number;
  windows: Array<{
    physicalRowId: string;
    widthM: number;
    heightM: number;
    areaM2: number; // ENEA: un decimale; esatto conservato nell'audit a monte
    sourceNewWindowThermalTransmittanceWm2K: number;
    newWindowThermalTransmittanceWm2K: number;
    oldWindowThermalTransmittanceWm2K: number;
    frameMaterial: string;
    glassType: string;
    shadingClosuresChecked: boolean;
  }>;
  expenseGrossVatIncluded: number;
  portalManagedFields: {
    energySavings: "leave_unset_portal_computed";
  };
  audit: {
    appliedRuleIds: string[];
    fieldEvidence: Array<{
      physicalRowId: string | null;
      field: string;
      source: string;
      ruleId: string;
    }>;
  };
}
```

Trasformazione della trasmittanza nuova:

```ts
function mapNewWindowUForEnea(sourceValue: number) {
  if (!Number.isFinite(sourceValue) || sourceValue <= 0) throw new Error("invalid_u");
  return sourceValue > 1.3
    ? { sourceValue, eneaValue: 1.3, transformed: true }
    : { sourceValue, eneaValue: sourceValue, transformed: false };
}
```

### 6.10 Pacchetto bozza e sicurezza

```ts
interface EneaDraftPackage {
  module: "screening" | "infissi";
  customerKey: string;
  practiceId: string;
  packageFingerprint: string;
  workflowFingerprint: string;
  workflow: {
    steps: PortalStep[];
    productSteps: PortalStep[];
  };
  safety: {
    createAllowedAfterPersistentIntent: true;
    saveAllowedAfterAllPageCheckpoints: true;
    previewAllowed: false;
    submitAllowed: false;
    communicationsAllowed: false;
  };
}
```

Ordine semplificato degli step Infissi:

```ts
const steps = [
  beneficiary,
  building,
  intervention,
  existingPlant,
  existingGenerator,
  technicalSummary,
  calculation, // energySavings lasciato non valorizzato
];

const productSteps = payload.windows.map((window, index) => ({
  id: `infisso-${index + 1}`,
  fields: [
    oldFrameMaterial,
    oldGlassType,
    oldThermalTransmittance,
    area,
    newFrameMaterial,
    newGlassType,
    newThermalTransmittance,
    boundaryToExterior,
    shadingClosures,
  ],
}));
```

### 6.11 Salvataggio idempotente e stato incerto

```ts
async function savePageSafely(page: PageCheckpoint) {
  persist({
    state: "save_intent_recorded",
    saveAttemptCount: page.saveAttemptCount + 1,
  });

  await clickSaveOnce();

  const evidence = await Promise.all([
    observeAllowedRedirect(),
    rereadPersistedFieldsWithGet(),
    observeServerLastModified(),
  ]);

  if (provesSaved(evidence)) {
    persist({ state: "saved", evidence });
    return;
  }

  persist({
    state: "uncertain_page_save",
    evidence,
    nextAction: "operator_or_readonly_recovery",
  });
  // Nessun secondo Salva automatico alla cieca.
}
```

### 6.12 Sessione ENEA e keepalive

```ts
interface SessionEvidence {
  authenticated: boolean;
  serverLogoutProven: boolean;
  evidenceId: string;
  observedAt: string;
}

function classifySession(e: SessionEvidence) {
  if (!e.authenticated && e.serverLogoutProven) return "login_required";
  if (!e.authenticated) return "expired_or_blocked";
  return "authenticated_active";
}

async function keepAlive() {
  return fetch("<ENEA_SAFE_READONLY_URL>", {
    method: "GET", // oppure HEAD
    credentials: "include",
    cache: "no-store",
  });
}
```

### 6.13 Verità del caso

La risposta pubblica non dovrebbe essere ricavata da un singolo checkpoint:

```ts
function caseTruth(input: {
  checkpointStatus: string;
  reportBlockers: Blocker[];
  dashboardStatus: string;
}) {
  const blocked = input.checkpointStatus === "blocked_case";
  const hasCoherentBlocker = input.reportBlockers.some(isCoherentBlocker);

  if (blocked !== hasCoherentBlocker) return "INCONSISTENT";
  if (input.dashboardStatusDisagrees) return "INCONSISTENT";
  if (blocked && hasCoherentBlocker) return "OPERATOR_REQUIRED";
  return "READY";
}
```

Una limitazione globale come `externalActionAllowed=false` non deve trasformare un caso `READY` in un blocker per-pratica.

### 6.14 Suite di test rilevante

Comandi previsti dal repository:

```sh
npm run test:infissi
npm run test:infissi:related
npm run typecheck:enea-runner
npm run build:apr-bundles
npm run test:enea-restart
```

Categorie indispensabili:

- parser PDF/OCR multipagina;
- routing prodotto dalla fonte;
- precedenza esplicito > fallback;
- cardinalità fisica 1:1;
- riconciliazione finanziaria;
- matrice vecchio infisso 20/20 + fallback;
- payload senza risparmio energetico;
- DOM locale delle pagine;
- crash/ripresa prima e dopo create/save intent;
- Salva incerto senza doppia mutazione;
- isolamento blocker e prosecuzione coda;
- confronto monotono baseline precedente/nuova;
- SHA-256 bundle costruito/installato;
- verità coerente fra checkpoint, report e dashboard.

### 6.15 Materiale che NON deve essere condiviso

Non allegare a un assistente esterno:

```text
config/**
<RUNTIME_DIR>/**
**/crm-auth/**
**/dossiers/**
**/crm-original-documents/files/**
**/logs/**
**/checkpoints/** reali
**/*.plist installati
qualsiasi screenshot CRM/ENEA con dati reali
```

Per ulteriori analisi creare fixture sintetiche con:

```text
<CLIENTE_ESEMPIO>
<CODICE_FISCALE_SINTETICO_VALIDO>
<INDIRIZZO_ESEMPIO>
<CRM_API_ORIGIN>
<ENEA_BASE_URL>
<DOCUMENT_BUCKET>
<PUBLIC_CLIENT_KEY>
```

### Conclusione per il revisore esterno

APR non è un prototipo vuoto: possiede parser, regole, coda persistente, dashboard e un driver che ha creato bozze reali. Il limite principale non è l'assenza di funzionalità, ma la mancanza di una **pipeline unica, monotona e riproducibile** che garantisca che ogni correzione generalizzata sia davvero attiva nello stesso bundle che esegue le pratiche e che tutti i gate condividano la stessa verità.

Il revisore dovrebbe proporre miglioramenti architetturali senza assumere che:

- una regola documentata sia già attiva;
- un test locale equivalga a un test portale;
- `READY` equivalga a bozza salvata;
- un PDF storico sia una fonte di compilazione;
- il CRM reale sia già modificabile;
- il sistema sia pronto per produzione.

---

**Fine BLOCCO 3/3.**
