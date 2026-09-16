import { CRM_OMBRA } from "@/lib/crmOmbra";

// Striscia fissa in alto, su ogni pagina, quando l'app gira come CRM ombra.
// È l'unica differenza visibile rispetto al CRM vero: serve a non confondersi.
export function OmbraBanner() {
  if (!CRM_OMBRA) return null;
  return (
    <div
      role="status"
      data-testid="ombra-banner"
      className="sticky top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black"
    >
      <span className="rounded bg-black px-2 py-0.5 text-xs uppercase tracking-widest text-amber-300">Ombra</span>
      <span>CRM ombra: qui lavora APR. Nessuna mail, WhatsApp o chiamata parte da questo ambiente.</span>
    </div>
  );
}
