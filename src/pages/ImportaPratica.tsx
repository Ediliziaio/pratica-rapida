import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CRM_OMBRA } from "@/lib/crmOmbra";
import { importaPratica, type RapportoImportazione } from "@/features/enea-shadow-crm/ombra-import/importaPratica";
import { verificaEsportazione, type EsportazionePratica } from "@/features/enea-shadow-crm/ombra-import/exportFormat";
import { clientImportazioneSupabase } from "@/features/enea-shadow-crm/ombra-import/supabaseAdapters";

// Solo CRM ombra. Si sceglie il file esportato dal CRM vero, si vede cosa
// contiene, si conferma. Niente parte in automatico.

type Stato =
  | { fase: "vuoto" }
  | { fase: "rifiutato"; errori: string[] }
  | { fase: "pronto"; nomeFile: string; esportazione: EsportazionePratica }
  | { fase: "importo"; nomeFile: string; esportazione: EsportazionePratica }
  | { fase: "fatto"; rapporto: RapportoImportazione }
  | { fase: "errore"; errori: string[] };

export default function ImportaPratica() {
  const [stato, setStato] = useState<Stato>({ fase: "vuoto" });
  const queryClient = useQueryClient();

  if (!CRM_OMBRA) {
    return <div className="p-6 text-muted-foreground">Questa pagina esiste solo nel CRM ombra.</div>;
  }

  const scegliFile = async (file: File | undefined) => {
    if (!file) { setStato({ fase: "vuoto" }); return; }
    let contenuto: unknown;
    try { contenuto = JSON.parse(await file.text()); } catch { setStato({ fase: "rifiutato", errori: ["Il file non è JSON leggibile."] }); return; }
    const verifica = await verificaEsportazione(contenuto);
    if (verifica.ok === false) { setStato({ fase: "rifiutato", errori: verifica.errori }); return; }
    setStato({ fase: "pronto", nomeFile: file.name, esportazione: verifica.esportazione });
  };

  const importa = async () => {
    if (stato.fase !== "pronto") return;
    setStato({ fase: "importo", nomeFile: stato.nomeFile, esportazione: stato.esportazione });
    try {
      const esito = await importaPratica(clientImportazioneSupabase(supabase), stato.esportazione);
      if (esito.ok === false) { setStato({ fase: "errore", errori: esito.errori }); return; }
      await queryClient.invalidateQueries();
      setStato({ fase: "fatto", rapporto: esito.rapporto });
    } catch (error) {
      setStato({ fase: "errore", errori: [(error as Error).message] });
    }
  };

  const e = stato.fase === "pronto" || stato.fase === "importo" ? stato.esportazione : null;
  const p = e?.practice ?? null;

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Importa pratica dal CRM vero</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            File <code>pratica-ombra-*.json</code> scaricato con «Esporta per CRM ombra». Il file viene verificato per intero; una pratica già presente non viene sovrascritta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="application/json,.json" onChange={(ev) => void scegliFile(ev.target.files?.[0])} />

          {stato.fase === "rifiutato" && (
            <div className="border-l-4 border-destructive bg-destructive/5 p-3 text-sm">
              <strong>File rifiutato.</strong>
              <ul className="mt-1 list-disc pl-5">{stato.errori.map((errore) => <li key={errore}>{errore}</li>)}</ul>
            </div>
          )}

          {e && p && (
            <div className="space-y-3 rounded border p-3 text-sm">
              <div><span className="text-muted-foreground">Pratica</span> <code>{e.practiceId}</code></div>
              <div><span className="text-muted-foreground">Cliente</span> {String(p.cliente_nome ?? "")} {String(p.cliente_cognome ?? "")}</div>
              <div><span className="text-muted-foreground">Brand / servizio</span> {String(p.brand ?? "-")} / {String(p.tipo_servizio ?? "-")}</div>
              <div><span className="text-muted-foreground">Stage nel CRM vero</span> {e.stage ? `${e.stage.name} (${e.stage.stage_type})` : "non indicato → Pronte da fare"}</div>
              <div><span className="text-muted-foreground">Rivenditore</span> {e.reseller ? String(e.reseller.ragione_sociale ?? e.reseller.id) : "nessuno"}</div>
              <div><span className="text-muted-foreground">Documenti</span> {e.documents.length} (sha256 verificati)</div>
              <div><span className="text-muted-foreground">Esportata</span> {new Date(e.exportedAt).toLocaleString("it-IT")} da {e.exportedBy}</div>
              <Button type="button" onClick={importa} disabled={stato.fase === "importo"}>
                {stato.fase === "importo" ? "Importo…" : "Importa nel CRM ombra"}
              </Button>
            </div>
          )}

          {stato.fase === "errore" && (
            <div className="border-l-4 border-destructive bg-destructive/5 p-3 text-sm">
              <strong>Importazione non eseguita.</strong>
              <ul className="mt-1 list-disc pl-5">{stato.errori.map((errore) => <li key={errore}>{errore}</li>)}</ul>
            </div>
          )}

          {stato.fase === "fatto" && (
            <div className="border-l-4 border-green-600 bg-green-50 p-3 text-sm">
              <strong>Importata.</strong> Pratica <code>{stato.rapporto.practiceId}</code> in «{stato.rapporto.stageType}».
              {" "}Documenti caricati: {stato.rapporto.documentiCaricati}{stato.rapporto.documentiGiaPresenti ? `, già presenti: ${stato.rapporto.documentiGiaPresenti}` : ""}.
              {stato.rapporto.rivenditoreCreato ? " Rivenditore creato nell'ombra." : ""}
              {" "}<a className="underline" href={`/kanban?practice=${stato.rapporto.practiceId}`}>Apri nel Kanban</a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
