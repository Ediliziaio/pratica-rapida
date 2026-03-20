const items = [
  "\"Non tornerei mai indietro\" – Zanellato Enrico",
  "122+ recensioni su Trustpilot",
  "14+ anni di esperienza",
  "Consegna in 24h",
  "65€ a pratica tutto incluso",
  "Zero canoni mensili",
  "\"Servizio impeccabile\" – Marco Barbieri",
  "Assicurazione RC inclusa",
];

export default function TickerStrip() {
  const content = items.map((t) => `  •  ${t}`).join("");
  return (
    <div className="py-3.5 overflow-hidden whitespace-nowrap text-white" style={{ backgroundColor: "hsl(var(--pr-green))" }}>
      <div className="animate-marquee inline-block">
        <span className="text-sm font-medium tracking-wide">{content}</span>
        <span className="text-sm font-medium tracking-wide">{content}</span>
      </div>
    </div>
  );
}
