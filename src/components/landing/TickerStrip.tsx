const items = [
  "\"Non tornerei mai indietro\" – Zanellato Enrico",
  "122+ recensioni su Trustpilot",
  "14+ anni di esperienza",
  "Consegna in 24h",
  "Zero canoni mensili",
  "\"Servizio impeccabile\" – Marco Barbieri",
  "La responsabilità è nostra",
  "\"Finalmente qualcuno di affidabile\" – F. Romano",
  "500+ installatori attivi in tutta Italia",
  "\"Li userei sempre\" – Termoidraulica Brembati",
];

export default function TickerStrip() {
  const content = items.map((t) => `  •  ${t}`).join("");
  return (
    <div
      className="relative py-3.5 overflow-hidden whitespace-nowrap"
      style={{ background: "linear-gradient(90deg, hsl(152 80% 16%) 0%, hsl(152 80% 20%) 50%, hsl(152 80% 16%) 100%)" }}
    >
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, hsl(152 80% 16%) 0%, transparent 100%)" }}
      />
      {/* Right fade */}
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
