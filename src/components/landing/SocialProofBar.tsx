import { PR_GREEN } from "./constants";

export function SocialProofBar() {
  return (
    <div className="py-8 bg-[#0a1628] border-y border-white/5">
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
        {[
          { value: "122+", label: "Recensioni Trustpilot" },
          { value: "10+", label: "Anni di esperienza" },
          { value: "24h", label: "Consegna garantita" },
          { value: "65€", label: "Prezzo fisso a pratica" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <span className="text-2xl md:text-3xl font-black" style={{ color: PR_GREEN }}>{s.value}</span>
            <p className="text-white/30 text-[10px] uppercase tracking-[0.15em] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
