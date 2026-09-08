const sourceText = `FATTURA n. 204/2026 del 19/06/2026
PRODOTTI E SERVIZI
NR
DESCRIZIONE
QUANTITA
PREZZO
IMPORTO
Tenda da Sole S/81E Pantografo a bracci L4600 x 2200
625,00 €
625,00 € 10 %
2
Motore radiocomando nice Saldo
140,00 €
8
GHOT 0,13
1
0,00 €`;
const header = /\bPRODOTTI\s+E\s+SERVIZI\b[\s\S]{0,500}?\bQUANTITA'?\b[\s\S]{0,120}?\bPREZZO\b[\s\S]{0,120}?\bIMPORTO\b/i.test(sourceText);
const matches = [...sourceText.matchAll(/Tenda\s+da\s+Sole[^\n\r]{0,180}?\bL\s*(\d{3,5})\s*[x×]\s*(\d{3,5})[^\n\r]*/gi)].map((match) => {
  const tail = sourceText.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 1400);
  return { match: match[0], groups: match.slice(1), tail, leadingLines: tail.split(/\r?\n/).slice(0, 7), gtot: tail.match(/(?:G\s*HOT|G\s*TOT)(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1] };
});
process.stdout.write(`${JSON.stringify({ header, matches }, null, 2)}\n`);
