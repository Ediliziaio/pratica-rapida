#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SOURCE_URL = "https://www.istat.it/wp-content/uploads/2024/09/Codici-statistici-e-denominazioni-delle-unita-amministrative-della-Sardegna.zip";
const SOURCE_ZIP_SHA256 = "6fb4b421a165c26ebc855d2793ef95ae1e65eceb9ea067aa51a4c3f613e503ca";
const CURRENT_PROVINCE_CODES = new Map([
  ["Citta metropolitana di Sassari", "SS"],
  ["Provincia della Gallura Nord-Est Sardegna", "OT"],
  ["Provincia di Nuoro", "NU"],
  ["Provincia di Oristano", "OR"],
  ["Provincia dell'Ogliastra", "OG"],
  ["Provincia del Medio Campidano", "VS"],
  ["Citta metropolitana di Cagliari", "CA"],
  ["Provincia del Sulcis Iglesiente", "SU"],
]);
const PREVIOUS_PROVINCE_CODES = new Map([
  ["Provincia di Sassari", "SS"],
  ["Provincia di Nuoro", "NU"],
  ["Provincia di Oristano", "OR"],
  ["Provincia del Sud Sardegna", "SU"],
  ["Citta metropolitana di Cagliari", "CA"],
]);
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const parse = (line) => line.replace(/\r$/, "").split(";").map((value) => value.replace(/^"|"$/g, "").trim());

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: generateOfficialMunicipalityProvinceChanges.mjs <istat.csv> <output.ts>");
const bytes = readFileSync(input);
const sourceCsvSha256 = createHash("sha256").update(bytes).digest("hex");
const text = new TextDecoder("iso-8859-1").decode(bytes);
const rows = text.split("\n").slice(4).map(parse).filter((columns) => columns.length >= 7 && /^\d{6}$/.test(columns[2]));
const entries = rows.flatMap(([currentProvinceName, currentProvinceIstat, currentIstatCode, municipalityName, previousIstatCode, previousProvinceIstat, previousProvinceName]) => {
  const currentProvinceCode = CURRENT_PROVINCE_CODES.get(normalize(currentProvinceName));
  const previousProvinceCode = PREVIOUS_PROVINCE_CODES.get(normalize(previousProvinceName));
  if (!currentProvinceCode || !previousProvinceCode) throw new Error(`province_mapping_missing:${municipalityName}:${previousProvinceName}:${currentProvinceName}`);
  if (currentProvinceCode === previousProvinceCode) return [];
  return [{
    municipalityName,
    acceptedHistoricalProvinceCodes: [previousProvinceCode],
    currentProvinceCode,
    currentIstatCode,
    previousIstatCode,
    currentProvinceIstat,
    previousProvinceIstat,
  }];
});
entries.sort((left, right) => left.municipalityName.localeCompare(right.municipalityName, "it"));
if (!entries.some((entry) => entry.municipalityName === "La Maddalena" && entry.currentProvinceCode === "OT" && entry.acceptedHistoricalProvinceCodes.includes("SS"))) {
  throw new Error("la_maddalena_ss_ot_missing");
}
const rendered = `/* Generated from the official ISTAT Sardinia territorial recoding table.\n * Do not edit manually; regenerate with scripts/enea-shadow-runner/generateOfficialMunicipalityProvinceChanges.mjs. */\nexport const OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE = Object.freeze(${JSON.stringify({ sourceUrl: SOURCE_URL, sourceZipSha256: SOURCE_ZIP_SHA256, sourceCsvSha256, effectiveDate: "2026-01-01", generatedEntryCount: entries.length }, null, 2)} as const);\n\nexport const OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES = Object.freeze(${JSON.stringify(entries, null, 2)} as const);\n`;
writeFileSync(path.resolve(output), rendered, "utf8");
process.stdout.write(`${JSON.stringify({ output: path.resolve(output), entries: entries.length, sourceCsvSha256 }, null, 2)}\n`);
