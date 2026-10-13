const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%";
const PASSWORD_ALPHABET = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

function secureRandomIndex(length: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % length;
}

export function generateTemporaryPassword(length = 12): string {
  if (length < 8) throw new Error("La password temporanea deve avere almeno 8 caratteri");

  const characters = [
    UPPERCASE[secureRandomIndex(UPPERCASE.length)],
    LOWERCASE[secureRandomIndex(LOWERCASE.length)],
    DIGITS[secureRandomIndex(DIGITS.length)],
    SYMBOLS[secureRandomIndex(SYMBOLS.length)],
  ];

  while (characters.length < length) {
    characters.push(PASSWORD_ALPHABET[secureRandomIndex(PASSWORD_ALPHABET.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

export async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!error || typeof error !== "object") return fallback;

  const candidate = error as {
    message?: string;
    context?: { json?: () => Promise<{ error?: unknown; message?: unknown }> };
  };

  try {
    const payload = await candidate.context?.json?.();
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  } catch {
    // Il corpo della risposta può non essere JSON: in quel caso usiamo il messaggio disponibile.
  }

  return typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message
    : fallback;
}
