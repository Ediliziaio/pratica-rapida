import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CRM_OMBRA, CRM_OMBRA_DOMANDE_URL } from "@/lib/crmOmbra";

// La finestra delle domande APR dentro il CRM ombra. È una vista: i dati vivono
// nei file JSON di APR su disco e passano dal server locale
// src/features/enea-shadow-crm/operator-answers/server.ts (solo 127.0.0.1).
// Stessa lista, stesse regole e stesso ledger della pagina page.html.

interface DomandaAperta {
  id: string;
  displayName: string;
  prompt: string;
  field: string;
  pendingRequest: { question: string; missingDocumentType: string | null; requestedAt: string; previousAnswer: string } | null;
}

interface RispostaApi {
  ok: boolean;
  reason?: string;
  note?: string | null;
  supersededResponseIds?: string[];
  supersededRuleConfirmations?: Array<{ responseId: string }>;
}

interface Giro { runId: string; status: string | null; cohorts: string[] }

type Esito = { tipo: "ok" | "errore"; testo: string; avviso?: string };

function Riga({ domanda }: { domanda: DomandaAperta }) {
  const [risposta, setRisposta] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const registrata = esito?.tipo === "ok";

  const registra = async () => {
    setInCorso(true);
    setEsito(null);
    try {
      const r = await fetch(`${CRM_OMBRA_DOMANDE_URL}/api/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: domanda.id, answer: risposta }),
      });
      const body = (await r.json()) as RispostaApi;
      if (!body.ok) { setEsito({ tipo: "errore", testo: body.reason ?? "Risposta non accettata." }); return; }
      const sostituite = body.supersededResponseIds?.length ? ` Sostituisce ${body.supersededResponseIds.length} risposta/e precedente/i.` : "";
      const regole = body.supersededRuleConfirmations?.length
        ? `Attenzione: questa risposta ha superato una conferma di regola generale su questa pratica (${body.supersededRuleConfirmations.map((r) => r.responseId).join(", ")}). La regola non è più attiva per ${domanda.displayName}.`
        : undefined;
      setEsito({ tipo: "ok", testo: (body.note || "Registrata.") + sostituite, avviso: regole });
    } catch (e) {
      setEsito({ tipo: "errore", testo: `Errore di scrittura: ${(e as Error).message}` });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <TableRow className={registrata ? "bg-green-50" : undefined}>
      <TableCell className="whitespace-nowrap align-top font-semibold">{domanda.displayName}</TableCell>
      <TableCell className="align-top">
        <div>{domanda.prompt}</div>
        {domanda.pendingRequest && (
          <div className="mt-2 border-l-4 border-primary bg-primary/5 p-2 text-sm">
            <div>Dato richiesto: {domanda.pendingRequest.question}</div>
            <div className="mt-1 text-muted-foreground">
              {domanda.pendingRequest.missingDocumentType ? `Documento atteso: ${domanda.pendingRequest.missingDocumentType}. ` : ""}
              Richiesto il {new Date(domanda.pendingRequest.requestedAt).toLocaleDateString("it-IT")}. Ultima risposta: {domanda.pendingRequest.previousAnswer}
            </div>
          </div>
        )}
        {!domanda.pendingRequest && domanda.field === "operator.pendingData" && (
          <div className="mt-2 border-l-4 border-primary bg-primary/5 p-2 text-sm">Nel ledger non risulta nessuna richiesta attiva per questo cliente: il dato mancante non è determinabile da qui.</div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <Textarea value={risposta} onChange={(e) => setRisposta(e.target.value)} placeholder="Scrivi la risposta" readOnly={registrata} rows={3} />
        <div className="mt-2 flex items-start gap-3">
          <Button type="button" size="sm" onClick={registra} disabled={inCorso || registrata}>Registra</Button>
          {esito && <span className={`text-sm ${esito.tipo === "ok" ? "text-green-700" : "text-destructive"}`}>{esito.testo}</span>}
        </div>
        {esito?.avviso && <strong className="mt-2 block border-l-4 border-amber-500 bg-amber-50 p-2 text-sm text-amber-900">{esito.avviso}</strong>}
      </TableCell>
    </TableRow>
  );
}

export default function DomandeApr() {
  const [domande, setDomande] = useState<DomandaAperta[] | null>(null);
  const [giro, setGiro] = useState<Giro | null>(null);
  const [letteAlle, setLetteAlle] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setErrore(null);
    try {
      const r = await fetch(`${CRM_OMBRA_DOMANDE_URL}/api/open-questions`);
      const body = await r.json();
      setDomande(body.questions ?? []);
      setGiro(body.run ?? null);
      setLetteAlle(new Date(body.readAt).toLocaleTimeString("it-IT"));
    } catch (e) {
      setErrore(`Server delle domande non raggiungibile su ${CRM_OMBRA_DOMANDE_URL}: avvialo con "node src/features/enea-shadow-crm/operator-answers/server.ts". (${(e as Error).message})`);
      setDomande([]);
    }
  };

  useEffect(() => { if (CRM_OMBRA) void carica(); }, []);

  if (!CRM_OMBRA) {
    return <div className="p-6 text-muted-foreground">Questa pagina esiste solo nel CRM ombra.</div>;
  }

  const sommario = giro
    ? `${domande?.length ?? 0} domande aperte · giro ${giro.runId} (${giro.status ?? "stato ignoto"}, ${giro.cohorts.length} pratiche lavorate)${letteAlle ? ` · lette alle ${letteAlle}` : ""}`
    : domande === null ? "Lettura in corso…" : "Nessun giro trovato in runs/: impossibile stabilire quali coorti mostrare.";

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Domande operatore aperte</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{sommario}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={carica}>Ricarica</Button>
        </CardHeader>
        <CardContent>
          {errore && <p className="mb-4 text-sm text-destructive">{errore}</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Cliente</TableHead>
                  <TableHead className="w-[42%]">Domanda</TableHead>
                  <TableHead>Risposta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domande && domande.length === 0 && !errore && (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Nessuna domanda aperta nel giro corrente.</TableCell></TableRow>
                )}
                {domande?.map((domanda) => <Riga key={domanda.id} domanda={domanda} />)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
