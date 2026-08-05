export interface EneaLabGeneratorConvention {
  nominalPowerKw: number;
  usefulEfficiencyPercent: number;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pickTenth(seed: string, minTenth: number, maxTenth: number): number {
  const range = maxTenth - minTenth + 1;
  return (minTenth + (hash(seed) % range)) / 10;
}

/**
 * Valori convenzionali esclusivamente per il collaudo del portale.
 * Sono deterministici per pratica: un aggiornamento della pagina non cambia i
 * numeri mentre l'operatore sta verificando la stessa bozza.
 */
export function getGeneratorTestConvention(practiceId: string): EneaLabGeneratorConvention {
  return {
    nominalPowerKw: pickTenth(`${practiceId}:power`, 264, 328),
    usefulEfficiencyPercent: pickTenth(`${practiceId}:efficiency`, 968, 989),
  };
}
