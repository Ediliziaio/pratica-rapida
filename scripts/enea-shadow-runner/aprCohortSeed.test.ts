import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APR_COHORT_SEED_VERSION, PersistentAprCohortSeed, validateAprCohortSeed, type AprCohortSeedManifest } from "./aprCohortSeed";

const candidates = Array.from({ length: 10 }, (_, index) => ({ customerKey: `case-${index + 1}`, displayName: `Caso ${index + 1}` }));
const manifest = (): AprCohortSeedManifest => ({ version: APR_COHORT_SEED_VERSION, sourceEvidenceId: "user-batch-2026-08-16", candidates });

describe("seed persistente di una nuova coorte APR", () => {
  it("accetta soltanto un batch esplicitamente autorizzato di 40 pratiche", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-cohort-forty-seed-"));
    const forty = Array.from({ length: 40 }, (_, index) => ({ customerKey: `case-${index + 1}`, displayName: `Caso ${index + 1}`, practiceId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, expectedStageType: index % 2 ? "archiviate" as const : "recensione" as const, productModule: index < 20 ? "screening" as const : "infissi" as const }));
    const seeded = new PersistentAprCohortSeed(root).seed({ version: APR_COHORT_SEED_VERSION, sourceEvidenceId: "crm-mixed-forty-evidence", candidates: forty, authorizedBatch: { authorizationId: "user-mixed-forty-2026-08-23", exactCount: 40 }, historicalRetest: { authorizationId: "user-mixed-forty-historical-2026-08-23", preservePriorDrafts: true } }, mkdtempSync(path.join(tmpdir(), "apr-cohort-forty-history-")));
    expect(seeded).toMatchObject({ status: "armed_readonly", executor: "apr_persistent_runtime" }); expect(seeded.candidates).toHaveLength(40);
    expect(seeded.candidates.filter((candidate) => candidate.productModule === "screening")).toHaveLength(20);
    expect(seeded.candidates.filter((candidate) => candidate.productModule === "infissi")).toHaveLength(20);
    expect(seeded.audit[0].appliedRuleIds).toContain("user-2026-08-23-mixed-forty-case-reliability-test");
  });
  it("configura dieci casi senza azioni esterne e ripete idempotentemente lo stesso seed", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-cohort-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-history-"));
    const store = new PersistentAprCohortSeed(root);
    const first = store.seed(manifest(), history, new Date("2026-08-16T12:00:00Z"));
    const replay = new PersistentAprCohortSeed(root).seed(manifest(), history, new Date("2026-08-16T12:01:00Z"));
    expect(first).toMatchObject({ status: "armed_readonly", executor: "apr_persistent_runtime", externalActionAllowed: false });
    expect(replay).toEqual(first);
    expect(first.audit).toHaveLength(1);
    expect(first.candidates).toHaveLength(10);
    expect(first.audit[0].appliedRuleIds).toContain("user-2026-08-16-ten-case-monday-restart");
  });

  it("ammette la fase gestionale soltanto con identita pratica valida e conserva il controllo fail-closed", () => {
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-gestionale-history-"));
    const scoped = candidates.map((candidate, index) => index === 0 ? {
      ...candidate,
      practiceId: "00000000-0000-4000-8000-000000000001",
      expectedStageType: "gestionale" as const,
      productModule: "screening" as const,
    } : candidate);
    expect(validateAprCohortSeed({ ...manifest(), candidates: scoped }, history)).toHaveLength(10);
    expect(() => validateAprCohortSeed({
      ...manifest(),
      candidates: scoped.map((candidate, index) => index === 0 ? { ...candidate, practiceId: undefined } : candidate),
    }, history)).toThrow("apr_cohort_seed_practice_scope_invalid");
    expect(() => validateAprCohortSeed({
      ...manifest(),
      candidates: scoped.map((candidate, index) => index === 0 ? { ...candidate, expectedStageType: "fase_non_ammessa" as never } : candidate),
    }, history)).toThrow("apr_cohort_seed_practice_scope_invalid");
  });

  it("congela la generazione pulita, la audita e rifiuta mutazioni o identificativi non validi", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-cohort-fresh-generation-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-fresh-generation-history-"));
    const store = new PersistentAprCohortSeed(root);
    const freshManifest: AprCohortSeedManifest = {
      ...manifest(),
      draftGenerationPolicy: {
        mode: "fresh_generation",
        experimentId: "apr-generation-ab-r47-2026-09-04",
      },
    };
    const seeded = store.seed(freshManifest, history, new Date("2026-09-04T08:00:00Z"));
    expect(seeded).toMatchObject({
      draftGenerationPolicy: { mode: "fresh_generation", experimentId: "apr-generation-ab-r47-2026-09-04" },
      reason: expect.stringContaining("non puo adottare mapping di generazioni precedenti"),
    });
    expect(seeded.audit[0].appliedRuleIds).toContain("system-generation-scoped-canonical-draft-v1");
    expect(() => store.seed({ ...freshManifest, draftGenerationPolicy: undefined }, history)).toThrow("apr_cohort_seed_immutable");
    expect(() => validateAprCohortSeed({
      ...manifest(),
      draftGenerationPolicy: { mode: "fresh_generation", experimentId: "bad" },
    }, history)).toThrow("apr_cohort_draft_generation_policy_invalid");
  });

  it("rifiuta coorti ordinarie diverse da dieci", () => {
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-size-history-"));
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: candidates.slice(0, 9) }, history)).toThrow("apr_cohort_seed_size_invalid:9");
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: [...candidates, { customerKey: "case-11", displayName: "Caso 11" }] }, history)).toThrow("apr_cohort_seed_size_invalid:11");
  });

  it("consente due casi nuovi soltanto con autorizzazione small-batch esplicita", () => {
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-small-history-"));
    const small: AprCohortSeedManifest = {
      ...manifest(),
      sourceEvidenceId: "user-two-case-batch-2026-08-17",
      candidates: candidates.slice(0, 2),
      authorizedSmallBatch: { authorizationId: "user-two-case-batch-2026-08-17", minimumCases: 2 },
    };
    expect(validateAprCohortSeed(small, history)).toHaveLength(2);
    expect(() => validateAprCohortSeed({ ...small, candidates: candidates.slice(0, 1) }, history)).toThrow("apr_cohort_seed_size_invalid:1");
    expect(() => validateAprCohortSeed({ ...small, authorizedSmallBatch: { authorizationId: "bad", minimumCases: 2 } }, history)).toThrow("apr_cohort_small_batch_authorization_invalid");
  });

  it("registra una coorte autorizzata di tre casi con la regola multi-caso e non con quella da quindici", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-cohort-three-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-three-history-"));
    const seeded = new PersistentAprCohortSeed(root).seed({
      ...manifest(),
      sourceEvidenceId: "user-three-case-batch-2026-08-18",
      candidates: candidates.slice(0, 3),
      authorizedBatch: { authorizationId: "user-three-case-batch-2026-08-18", exactCount: 3 },
    }, history, new Date("2026-08-18T15:00:00Z"));
    expect(seeded.audit[0].appliedRuleIds).toContain("user-2026-08-17-two-case-autonomous-batch");
    expect(seeded.audit[0].appliedRuleIds).not.toContain("user-2026-08-17-fifteen-case-intermezzo-repeat");
  });

  it("consente un solo repeat-test con autorizzazione dedicata e dichiara tutto lo storico", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-single-repeat-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-single-repeat-history-"));
    for (const [cohort, draftId] of [["old-a", "414538"], ["old-b", "414614"]] as const) {
      const executionDirectory = path.join(history, cohort, "enea-draft-execution");
      mkdirSync(executionDirectory, { recursive: true });
      writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "luca-callegari", draftId }] }));
    }
    const seeded = new PersistentAprCohortSeed(root).seed({
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-luca-single-regression-2026-08-18",
      candidates: [{ customerKey: "luca-callegari", displayName: "Luca Callegari" }],
      authorizedSingleCase: { authorizationId: "user-luca-single-regression-2026-08-18" },
      repeatTest: {
        authorizationId: "user-luca-single-regression-2026-08-18",
        priorDrafts: [{ customerKey: "luca-callegari", draftId: "414538" }, { customerKey: "luca-callegari", draftId: "414614" }],
        deletionProofRequired: false,
      },
    }, history, new Date("2026-08-18T08:00:00Z"));
    expect(seeded).toMatchObject({ status: "armed_readonly", executor: "apr_persistent_runtime", candidates: [{ customerKey: "luca-callegari" }] });
    expect(seeded.audit[0].appliedRuleIds).toContain("user-2026-08-18-single-case-regression-test");
    expect(() => validateAprCohortSeed({
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-luca-single-regression-2026-08-18",
      candidates: candidates.slice(0, 2),
      authorizedSingleCase: { authorizationId: "user-luca-single-regression-2026-08-18" },
    }, mkdtempSync(path.join(tmpdir(), "apr-single-invalid-history-")))).toThrow("apr_cohort_seed_size_invalid:2");
  });

  it("rifiuta Beatrice, duplicati e clienti che hanno già una bozza in qualunque coorte", () => {
    const history = mkdtempSync(path.join(tmpdir(), "apr-cohort-history-block-"));
    const executionDirectory = path.join(history, "apr-pilot-old", "enea-draft-execution");
    mkdirSync(executionDirectory, { recursive: true });
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "case-1", state: "saved" }] }));
    expect(() => validateAprCohortSeed(manifest(), history)).toThrow("apr_cohort_seed_prior_draft:case-1");
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: [candidates[0], candidates[0], ...candidates.slice(2)] }, mkdtempSync(path.join(tmpdir(), "apr-empty-history-"))))
      .toThrow("apr_cohort_seed_duplicate_customer");
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: [{ customerKey: "beatrice-ciotta", displayName: "Beatrice Ciotta" }, ...candidates.slice(1)] }, mkdtempSync(path.join(tmpdir(), "apr-empty-history-"))))
      .toThrow("apr_cohort_seed_ciotta_excluded");
  });

  it("esclude Giovanni Dalle Donne da ogni futura coorte APR senza alterare lo storico", () => {
    const futureCandidates = [{ customerKey: "giovanni-dalle-donne", displayName: "Giovanni Dalle Donne" }, ...candidates.slice(1)];
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: futureCandidates }, mkdtempSync(path.join(tmpdir(), "apr-future-exclusion-history-"))))
      .toThrow("apr_cohort_seed_future_test_customer_excluded:giovanni-dalle-donne");
  });

  it("esclude Paolinelli e Lionti, ma non conserva la vecchia esclusione Percaccioli dopo l'attivazione avvolgibili", () => {
    const excluded = ["vittorio-paolinelli", "sara-lionti"];
    for (const customerKey of excluded) {
      const futureCandidates = [{ customerKey, displayName: customerKey }, ...candidates.slice(1)];
      expect(() => validateAprCohortSeed({ ...manifest(), candidates: futureCandidates }, mkdtempSync(path.join(tmpdir(), "apr-module-exclusion-history-"))))
        .toThrow(`apr_cohort_seed_future_test_customer_excluded:${customerKey}`);
    }
    const percaccioliCandidates = [{ customerKey: "gianluca-percaccioli", displayName: "Gianluca Percaccioli" }, ...candidates.slice(1)];
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: percaccioliCandidates }, mkdtempSync(path.join(tmpdir(), "apr-avvolgibile-enabled-history-"))))
      .not.toThrow();
  });

  it("esclude Nicoletta Garbarino dai test futuri per fatture originarie mancanti", () => {
    const futureCandidates = [{ customerKey: "nicoletta-garbarino", displayName: "Nicoletta Garbarino" }, ...candidates.slice(1)];
    expect(() => validateAprCohortSeed({ ...manifest(), candidates: futureCandidates }, mkdtempSync(path.join(tmpdir(), "apr-missing-documents-exclusion-history-"))))
      .toThrow("apr_cohort_seed_future_test_customer_excluded:nicoletta-garbarino");
  });

  it("consente tre clienti già lavorati soltanto come repeat-test auditato e resta bloccato fino alla prova di eliminazione", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-history-"));
    const executionDirectory = path.join(history, "apr-pilot-old", "enea-draft-execution");
    mkdirSync(executionDirectory, { recursive: true });
    const repeated = candidates.slice(0, 3);
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: repeated.map((candidate, index) => ({ customerKey: candidate.customerKey, draftId: `41195${index}` })) }));
    const repeatManifest: AprCohortSeedManifest = { version: APR_COHORT_SEED_VERSION, sourceEvidenceId: "user-repeat-2026-08-16", candidates: repeated, repeatTest: { authorizationId: "user-repeat-three-2026-08-16", priorDrafts: repeated.map((candidate, index) => ({ customerKey: candidate.customerKey, draftId: `41195${index}` })) } };
    const store = new PersistentAprCohortSeed(root);
    expect(store.seed(repeatManifest, history)).toMatchObject({ status: "awaiting_deletion_proof", externalActionAllowed: false, repeatTest: { presentDraftIds: ["411950", "411951", "411952"], deletionEvidenceId: null } });
    expect(store.recordRepeatDeletionObservation(["411951"], "server-present")).toMatchObject({ status: "awaiting_deletion_proof", repeatTest: { presentDraftIds: ["411951"], deletionEvidenceId: null } });
    expect(store.recordRepeatDeletionObservation([], "server-absent")).toMatchObject({ status: "deletion_verified", repeatTest: { presentDraftIds: [], deletionEvidenceId: "server-absent", deletionVerifiedAt: expect.any(String) } });
  });

  it("consente una coorte mista di casi nuovi e precedenti dichiarando soltanto le bozze realmente esistenti", () => {
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-mixed-history-"));
    const executionDirectory = path.join(history, "apr-pilot-old", "enea-draft-execution"); mkdirSync(executionDirectory, { recursive: true });
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "case-1", draftId: "412100" }, { customerKey: "case-4", draftId: "412104" }] }));
    const mixed: AprCohortSeedManifest = { ...manifest(), sourceEvidenceId: "user-random-mixed-2026-08-16", repeatTest: { authorizationId: "user-random-ten-2026-08-16", priorDrafts: [{ customerKey: "case-1", draftId: "412100" }, { customerKey: "case-4", draftId: "412104" }] } };
    expect(validateAprCohortSeed(mixed, history)).toHaveLength(10);
  });

  it("arma quindici repeat-test senza eliminare le bozze storiche quando l'autorizzazione lo prevede", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-fifteen-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-fifteen-history-"));
    const fifteen = Array.from({ length: 15 }, (_, index) => ({ customerKey: `repeat-${index + 1}`, displayName: `Repeat ${index + 1}` }));
    const executionDirectory = path.join(history, "apr-pilot-old", "enea-draft-execution"); mkdirSync(executionDirectory, { recursive: true });
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: fifteen.slice(0, 3).map((candidate, index) => ({ customerKey: candidate.customerKey, draftId: `41432${index}` })) }));
    const repeatManifest: AprCohortSeedManifest = {
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-fifteen-repeat-2026-08-17",
      candidates: fifteen,
      authorizedBatch: { authorizationId: "user-fifteen-repeat-2026-08-17", exactCount: 15 },
      repeatTest: {
        authorizationId: "user-fifteen-repeat-2026-08-17",
        priorDrafts: fifteen.slice(0, 3).map((candidate, index) => ({ customerKey: candidate.customerKey, draftId: `41432${index}` })),
        deletionProofRequired: false,
      },
    };
    const seeded = new PersistentAprCohortSeed(root).seed(repeatManifest, history, new Date("2026-08-17T18:00:00Z"));
    expect(seeded).toMatchObject({ status: "armed_readonly", executor: "apr_persistent_runtime", repeatTest: { deletionProofRequired: false, presentDraftIds: ["414320", "414321", "414322"] } });
    expect(seeded.candidates).toHaveLength(15);
    expect(seeded.audit[0].appliedRuleIds).toContain("user-2026-08-17-fifteen-case-intermezzo-repeat");
  });

  it("arma un repeat-test autorizzato di quattordici casi dopo un'esclusione esplicita", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-fourteen-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-fourteen-history-"));
    const candidates = Array.from({ length: 14 }, (_, index) => ({ customerKey: `repeat-${index + 1}`, displayName: `Repeat ${index + 1}` }));
    const executionDirectory = path.join(history, "apr-pilot-old", "enea-draft-execution"); mkdirSync(executionDirectory, { recursive: true });
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: candidates[0].customerKey, draftId: "414500" }] }));
    const seeded = new PersistentAprCohortSeed(root).seed({
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-fourteen-repeat-2026-08-17",
      candidates,
      authorizedBatch: { authorizationId: "user-fourteen-repeat-2026-08-17", exactCount: 14 },
      repeatTest: { authorizationId: "user-fourteen-repeat-2026-08-17", priorDrafts: [{ customerKey: candidates[0].customerKey, draftId: "414500" }], deletionProofRequired: false },
    }, history, new Date("2026-08-17T21:00:00Z"));
    expect(seeded).toMatchObject({ status: "armed_readonly", executor: "apr_persistent_runtime" });
    expect(seeded.candidates).toHaveLength(14);
  });

  it("dichiara e preserva piu bozze storiche per lo stesso cliente senza riusarle", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-multi-history-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-multi-history-"));
    for (const [cohort, draftId] of [["old-a", "414700"], ["old-b", "414701"]] as const) {
      const executionDirectory = path.join(history, cohort, "enea-draft-execution");
      mkdirSync(executionDirectory, { recursive: true });
      writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "case-1", draftId }] }));
    }
    const repeatCandidates = candidates.slice(0, 2);
    const seeded = new PersistentAprCohortSeed(root).seed({
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-repeat-multi-history-2026-08-18",
      candidates: repeatCandidates,
      authorizedBatch: { authorizationId: "user-repeat-multi-history-2026-08-18", exactCount: 2 },
      repeatTest: {
        authorizationId: "user-repeat-multi-history-2026-08-18",
        priorDrafts: [
          { customerKey: "case-1", draftId: "414700" },
          { customerKey: "case-1", draftId: "414701" },
        ],
        deletionProofRequired: false,
      },
    }, history, new Date("2026-08-18T00:00:00Z"));
    expect(seeded).toMatchObject({ status: "armed_readonly", repeatTest: { presentDraftIds: ["414700", "414701"] } });
  });

  it("applica la regola dedicata al repeat-test pulito da undici", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-eleven-seed-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-repeat-eleven-history-"));
    const eleven = Array.from({ length: 11 }, (_, index) => ({ customerKey: `clean-${index + 1}`, displayName: `Clean ${index + 1}` }));
    const executionDirectory = path.join(history, "old", "enea-draft-execution");
    mkdirSync(executionDirectory, { recursive: true });
    writeFileSync(path.join(executionDirectory, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "clean-1", draftId: "414800" }] }));
    const seeded = new PersistentAprCohortSeed(root).seed({
      version: APR_COHORT_SEED_VERSION,
      sourceEvidenceId: "user-eleven-clean-repeat-2026-08-18",
      candidates: eleven,
      authorizedBatch: { authorizationId: "user-eleven-clean-repeat-2026-08-18", exactCount: 11 },
      repeatTest: {
        authorizationId: "user-eleven-clean-repeat-2026-08-18",
        priorDrafts: [{ customerKey: "clean-1", draftId: "414800" }],
        deletionProofRequired: false,
      },
    }, history, new Date("2026-08-18T00:00:00Z"));
    expect(seeded.audit[0].appliedRuleIds).toContain("user-2026-08-18-eleven-case-clean-repeat");
    expect(seeded.candidates).toHaveLength(11);
  });
});
