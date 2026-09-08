export const APR_GOVERNED_BUNDLE_FILES: readonly string[];
export function installGovernedBundleSet(
  sourceDirectory: string,
  installDirectory: string,
): { status: "installed"; files: string[] };
