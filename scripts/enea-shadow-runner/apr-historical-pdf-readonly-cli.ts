#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const objectPath = option("--object-path");
const outputPath = option("--output");
if (!objectPath || !outputPath) {
  throw new Error("Uso: apr-historical-pdf-readonly-cli --state-dir <dir> --object-path <path> --output <pdf>");
}

const auth = new PersistentAprCrmAuth(rootDirectory);
const response = await auth.readOnlyStorageGet("enea-documents", objectPath);
if (!response.ok) throw new Error(`crm_historical_pdf_http_${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("crm_historical_pdf_signature_rejected");
writeFileSync(path.resolve(outputPath), bytes, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outputPath: path.resolve(outputPath), byteLength: bytes.byteLength })}\n`);
