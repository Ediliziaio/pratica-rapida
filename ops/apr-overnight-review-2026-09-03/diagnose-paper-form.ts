import { readFileSync } from "node:fs";
import { parseLineaSolePotitoPaperForm } from "../../scripts/enea-shadow-runner/lineaSolePotitoPolicy";

for (const filePath of process.argv.slice(2)) {
  console.log(JSON.stringify({ filePath, parsed: parseLineaSolePotitoPaperForm(readFileSync(filePath, "utf8"), {}) }, null, 2));
}
