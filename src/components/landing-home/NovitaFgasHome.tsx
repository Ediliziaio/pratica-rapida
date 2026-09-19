import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Blocco «Novità» in home: annuncia il pacchetto ENEA + F-Gas per le pompe di
 * calore e rimanda alla pagina dedicata. Nessun prezzo qui né nella pagina:
 * le tariffe restano nell'area riservata (decisione del titolare, 19/09/2026).
 * La home non viene toccata altrove.
 */
export default function NovitaFgasHome() {
  return (
    <section aria-label="Novità: pacchetto ENEA e F-Gas" className="px-5 lg:px-8 pt-24 sm:pt-28 relative z-10">
      <div
        className="mx-auto max-w-6xl rounded-[22px] border px-5 py-5 sm:px-7 sm:py-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
        style={{ borderColor: "hsla(152,80%,35%,0.25)", background: "linear-gradient(135deg, hsla(152,80%,35%,0.08), hsla(199,89%,48%,0.06))" }}
      >
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em]" style={{ color: "hsl(var(--pr-green))" }}>
            <Sparkles size={14} /> Novità
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-black tracking-tight text-foreground">
            Pompe di calore: pratica ENEA e comunicazione F-Gas in un unico pacchetto
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
            Una sola richiesta, due pratiche seguite da noi. Tu carichi la targhetta, al resto pensiamo noi.
          </p>
        </div>
        <Link
          to="/servizi/enea-fgas"
          className="inline-flex shrink-0 items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ background: "hsl(var(--pr-green))", boxShadow: "0 4px 24px hsla(152,80%,35%,0.35)" }}
        >
          Scopri di più <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
