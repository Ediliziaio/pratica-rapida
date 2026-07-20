/**
 * DocumentiUtili — pagina con la lista dei documenti utili scaricabili.
 *
 * Per ora contiene la "Dichiarazione sostitutiva atto notorio beneficiario"
 * (non auto-compilato). Il rivenditore lo scarica via window.print() come PDF
 * o lo stampa direttamente e lo fa firmare al cliente.
 *
 * Architettura espandibile: aggiungi qui altri template come componenti React
 * con doppio rendering (preview inline + print A4 via @media print CSS).
 */

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Printer } from "lucide-react";
import AttoNotorioTemplate from "@/components/documenti/AttoNotorioTemplate";
import AsseverazioneNeutraTemplate from "@/components/documenti/AsseverazioneNeutraTemplate";

interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  use_case: string;
  component: React.ComponentType;
}

const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "atto-notorio",
    title: "Dichiarazione sostitutiva atto notorio del beneficiario",
    description: "Da far firmare al cliente finale beneficiario della detrazione fiscale.",
    use_case: "Vale per tutti gli interventi: serramenti, schermature solari, pompe di calore, ecc. Da scaricare prima di consegnare la pratica.",
    component: AttoNotorioTemplate,
  },
  {
    id: "asseverazione-neutra",
    title: "Dichiarazione Requisiti Tecnici (modello in bianco)",
    description: "Modello neutro da compilare a mano e firmare.",
    use_case: "Da usare quando serve il modello vuoto. Sulle pratiche che ci affidi, la stessa Dichiarazione Requisiti Tecnici la trovi già precompilata nella scheda del cliente a lavorazione conclusa.",
    component: AsseverazioneNeutraTemplate,
  },
];

export default function DocumentiUtili() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Documenti da scaricare</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Documenti utili da consegnare al cliente finale, da scaricare e stampare.
        </p>
      </div>

      <div className="grid gap-4">
        {DOCUMENT_TEMPLATES.map((tpl) => (
          <DocumentRow key={tpl.id} template={tpl} />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ template }: { template: DocumentTemplate }) {
  const printRef = useRef<HTMLDivElement>(null);
  const Component = template.component;

  /**
   * Stampa il documento in una finestra ISOLATA.
   *
   * Il vecchio metodo (classe `.printing-document` + `.printable-area` in
   * position:absolute su @media print) tagliava i documenti di più pagine a
   * una sola: gli elementi assoluti non si spezzano tra le pagine in Chrome.
   * Qui apriamo una finestra pulita col SOLO documento, copiando i fogli di
   * stile dell'app (così i template Tailwind restano formattati), e stampiamo
   * quella: il contenuto fluisce naturalmente su tutte le pagine.
   */
  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return; // popup bloccato

    // Copia <style> e <link rel=stylesheet> dell'app: in dev Vite inietta
    // <style>, in produzione c'è il CSS linkato — prendiamo entrambi.
    const styles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    ).map((el) => el.outerHTML).join("\n");

    win.document.open();
    win.document.write(
      `<!doctype html><html lang="it"><head><meta charset="utf-8">
${styles}
<style>@page { size: A4; margin: 0; } html,body { margin: 0; background: #fff; }</style>
</head><body>${node.innerHTML}</body></html>`,
    );
    win.document.close();

    // Stampa dopo che i CSS linkati sono caricati, altrimenti esce senza stile.
    const doPrint = () => { win.focus(); win.print(); };
    if (win.document.readyState === "complete") setTimeout(doPrint, 350);
    else win.addEventListener("load", () => setTimeout(doPrint, 350));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">{template.title}</CardTitle>
              <CardDescription className="mt-1">{template.description}</CardDescription>
              <p className="text-xs text-muted-foreground mt-2">{template.use_case}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />Stampa
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-1.5" />Scarica PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <details className="rounded-lg border bg-muted/30">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none hover:bg-muted/50">
            Anteprima documento
          </summary>
          <div ref={printRef} className="printable-area p-2 sm:p-6 overflow-x-auto bg-muted/40">
            <Component />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
