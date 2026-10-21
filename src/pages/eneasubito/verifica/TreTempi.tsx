/**
 * Come si paga, in tre disegni.
 *
 * «Paghi alla fine» e poi «dammi la carta» suona come un trucco: lo ha detto
 * il Titolare il 21/10/2026, mettendosi nei panni di un cliente qualunque.
 * Una frase non basta; tre passi con un'icona e la cifra in grande si leggono
 * in un colpo d'occhio: adesso 0 €, poi la pratica nella tua mail, solo
 * allora 99 €.
 */
const CARTA = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 9.5h19M6.5 15h4" />
  </svg>
);
const BUSTA = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);
const SPUNTA = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="m7.5 12.5 3 3 6-6.5" />
  </svg>
);

const PASSI = [
  { icona: CARTA, grande: "0 €", piccolo: "adesso metti solo i dati" },
  { icona: BUSTA, grande: "Pratica", piccolo: "la ricevi nella tua mail" },
  { icona: SPUNTA, grande: "99 €", piccolo: "solo dopo, mai prima" },
];

export function TreTempi() {
  return (
    <div className="es-tempi" role="list" aria-label="Come funziona il pagamento">
      <div className="es-tempi-fila">
        {PASSI.map((p, i) => (
          <div key={p.grande} className="es-tempo" role="listitem">
            <span className="es-tempo-icona">{p.icona}</span>
            <b>{p.grande}</b>
            <span>{p.piccolo}</span>
            {i < PASSI.length - 1 && <i className="es-tempo-freccia" aria-hidden="true">→</i>}
          </div>
        ))}
      </div>
      <p className="es-tempi-nota">Come in albergo: la carta fa solo da garanzia.</p>
    </div>
  );
}
