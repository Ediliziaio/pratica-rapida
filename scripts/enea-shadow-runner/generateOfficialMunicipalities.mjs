#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const SOURCE_URL = "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx";
const EXPECTED_SOURCE_SHA256 = "83842076860450f7e482daecea6b7a769f5f93d0bf5b0d48802b44896d7a26d5";
const EXPECTED_EFFECTIVE_DATE = "2026-02-21";
const EXPECTED_ENTRY_COUNT = 7_894;

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: generateOfficialMunicipalities.mjs <istat.xlsx> <output.ts>");
const bytes = readFileSync(input);
const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
if (sourceSha256 !== EXPECTED_SOURCE_SHA256) throw new Error(`official_municipality_source_hash_mismatch:${sourceSha256}`);

const workbook = XLSX.read(bytes, { type: "buffer" });
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
const entries = rows.slice(1).flatMap((row) => {
  const name = String(row[6] || row[5]).trim();
  const provinceName = String(row[11]).trim();
  const provinceCode = String(row[14]).trim().toUpperCase();
  const istatCode = String(row[4]).trim();
  const cadastralCode = String(row[20]).trim().toUpperCase();
  if (!name || !provinceName || !/^[A-Z]{2}$/.test(provinceCode) || !/^\d{6}$/.test(istatCode) || !/^[A-Z]\d{3}$/.test(cadastralCode)) return [];
  return [{ name, provinceName, provinceCode, istatCode, cadastralCode }];
});
if (entries.length !== EXPECTED_ENTRY_COUNT) throw new Error(`official_municipality_entry_count:${entries.length}`);
if (!entries.some((entry) => entry.name === "Monte Compatri" && entry.provinceCode === "RM" && entry.istatCode === "058060" && entry.cadastralCode === "F477")) {
  throw new Error("official_municipality_monte_compatri_missing");
}
if (new Set(entries.map((entry) => entry.istatCode)).size !== entries.length) throw new Error("official_municipality_istat_code_not_unique");

const rendered = `/* Generated from the official current ISTAT municipality list.\n * Do not edit manually; regenerate with scripts/enea-shadow-runner/generateOfficialMunicipalities.mjs. */\nexport const OFFICIAL_MUNICIPALITIES_SOURCE = Object.freeze(${JSON.stringify({ sourceUrl: SOURCE_URL, sourceSha256, effectiveDate: EXPECTED_EFFECTIVE_DATE, sheetName, generatedEntryCount: entries.length }, null, 2)} as const);\n\nexport const OFFICIAL_MUNICIPALITIES = Object.freeze(${JSON.stringify(entries, null, 2)} as const);\n`;
writeFileSync(path.resolve(output), rendered, "utf8");
process.stdout.write(`${JSON.stringify({ output: path.resolve(output), entries: entries.length, sourceSha256 }, null, 2)}\n`);
