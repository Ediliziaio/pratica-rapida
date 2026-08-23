import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "");
const outputPath = resolve(process.argv[3] ?? "src/features/enea-shadow-crm/anprForeignBirthCountries.generated.ts");
if (!process.argv[2]) throw new Error("anpr_html_input_required");

const html = readFileSync(inputPath, "utf8");
const sourceSha256 = process.argv[4] ?? "not-recorded";
const sourceUrl = "https://docs.italia.it/italia/anpr/anpr/it/stabile/tab/tab_stati_esteri.html";
const decode = (value) => value
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, " ")
  .trim();

const entries = [];
for (const row of html.matchAll(/<tr class="row-(?:odd|even)"><td>\d+<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
  const body = row[1];
  const country = decode(body.match(/<li>DENOMINAZIONEISTAT:\s*([\s\S]*?)<\/li>/)?.[1] ?? "");
  const iso3 = decode(body.match(/<li>CODISO3166_1_ALPHA3:\s*([A-Z]{3})<\/li>/)?.[1] ?? "");
  const placeCode = decode(body.match(/<li>CODAT:\s*(Z\d{3})<\/li>/)?.[1] ?? "");
  const birthAllowed = decode(body.match(/<li>NASCITA:\s*([SN])<\/li>/)?.[1] ?? "") === "S";
  if (country && iso3 && placeCode && birthAllowed) entries.push({ country, iso3, placeCode });
}

const duplicates = entries.filter((entry, index) => entries.findIndex((candidate) => candidate.placeCode === entry.placeCode) !== index);
if (entries.length < 150 || duplicates.length) throw new Error(`anpr_foreign_country_generation_invalid:${entries.length}:${duplicates.map((entry) => entry.placeCode).join(",")}`);

const lines = entries.sort((left, right) => left.placeCode.localeCompare(right.placeCode)).map(({ country, iso3, placeCode }) =>
  `  ${placeCode}: Object.freeze({ country: ${JSON.stringify(country)}, selectValue: ${JSON.stringify(iso3.toLowerCase())}, sourceId: ${JSON.stringify(`anpr-stati-esteri-maeci-${placeCode.toLowerCase()}`)}, sourceUrl: ANPR_FOREIGN_COUNTRIES_SOURCE.url, sourceAuthority: "ANPR / MAECI" }),`,
);
const output = `// File generato da scripts/enea-shadow-runner/generateAnprForeignBirthCountries.mjs.\n// Non modificare manualmente: rigenerare dalla fonte ANPR indicata.\nexport const ANPR_FOREIGN_COUNTRIES_SOURCE = Object.freeze({\n  url: ${JSON.stringify(sourceUrl)},\n  sha256: ${JSON.stringify(sourceSha256)},\n  generatedEntryCount: ${entries.length},\n});\n\nexport const ANPR_FOREIGN_BIRTH_COUNTRIES = Object.freeze({\n${lines.join("\n")}\n} as const);\n`;
writeFileSync(outputPath, output, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, entryCount: entries.length, sourceSha256 })}\n`);
