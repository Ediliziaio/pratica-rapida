import path from "node:path";
import { APR_INFISSI_SHADOW_TEST_FIXTURE } from "./fixtures/infissiShadowTestFixture";
import { PersistentAprInfissiLocalMappingPreflight } from "./infissiLocalMappingPreflight";
import { PersistentAprInfissiShadowTestPreparation } from "./infissiShadowTestPreparation";

function required(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_option:${name}`);
  return process.argv[index + 1];
}

const stateDirectory = path.resolve(required("--state-dir"));
const mapping = new PersistentAprInfissiLocalMappingPreflight(stateDirectory).run(structuredClone(APR_INFISSI_SHADOW_TEST_FIXTURE));
const preparation = new PersistentAprInfissiShadowTestPreparation(stateDirectory).prepare(mapping);
process.stdout.write(`${JSON.stringify({ mapping, preparation }, null, 2)}\n`);
