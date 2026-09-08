import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const renderTool = "/Users/giulianolavoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm";
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const slug = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type ReviewCase = { cohort: number; customerKey: string; displayName: string; module: string; complexity: string; rank: string };
const batches: Array<{ id: string; seed: string; scope: "products_measurements" | "dates_procedurability"; candidateCount: number; cases: ReviewCase[] }> = [
  {
    id: "products-batch-01", seed: "manual-products-batch-01-2026-09-03", scope: "products_measurements", candidateCount: 9,
    cases: [
      [3018,"mimosa-freni","Mimosa Freni","screening","medium","07902087f31312af8b8e6eeb05625956c8a08c32549c94893fe11b0f1bad840a"],
      [2992,"elena-marcella-berti","Elena Marcella Berti","screening","simple","1085c5017a05427b6c6da83adf1ce369581cac9789b12769db97ca711100645c"],
      [2982,"nadia-ragni","Nadia Ragni","screening","medium","141694981fa13b08cbf3d0201d109a8725d790df1f5160e0b48dc18ee9aa0372"],
      [2969,"riccardo-coda","Riccardo Coda","screening","simple","5cd3c029f90857c1702fa63d2808487646028d8a68d8bada828eddffcddc5f7a"],
      [2928,"maria-sofia-tosatti","Maria Sofia Tosatti","screening","simple","86bce51a41e57c34118554f3eff19babfc4ef4074f418e1afd12c17e7127a676"],
      [2946,"antonella-ferletic","Antonella Ferletic","screening","simple","97472ac8c8394642b4d2a63eb67197fe45f720e6e8627847d0e460da8bcdefe3"],
      [2937,"giulia-kasermann","Giulia Kasermann","screening","simple","c9f9e2f30cafeeff0c00e17b513438f7b19e8dbff98fea68e80f68a429d172cb"],
      [2922,"sarah-mondini","Sarah Mondini","screening","medium","d074d19d4caacb1cf7970e4d6fbc0fc25c08b9b09b64dd13d7eb9fc54681de2a"],
      [2931,"roberta-di-cesare","Roberta Di Cesare","screening","simple","d20d5880004187e7891402271d82cf97588d8252d91da091f6df527705d9f294"],
    ].map(([cohort, customerKey, displayName, module, complexity, rank]) => ({ cohort: Number(cohort), customerKey: String(customerKey), displayName: String(displayName), module: String(module), complexity: String(complexity), rank: String(rank) })),
  },
  {
    id: "dates-batch-01", seed: "manual-dates-batch-01-2026-09-03", scope: "dates_procedurability", candidateCount: 15,
    cases: [
      [3017,"mattia-vatieri","Mattia Vatieri","screening","simple","0b1f7e67d6efc9554b4d29dfe0e634bafa1ec50c7cb72c5cd77c4ed708c563a8"],
      [3020,"leo-manini","Leo Manini","infissi","simple","0c64c5f90f673b63c4d54593275bd6bef515f94e0c6f9f4456b828a02999f6fc"],
      [2990,"maurizia-coreggioli","Maurizia Coreggioli","infissi","medium","288fa1b7b8554bd7b9aaf8b9d9d18a30e3ca08f8050d96b18044e83d0416663f"],
      [3019,"antonino-formisabo","Antonino Formisabo","infissi","complex","4f80144b2e8a33de7edbe2c3db488faaf30d9523b6494dfcb4adbb1555ee9d86"],
      [2930,"gianfranco-lavezzi","Gianfranco Lavezzi","screening","medium","6a229f74f7168f01aadc5fe8484dd6748df1bc745a6272800d2ef11694f489c3"],
      [2925,"andreea-ioana-olteanu","Andreea Ioana Olteanu","infissi","medium","94f9b60cdbfa1422093bd0ede9490012877cd10efa53d834184e6b9382d87d34"],
      [2976,"vito-fusillo","Vito Fusillo","screening","simple","9854ccdf7b8edcc325ea3233ea545137bbf35a9b4c28ef89524141e5f438f0a3"],
      [2999,"giovanni-amadu","Giovanni Amadu","infissi","simple","99f43532f891b1795396c7c7d2e09c4459362e7bd99b854b70affff6068fd199"],
      [2956,"ida-gigliotti","Ida Gigliotti","screening","medium","a9d4e038b6f8517c5aa35cedf4bb14b03c68dbba39c4a80b2a110a6e1b19fb4f"],
      [2948,"giuseppe-d-adduzio","Giuseppe D'Adduzio","infissi","complex","b24bd1bc4cdc9e75a5dce21357ec40faa84a66625a240fc7a05de6795a0f1b2a"],
      [2943,"giovanna-atzeni","Giovanna Atzeni","infissi","simple","b9bc1655ef85dca070fe9a36e0d0204ff12f0bd0bfe8b0a1c2c7fccff2ba2c58"],
      [2933,"marcella-capatti","Marcella Capatti","infissi","medium","c22bb84d1ede26bc3cb22596f11872847c0e75fb4e7b6b27a91504152e2a19bc"],
      [2997,"caterina-claudia-garbato","Caterina Claudia Garbato","screening","medium","eb0efedf5618c94b6b43ad753285c4c3b14817ef55d25bb8748cc2f84421bd39"],
      [2996,"mauro-leonardi","Mauro Leonardi","infissi","medium","f33a763d4607a8b7439167b4d1624255936adc54edeb3d4258f8a12cef319410"],
    ].map(([cohort, customerKey, displayName, module, complexity, rank]) => ({ cohort: Number(cohort), customerKey: String(customerKey), displayName: String(displayName), module: String(module), complexity: String(complexity), rank: String(rank) })),
  },
];

for (const batch of batches) {
  const outputRoot = path.join(import.meta.dirname, batch.id, "blind-documents");
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const manifest: any = { schemaVersion: "apr-blind-document-review-batch-v1", generatedAt: new Date().toISOString(), selection: { method: "sha256_rank", seed: batch.seed, candidateCount: batch.candidateCount, selectedCount: batch.cases.length }, reviewScope: batch.scope, safety: { sourceReadOnly: true, crmWrite: false, portalAccess: false, communications: false }, cases: [] };
  for (const [index, item] of batch.cases.entries()) {
    const stateDirectory = path.join(cohortRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
    const checkpoint = JSON.parse(readFileSync(path.join(stateDirectory, "crm-original-documents/checkpoint.json"), "utf8"));
    if (checkpoint.status !== "completed" || checkpoint.externalActionAllowed !== false) throw new Error(`source_not_readonly_completed:${item.customerKey}`);
    const sources = checkpoint.items.filter((source: any) => source.customerKey === item.customerKey && source.state === "downloaded");
    if (!sources.length) throw new Error(`documents_missing:${item.customerKey}`);
    const caseDirectory = path.join(outputRoot, `${String(index + 1).padStart(2, "0")}-${slug(item.displayName)}`);
    const documentDirectory = path.join(caseDirectory, "documents");
    const renderDirectory = path.join(caseDirectory, "rendered-pages");
    mkdirSync(documentDirectory, { recursive: true, mode: 0o700 }); mkdirSync(renderDirectory, { recursive: true, mode: 0o700 });
    const documents = sources.map((source: any, sourceIndex: number) => {
      const extension = path.extname(source.localPath).toLowerCase();
      const filename = `${String(sourceIndex + 1).padStart(2, "0")}-source${extension}`;
      const destination = path.join(documentDirectory, filename);
      cpSync(source.localPath, destination, { preserveTimestamps: true });
      const actualHash = sha256(destination);
      if (actualHash !== source.responseSha256) throw new Error(`hash_mismatch:${item.customerKey}:${filename}`);
      let renderedPages: string[] = [];
      if (extension === ".pdf") {
        const prefix = path.join(renderDirectory, String(sourceIndex + 1).padStart(2, "0"));
        execFileSync(renderTool, ["-png", "-r", "150", destination, prefix], { stdio: "ignore" });
        renderedPages = readdirSync(renderDirectory).filter((name) => name.startsWith(`${String(sourceIndex + 1).padStart(2, "0")}-`) && name.endsWith(".png")).sort();
      } else if ([".jpg", ".jpeg", ".png"].includes(extension)) {
        const renderedName = `${String(sourceIndex + 1).padStart(2, "0")}-1${extension === ".png" ? ".png" : ".jpg"}`;
        cpSync(destination, path.join(renderDirectory, renderedName), { preserveTimestamps: true }); renderedPages = [renderedName];
      }
      return { filename, sha256: actualHash, byteLength: readFileSync(destination).byteLength, renderedPages };
    });
    manifest.cases.push({ caseId: `case-${String(index + 1).padStart(2, "0")}`, directory: path.relative(outputRoot, caseDirectory), displayName: item.displayName, cohort: item.cohort, module: item.module, complexity: item.complexity, rank: item.rank, documentCount: documents.length, documents });
  }
  writeFileSync(path.join(outputRoot, "batch-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${batch.id}: ${batch.cases.length} cases, ${manifest.cases.reduce((sum: number, item: any) => sum + item.documentCount, 0)} documents\n`);
}
