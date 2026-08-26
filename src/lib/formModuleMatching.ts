import type { FormModule } from "@/types/form-module";

type MatchableFormModule = Pick<FormModule, "prodotto_match">;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Risolve il modulo dinamico da usare per il prodotto salvato nella pratica.
 * I pattern sono frammenti intenzionali (es. "vepa" o "vetrat") così da
 * coprire le etichette provenienti sia dal sito sia dall'area riservata.
 */
export function findFormModuleByProdotto<T extends MatchableFormModule>(
  modules: T[],
  prodotto: string | null | undefined,
): T | null {
  const normalizedProduct = normalize(prodotto ?? "");
  if (!normalizedProduct) return null;

  return modules.find((module) =>
    module.prodotto_match?.some((pattern) => {
      const normalizedPattern = normalize(pattern);
      return normalizedPattern.length > 0 && normalizedProduct.includes(normalizedPattern);
    }),
  ) ?? null;
}
