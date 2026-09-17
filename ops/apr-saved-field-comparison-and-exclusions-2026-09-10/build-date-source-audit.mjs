import fs from 'node:fs';
import path from 'node:path';

const comparisonPath = path.resolve(
  'ops/apr-saved-field-comparison-and-exclusions-2026-09-10/saved-non-geometric-field-comparison.json',
);
const comparison = JSON.parse(fs.readFileSync(comparisonPath, 'utf8'));

const targetFields = new Set(['intervento.data_inizio', 'intervento.data_fine']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDateTokens(value) {
  if (!value) return [];
  const text = String(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return [text, `${day}/${month}/${year}`, `${day}-${month}-${year}`];
  }
  const italian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (italian) {
    const [, day, month, year] = italian;
    return [text, `${year}-${month}-${day}`, `${day}-${month}-${year}`];
  }
  return [text];
}

function compactSnippet(text, index, radius = 180) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function scanText(filePath, tokens) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const matches = [];
  for (const token of [...new Set(tokens.filter(Boolean))]) {
    let cursor = 0;
    while (cursor < text.length) {
      const index = text.toLowerCase().indexOf(token.toLowerCase(), cursor);
      if (index < 0) break;
      matches.push({ token, snippet: compactSnippet(text, index) });
      cursor = index + token.length;
    }
  }
  return matches.slice(0, 8);
}

function scanWorkflowPhrases(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const pattern = /fine\s+lavori|ultimazione|collaudo|inizio\s+lavori|data\s+posa|posa\s+(?:in\s+opera|ultimata|completata)|installazione\s+(?:ultimata|completata)|verbale\s+di\s+consegna/gi;
  const snippets = [];
  let match;
  while ((match = pattern.exec(text)) !== null && snippets.length < 8) {
    snippets.push({ phrase: match[0], snippet: compactSnippet(text, match.index) });
  }
  return snippets;
}

function findValues(node, tokens, trail = [], output = []) {
  if (node === null || node === undefined) return output;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => findValues(entry, tokens, [...trail, index], output));
    return output;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      findValues(value, tokens, [...trail, key], output);
    }
    return output;
  }
  const value = String(node);
  if (tokens.some((token) => value.toLowerCase().includes(token.toLowerCase()))) {
    output.push({ path: trail.join('.'), value });
  }
  return output;
}

function findDateLikeKeys(node, trail = [], output = []) {
  if (node === null || node === undefined) return output;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => findDateLikeKeys(entry, [...trail, index], output));
    return output;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const nextTrail = [...trail, key];
      if (/data|date|inizio|fine|ultimazione|collaudo/i.test(key) &&
          (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
        output.push({ path: nextTrail.join('.'), value });
      }
      findDateLikeKeys(value, nextTrail, output);
    }
  }
  return output;
}

const audits = [];
for (const caseEntry of comparison.cases) {
  const dateDifferences = caseEntry.differences.filter((difference) => targetFields.has(difference.fieldId));
  if (dateDifferences.length === 0) continue;

  const cohortDir = path.dirname(path.dirname(caseEntry.references.execution.path));
  const preflightPath = path.join(cohortDir, 'crm-local-preflight', 'checkpoint.json');
  const analysisPath = path.join(cohortDir, 'crm-document-analysis', 'checkpoint.json');
  const preflight = readJson(preflightPath);
  const analysis = readJson(analysisPath);
  const report = preflight.items?.[0]?.report ?? {};
  const dossierPath = caseEntry.references.crmDossier.path;
  const dossier = readJson(dossierPath);

  for (const difference of dateDifferences) {
    const isStart = difference.fieldId.endsWith('data_inizio');
    const aprDate = isStart ? report.startDate : report.completionDate;
    const sourceRef = isStart ? report.startDateSource : report.completionDateSource;
    const sourceDocumentKey = sourceRef?.split(':')[0] ?? null;
    const sourceDocument = analysis.items?.find((item) => item.documentKey === sourceDocumentKey) ?? null;
    const tokens = [
      ...normalizeDateTokens(difference.humanValue),
      ...normalizeDateTokens(difference.aprValue),
      ...normalizeDateTokens(aprDate),
    ];

    const documentEvidence = (analysis.items ?? []).map((item) => ({
      documentKey: item.documentKey ?? null,
      kind: item.kind ?? null,
      semanticKind: item.semanticKind ?? null,
      documentType: item.invoiceResult?.documentType ?? item.documentClassification?.documentType ?? null,
      documentNumber: item.invoiceResult?.documentNumber ?? null,
      documentDate: item.invoiceResult?.documentDate ?? null,
      localPdfPath: item.localPdfPath ?? null,
      textPath: item.textPath ?? null,
      matchingDateSnippets: scanText(item.textPath, tokens),
      workflowDateSnippets: scanWorkflowPhrases(item.textPath),
    }));

    audits.push({
      practiceId: caseEntry.practiceId,
      displayName: caseEntry.displayName,
      customerKey: caseEntry.customerKey,
      fieldId: difference.fieldId,
      humanValue: difference.humanValue,
      aprValue: difference.aprValue,
      aprResolvedDate: aprDate,
      aprSourceRef: sourceRef,
      aprSourceDocument: sourceDocument
        ? {
            documentKey: sourceDocument.documentKey ?? null,
            kind: sourceDocument.kind ?? null,
            semanticKind: sourceDocument.semanticKind ?? null,
            documentNumber: sourceDocument.invoiceResult?.documentNumber ?? null,
            documentDate: sourceDocument.invoiceResult?.documentDate ?? null,
            localPdfPath: sourceDocument.localPdfPath ?? null,
            textPath: sourceDocument.textPath ?? null,
          }
        : null,
      humanBenchmark: caseEntry.references.humanBenchmark,
      immutablePackage: caseEntry.references.immutablePackage,
      crmDossier: caseEntry.references.crmDossier,
      dossierDateMatches: findValues(dossier, tokens).slice(0, 20),
      dossierDateLikeFields: findDateLikeKeys(dossier).slice(0, 40),
      documentEvidence,
      sourceFiles: {
        preflightPath,
        analysisPath,
        dossierPath,
      },
    });
  }
}

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  comparisonPath,
  count: audits.length,
  audits,
}, null, 2)}\n`);
