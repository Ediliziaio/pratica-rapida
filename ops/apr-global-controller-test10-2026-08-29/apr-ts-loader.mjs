import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sourceRoot = pathToFileURL(`${resolvePath(process.cwd(), "src")}/`);
    const base = new URL(specifier.slice(2), sourceRoot);
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = new URL(`${base.href}${suffix}`);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const extensionlessRelative = (specifier.startsWith("./") || specifier.startsWith("../"))
      && !/\.(?:ts|tsx|js|mjs|cjs|json)$/i.test(specifier);
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !extensionlessRelative || !context.parentURL) {
      throw error;
    }
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (!existsSync(fileURLToPath(candidate))) throw error;
    return nextResolve(candidate.href, context);
  }
}
