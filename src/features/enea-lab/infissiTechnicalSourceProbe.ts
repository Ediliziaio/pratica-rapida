import type { AprInfissiReadOnlyDocumentText } from "./infissiReadOnlyDocuments";

export interface AprInfissiTechnicalCandidateLine {
  path: string;
  lineNumber: number;
  line: string;
  signals: Array<"transmittance" | "surface" | "dimensions" | "material" | "glass">;
}

export interface AprInfissiTechnicalSourceProbeResult {
  documentCount: number;
  candidateLines: AprInfissiTechnicalCandidateLine[];
  hasTransmittanceEvidence: boolean;
  hasGeometryEvidence: boolean;
}

function signals(line: string): AprInfissiTechnicalCandidateLine["signals"] {
  const value = line.toLocaleLowerCase("it");
  const found: AprInfissiTechnicalCandidateLine["signals"] = [];
  if (/\buw\b|trasmittanz|w\s*\/\s*m(?:2|²)\s*k|w\s*m[-–]?2\s*k[-–]?1/.test(value)) found.push("transmittance");
  if (/superfic|\bm(?:2|²)\b/.test(value)) found.push("surface");
  if (/dimension|larghezz|altezz|\b(?:l|h)\s*[x×]\s*(?:l|h)\b|\d+[.,]?\d*\s*[x×]\s*\d+[.,]?\d*/.test(value)) found.push("dimensions");
  if (/\blegno\b|\bpvc\b|\bmetall|allumin/.test(value)) found.push("material");
  if (/vetro|singolo|doppio|triplo|camera/.test(value)) found.push("glass");
  return found;
}

/**
 * Discovery read-only del layout documentale Infissi. Non trasforma righe
 * candidate in valori ENEA: serve soltanto a individuare rapidamente dove sono
 * dichiarate prestazioni e geometrie nel corpus reale prima di congelare parser.
 */
export function probeAprInfissiTechnicalSources(
  documents: AprInfissiReadOnlyDocumentText[],
): AprInfissiTechnicalSourceProbeResult {
  const candidateLines = documents.flatMap(({ path, text }) =>
    text.split(/\r?\n/).flatMap((rawLine, index) => {
      const line = rawLine.replace(/\s+/g, " ").trim();
      if (!line) return [];
      const detected = signals(line);
      return detected.length ? [{ path, lineNumber: index + 1, line, signals: detected }] : [];
    }),
  );

  return {
    documentCount: documents.length,
    candidateLines,
    hasTransmittanceEvidence: candidateLines.some(({ signals: found }) => found.includes("transmittance")),
    hasGeometryEvidence: candidateLines.some(({ signals: found }) =>
      found.includes("surface") || found.includes("dimensions"),
    ),
  };
}
