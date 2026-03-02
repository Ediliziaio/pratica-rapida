import { Link } from "react-router-dom";
import { PR_GREEN } from "./constants";

interface StickyBottomBarProps {
  showBottomBar: boolean;
}

export function StickyBottomBar({ showBottomBar }: StickyBottomBarProps) {
  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0a1628] border-t border-white/10 shadow-2xl transition-transform duration-500 ${showBottomBar ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="max-w-5xl mx-auto px-4 py-2 md:py-4 flex flex-col md:flex-row items-center justify-between gap-2 md:gap-3">
        <div className="text-center md:text-left">
          <p className="block md:hidden text-white text-xs font-semibold">
            Iscriviti e Ricevi Gratis la Guida:
            <span className="font-bold" style={{ color: PR_GREEN }}> "Come Trasformare un Preventivo in una Vendita"</span>
          </p>
          <div className="hidden md:block">
            <p className="text-white text-base font-semibold">
              Iscriviti alla Piattaforma e Ricevi in Regalo il Documento:
            </p>
            <p className="text-sm font-bold" style={{ color: PR_GREEN }}>
              "Come Trasformare un Preventivo in una Vendita (Senza Rincorrere il Cliente)"
            </p>
            <p className="text-xs text-white/40">
              Il Metodo per Far Dire "Sì" al Cliente Senza Pressioni, Telefonate Inutili o Sconti Forzati
            </p>
          </div>
        </div>
        <Link
          to="/auth"
          className="whitespace-nowrap px-4 py-2 md:px-6 md:py-3 rounded-lg font-bold text-white text-sm md:text-base transition-all hover:scale-105 animate-pulse-glow w-full md:w-auto text-center"
          style={{ backgroundColor: PR_GREEN }}
        >
          Iscriviti Gratis
        </Link>
      </div>
    </div>
  );
}
