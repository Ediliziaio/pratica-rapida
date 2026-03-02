import { Gift } from "lucide-react";
import { PR_GREEN } from "./constants";

export function TopBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] text-white text-center py-2.5 text-xs md:text-sm font-semibold tracking-wide flex items-center justify-center gap-2" style={{ backgroundColor: PR_GREEN }}>
      <Gift className="w-4 h-4" />
      PAGHI SOLO A PRATICA EFFETTUATA
    </div>
  );
}
