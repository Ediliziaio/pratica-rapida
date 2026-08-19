export type AprShadowRuleChangeProduct =
  | "schermature"
  | "infissi"
  | "impianto_termico"
  | "insufflaggio";

export type AprShadowRuleExpectedDisposition = "blocked" | "ready";
export type AprShadowRuleTargetVerdict = "correct-block" | "false-block" | null;

export interface AprShadowRuleReplayCase {
  practiceId: string;
  productType: AprShadowRuleChangeProduct;
  expectedDisposition: AprShadowRuleExpectedDisposition;
  /**
   * Diagnosi blocker-specifica raccolta nel feedback loop APR.
   * Deve essere valorizzata se e solo se il blocker target e presente nel baseline.
   */
  targetBlockerVerdict: AprShadowRuleTargetVerdict;
  baselineBlockerCodes: string[];
  candidateBlockerCodes: string[];
}

export type AprShadowRuleChangeEvidenceCode =
  | "invalid-target-blocker-code"
  | "empty-replay-corpus"
  | "invalid-practice-id"
  | "duplicate-practice-id"
  | "invalid-blocker-code"
  | "duplicate-blocker-code"
  | "target-attribution-missing"
  | "target-attribution-without-baseline-blocker";

export type AprShadowRuleChangeGuardrailCode =
  | "no-target-false-block-evidence"
  | "target-false-block-not-resolved"
  | "target-correct-block-regression"
  | "previously-correct-disposition-regression"
  | "unrelated-blocker-drift";

export interface AprShadowRuleChangeGateResult {
  evidenceValid: boolean;
  promotable: boolean;
  evidenceBlockers: Array<{
    practiceId: string;
    code: AprShadowRuleChangeEvidenceCode;
  }>;
  guardrailBlockers: Array<{
    practiceId: string;
    code: AprShadowRuleChangeGuardrailCode;
  }>;
  counts: {
    cases: number;
    targetFalseBlockCases: number;
    targetFalseBlockCasesResolved: number;
    targetCorrectBlockCases: number;
    targetCorrectBlockCasesPreserved: number;
  };
}

export interface AprShadowRuleChangeGateInput {
  targetBlockerCode: string;
  cases: AprShadowRuleReplayCase[];
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

function dispositionFor(blockerCodes: string[]): AprShadowRuleExpectedDisposition {
  return blockerCodes.length > 0 ? "blocked" : "ready";
}

function nonTargetCodes(codes: string[], targetBlockerCode: string): string[] {
  return uniqueCodes(codes)
    .filter((code) => code !== targetBlockerCode)
    .sort((left, right) => left.localeCompare(right));
}

function sameCodes(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

/**
 * Gate di promozione delle correzioni nate dal feedback loop APR shadow.
 *
 * Una regola non viene considerata pronta solo perche riduce il numero di blocker.
 * Il replay deve dimostrare, sullo stesso corpus revisionato, che:
 * - tutti i false-block attribuiti al blocker target vengono realmente rimossi;
 * - nessun blocker target giudicato corretto viene perso;
 * - nessuna pratica prima corretta diventa sbagliata;
 * - la modifica non altera blocker non correlati al target.
 *
 * Questo mantiene la correzione piccola, reversibile e misurabile. Il risultato
 * non abilita alcun invio ENEA: serve esclusivamente come barriera prima di
 * promuovere una nuova regola nel laboratorio APR.
 */
export function validateAprShadowRuleChange(
  input: AprShadowRuleChangeGateInput,
): AprShadowRuleChangeGateResult {
  const evidenceBlockers: AprShadowRuleChangeGateResult["evidenceBlockers"] = [];
  const guardrailBlockers: AprShadowRuleChangeGateResult["guardrailBlockers"] = [];
  const targetBlockerCode = input.targetBlockerCode.trim();

  if (targetBlockerCode.length === 0) {
    evidenceBlockers.push({ practiceId: "", code: "invalid-target-blocker-code" });
  }
  if (input.cases.length === 0) {
    evidenceBlockers.push({ practiceId: "", code: "empty-replay-corpus" });
  }

  const seenPracticeIds = new Set<string>();

  for (const row of input.cases) {
    const practiceId = row.practiceId.trim();
    if (practiceId.length === 0) {
      evidenceBlockers.push({ practiceId: row.practiceId, code: "invalid-practice-id" });
    }
    if (seenPracticeIds.has(row.practiceId)) {
      evidenceBlockers.push({ practiceId: row.practiceId, code: "duplicate-practice-id" });
    }
    seenPracticeIds.add(row.practiceId);

    for (const codes of [row.baselineBlockerCodes, row.candidateBlockerCodes]) {
      if (codes.some((code) => code.trim().length === 0)) {
        evidenceBlockers.push({ practiceId: row.practiceId, code: "invalid-blocker-code" });
      }
      if (uniqueCodes(codes).length !== codes.length) {
        evidenceBlockers.push({ practiceId: row.practiceId, code: "duplicate-blocker-code" });
      }
    }

    const targetPresentInBaseline = row.baselineBlockerCodes.includes(targetBlockerCode);
    if (targetPresentInBaseline && row.targetBlockerVerdict == null) {
      evidenceBlockers.push({ practiceId: row.practiceId, code: "target-attribution-missing" });
    }
    if (!targetPresentInBaseline && row.targetBlockerVerdict != null) {
      evidenceBlockers.push({
        practiceId: row.practiceId,
        code: "target-attribution-without-baseline-blocker",
      });
    }
  }

  const targetFalseRows = input.cases.filter((row) => row.targetBlockerVerdict === "false-block");
  const targetCorrectRows = input.cases.filter((row) => row.targetBlockerVerdict === "correct-block");
  const targetFalseResolved = targetFalseRows.filter(
    (row) => !row.candidateBlockerCodes.includes(targetBlockerCode),
  ).length;
  const targetCorrectPreserved = targetCorrectRows.filter(
    (row) => row.candidateBlockerCodes.includes(targetBlockerCode),
  ).length;

  const counts: AprShadowRuleChangeGateResult["counts"] = {
    cases: input.cases.length,
    targetFalseBlockCases: targetFalseRows.length,
    targetFalseBlockCasesResolved: targetFalseResolved,
    targetCorrectBlockCases: targetCorrectRows.length,
    targetCorrectBlockCasesPreserved: targetCorrectPreserved,
  };

  if (evidenceBlockers.length > 0) {
    return {
      evidenceValid: false,
      promotable: false,
      evidenceBlockers,
      guardrailBlockers: [],
      counts,
    };
  }

  if (targetFalseRows.length === 0) {
    guardrailBlockers.push({ practiceId: "", code: "no-target-false-block-evidence" });
  }

  for (const row of input.cases) {
    const baselineDisposition = dispositionFor(row.baselineBlockerCodes);
    const candidateDisposition = dispositionFor(row.candidateBlockerCodes);
    const baselineWasCorrect = baselineDisposition === row.expectedDisposition;

    if (
      row.targetBlockerVerdict === "false-block"
      && row.candidateBlockerCodes.includes(targetBlockerCode)
    ) {
      guardrailBlockers.push({
        practiceId: row.practiceId,
        code: "target-false-block-not-resolved",
      });
    }

    if (
      row.targetBlockerVerdict === "correct-block"
      && !row.candidateBlockerCodes.includes(targetBlockerCode)
    ) {
      guardrailBlockers.push({
        practiceId: row.practiceId,
        code: "target-correct-block-regression",
      });
    }

    if (baselineWasCorrect && candidateDisposition !== row.expectedDisposition) {
      guardrailBlockers.push({
        practiceId: row.practiceId,
        code: "previously-correct-disposition-regression",
      });
    }

    if (
      row.targetBlockerVerdict === "false-block"
      && row.expectedDisposition === "ready"
      && candidateDisposition !== "ready"
      && !guardrailBlockers.some((item) => (
        item.practiceId === row.practiceId && item.code === "target-false-block-not-resolved"
      ))
    ) {
      guardrailBlockers.push({
        practiceId: row.practiceId,
        code: "target-false-block-not-resolved",
      });
    }

    const baselineUnrelated = nonTargetCodes(row.baselineBlockerCodes, targetBlockerCode);
    const candidateUnrelated = nonTargetCodes(row.candidateBlockerCodes, targetBlockerCode);
    if (!sameCodes(baselineUnrelated, candidateUnrelated)) {
      guardrailBlockers.push({
        practiceId: row.practiceId,
        code: "unrelated-blocker-drift",
      });
    }
  }

  return {
    evidenceValid: true,
    promotable: guardrailBlockers.length === 0,
    evidenceBlockers: [],
    guardrailBlockers,
    counts,
  };
}
