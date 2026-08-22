import type { AprInfissiIntakeFields } from "./infissiIntake";

export interface CompletedEneaInfissiItem {
  ordinal: number;
  oldMaterial: string;
  oldGlass: string;
  oldTransmittance: number;
  surfaceM2: number;
  newMaterial: string;
  newGlass: string;
  newTransmittance: number;
  installation: "verso_esterno" | "unknown";
  hasDarkeningClosure: boolean | null;
}

export interface CompletedEneaInfissiSnapshot {
  items: CompletedEneaInfissiItem[];
  expense: number | null;
}

export type InfissiAggregateComparisonStatus = "match" | "mismatch" | "mixed" | "missing";

export interface InfissiAggregateComparison {
  field: keyof AprInfissiIntakeFields;
  intakeValue: string | boolean | null;
  completedValues: Array<string | boolean>;
  status: InfissiAggregateComparisonStatus;
}

function number(value: string): number {
  return Number(value.replace(",", "."));
}

function normalizedLabel(value: string): string {
  return value.trim().toLocaleLowerCase("it");
}

export function parseCompletedEneaInfissiText(text: string): CompletedEneaInfissiSnapshot {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const start = lines.findIndex((line) => /IN\.\s*Serramenti e infissi/i.test(line));
  if (start < 0) return { items: [], expense: null };
  const endOffset = lines.slice(start + 1).findIndex((line) => /Spese congrue sostenute/i.test(line));
  const end = endOffset >= 0 ? start + endOffset + 1 : lines.length;
  const section = lines.slice(start, end);
  const rowStart = /^\d{1,3}\s+(?:Legno|PVC|Metallo)\s+(?:Singolo|Doppio|Triplo)\s+/i;
  const rowPattern = /^(\d{1,3})\s+(Legno|PVC|Metallo)\s+(Singolo|Doppio|Triplo)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+(Legno|PVC|Metallo)\s+(Singolo|Doppio|Triplo)\s+([0-9]+(?:[.,][0-9]+)?)\s+(.*)$/i;
  const items: CompletedEneaInfissiItem[] = [];

  for (let index = 0; index < section.length; index += 1) {
    if (!rowStart.test(section[index])) continue;
    const parts = [section[index]];
    for (let continuation = index + 1; continuation < section.length; continuation += 1) {
      if (rowStart.test(section[continuation])) break;
      parts.push(section[continuation]);
    }
    const match = parts.join(" ").match(rowPattern);
    if (!match) continue;
    const tail = match[9];
    const closure = tail.match(/\b(Sì|Si|No)\b/i)?.[1]?.toLocaleLowerCase("it") ?? null;
    items.push({
      ordinal: Number(match[1]),
      oldMaterial: normalizedLabel(match[2]),
      oldGlass: normalizedLabel(match[3]),
      oldTransmittance: number(match[4]),
      surfaceM2: number(match[5]),
      newMaterial: normalizedLabel(match[6]),
      newGlass: normalizedLabel(match[7]),
      newTransmittance: number(match[8]),
      installation: /esterno/i.test(tail) ? "verso_esterno" : "unknown",
      hasDarkeningClosure: closure == null ? null : closure !== "no",
    });
  }

  const expenseMatch = text.match(/Spese congrue sostenute \[€\]\s+([0-9]+(?:[.,][0-9]+)?)/i);
  return {
    items,
    expense: expenseMatch ? number(expenseMatch[1]) : null,
  };
}

function compareAggregate(
  field: keyof AprInfissiIntakeFields,
  intakeValue: string | boolean | null,
  completedValues: Array<string | boolean | null>,
): InfissiAggregateComparison {
  const present = completedValues.filter((value): value is string | boolean => value !== null);
  const unique = [...new Set(present)];
  let status: InfissiAggregateComparisonStatus;
  if (intakeValue === "" || intakeValue === null || unique.length === 0) status = "missing";
  else if (unique.length > 1) status = "mixed";
  else status = unique[0] === intakeValue ? "match" : "mismatch";
  return { field, intakeValue, completedValues: unique, status };
}

export function compareInfissiIntakeToCompleted(
  intake: AprInfissiIntakeFields,
  completed: CompletedEneaInfissiSnapshot,
): InfissiAggregateComparison[] {
  return [
    compareAggregate("oldMaterial", intake.oldMaterial, completed.items.map((item) => item.oldMaterial)),
    compareAggregate("oldGlass", intake.oldGlass, completed.items.map((item) => item.oldGlass)),
    compareAggregate("newMaterial", intake.newMaterial, completed.items.map((item) => item.newMaterial)),
    compareAggregate("newGlass", intake.newGlass, completed.items.map((item) => item.newGlass)),
    compareAggregate(
      "hasAccessories",
      intake.hasAccessories,
      completed.items.map((item) => item.hasDarkeningClosure),
    ),
  ];
}
