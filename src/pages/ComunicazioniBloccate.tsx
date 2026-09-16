import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CRM_OMBRA } from "@/lib/crmOmbra";

// Nel CRM ombra le comunicazioni non partono: finiscono qui. Questa pagina
// mostra cosa APR AVREBBE mandato (mail, WhatsApp, chiamate, solleciti).
// La tabella non è nei tipi generati (types.ts non si tocca a mano): cast locale.

interface ComunicazioneBloccata {
  id: string;
  funzione: string;
  canale: string;
  destinatario: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const CANALE_LABEL: Record<string, string> = {
  email: "Mail",
  whatsapp: "WhatsApp",
  chiamata: "Chiamata",
  notifica_cliente: "Notifica cliente",
  reminder: "Sollecito",
};

function riassunto(payload: Record<string, unknown>): string {
  const parti: string[] = [];
  for (const key of ["template", "template_name", "channel", "text_body", "media_type", "agent_id", "scheduled_at"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) parti.push(`${key}: ${value.length > 80 ? `${value.slice(0, 80)}…` : value}`);
  }
  return parti.join(" · ") || "—";
}

export default function ComunicazioniBloccate() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["comunicazioni_bloccate"],
    enabled: CRM_OMBRA,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("comunicazioni_bloccate").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as ComunicazioneBloccata[];
    },
  });

  if (!CRM_OMBRA) {
    return <div className="p-6 text-muted-foreground">Questa pagina esiste solo nel CRM ombra.</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Comunicazioni bloccate</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Tutto ciò che il CRM ombra avrebbe spedito e non ha spedito. Ultime 500.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Lettura in corso…</p>}
          {error && <p className="text-sm text-destructive">Errore di lettura: {(error as Error).message}</p>}
          {data && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Canale</TableHead>
                    <TableHead>Funzione</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Contenuto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nessuna comunicazione bloccata finora.</TableCell></TableRow>
                  )}
                  {data.map((riga) => (
                    <TableRow key={riga.id}>
                      <TableCell className="whitespace-nowrap">{new Date(riga.created_at).toLocaleString("it-IT")}</TableCell>
                      <TableCell><Badge variant="secondary">{CANALE_LABEL[riga.canale] ?? riga.canale}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{riga.funzione}</TableCell>
                      <TableCell>{riga.destinatario ?? "—"}</TableCell>
                      <TableCell className="text-sm">{riassunto(riga.payload)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
