const items = [
  "\"Finalmente qualcuno che gestisce il Conto Termico\" – Rossi Impianti",
  "250€ a pratica tutto incluso",
  "Zero pratiche respinte dal GSE",
  "Entro i 90 giorni garantito",
  "Documentazione tecnica completa",
  "Contributo diretto per il tuo cliente",
  "\"Servizio preciso e veloce\" – Termoidraulica Bianchi",
  "Assicurazione RC inclusa",
];

export default function TickerStripCT() {
  const content = items.map((t) => `  •  ${t}`).join("");
  return (
    <div
      className="relative py-3.5 overflow-hidden whitespace-nowrap"
      style={{ background: "linear-gradient(90deg, hsl(152 80% 16%) 0%, hsl(152 80% 20%) 50%, hsl(152 80% 16%) 100%)" }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, hsl(152 80% 16%) 0%, transparent 100%)" }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: "linear-gradient(270deg, hsl(152 80% 16%) 0%, transparent 100%)" }}
      />
      <div className="animate-marquee inline-block">
        <span className="text-sm font-medium tracking-wide text-white/80">{content}</span>
        <span className="text-sm font-medium tracking-wide text-white/80">{content}</span>
      </div>
    </div>
  );
}
