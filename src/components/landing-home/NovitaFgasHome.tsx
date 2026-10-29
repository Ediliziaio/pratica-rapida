import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Blocco editoriale in cima alla home. Deve puntare all'ultima uscita
 * newsletter/articolo, non a una pagina commerciale scollegata dal calendario.
 */
export default function NovitaFgasHome() {
  return (
    <section aria-label="Ultima notizia PraticaRapida" className="px-5 lg:px-8 pt-24 sm:pt-28 relative z-10">
      <div
        className="mx-auto max-w-6xl rounded-[22px] border px-5 py-5 sm:px-7 sm:py-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
        style={{ borderColor: "hsla(152,80%,35%,0.25)", background: "linear-gradient(135deg, hsla(152,80%,35%,0.08), hsla(199,89%,48%,0.06))" }}
      >
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em]" style={{ color: "hsl(var(--pr-green))" }}>
            <Sparkles size={14} /> Legge di Bilancio 2027
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-black tracking-tight text-foreground">
            Ecobonus al 65%? Cosa sappiamo davvero
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
            Il disegno di legge è stato approvato dal Governo, ma il ritorno del 65% non è ancora confermato. Facciamo il punto sulle indicazioni disponibili e sui prossimi passaggi.
          </p>
        </div>
        <Link
          to="/blog/legge-bilancio-2027-ecobonus-65-cosa-sappiamo"
          className="inline-flex shrink-0 items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ background: "hsl(var(--pr-green))", boxShadow: "0 4px 24px hsla(152,80%,35%,0.35)" }}
        >
          Leggi la notizia <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
