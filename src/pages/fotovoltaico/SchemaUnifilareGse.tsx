import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Download, FileCheck2, FileUp, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { validatePhotovoltaicAttachment } from "@/features/fotovoltaico/attachments";
import { UNIFILARE_STATUS_LABELS, type UnifilareStatus } from "@/features/fotovoltaico/workflow";
import { toast } from "sonner";

type Practice = {
  id: string;
  reseller_id: string;
  proprietario_nome: string | null;
  unifilare_choice: string | null;
  unifilare_status: UnifilareStatus;
  companies?: { ragione_sociale?: string | null; email?: string | null } | null;
};

type Attachment = {
  id: string;
  category: string;
  storage_path: string;
  original_name: string;
  created_at: string;
};

const photovoltaicDb = supabase as unknown as SupabaseClient;

function safeFileName(name: string) {
  const parts = name.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()!.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "documento";
  return `${base}${ext}`;
}

export default function SchemaUnifilareGse() {
  const { id } = useParams<{ id: string }>();
  const { user, isInternal } = useAuth();
  const [practice, setPractice] = useState<Practice | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const drafts = useMemo(() => attachments.filter((item) => item.category === "schema_unifilare_bozza"), [attachments]);
  const signed = useMemo(() => attachments.filter((item) => item.category === "schema_unifilare_firmato"), [attachments]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: practiceData, error: practiceError }, { data: attachmentData, error: attachmentError }] = await Promise.all([
      photovoltaicDb
        .from("fotovoltaico_practices")
        .select("id, reseller_id, proprietario_nome, unifilare_choice, unifilare_status, companies:reseller_id(ragione_sociale,email)")
        .eq("id", id)
        .maybeSingle(),
      photovoltaicDb
        .from("fotovoltaico_attachments")
        .select("id, category, storage_path, original_name, created_at")
        .eq("practice_id", id)
        .in("category", ["schema_unifilare_bozza", "schema_unifilare_firmato"])
        .order("created_at", { ascending: false }),
    ]);
    if (practiceError || attachmentError || !practiceData) {
      toast.error("Schema non disponibile", { description: practiceError?.message ?? attachmentError?.message });
      setPractice(null);
    } else {
      setPractice(practiceData as Practice);
      setAttachments((attachmentData ?? []) as Attachment[]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const download = async (attachment: Attachment) => {
    const { data, error } = await supabase.storage.from("fotovoltaico-documents").createSignedUrl(attachment.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Download non riuscito");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const upload = async () => {
    if (!practice || !id || !user || !file) return;
    const category = isInternal ? "schema_unifilare_bozza" : "schema_unifilare_firmato";
    const validationError = validatePhotovoltaicAttachment(category, file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setWorking(true);
    try {
      const path = `${practice.reseller_id}/${id}/${category}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("fotovoltaico-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;

      const { data: inserted, error: attachmentError } = await photovoltaicDb
        .from("fotovoltaico_attachments")
        .insert({
          practice_id: id,
          category,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user.id,
        })
        .select("id")
        .single();
      if (attachmentError) throw attachmentError;

      if (isInternal) {
        const { error: updateError } = await photovoltaicDb
          .from("fotovoltaico_practices")
          .update({ unifilare_status: "bozza_pronta" })
          .eq("id", id)
          .eq("unifilare_choice", "richiesto_a_pratica_rapida");
        if (updateError) throw updateError;
        toast.success("Schema caricato", { description: "Ora puoi inviare l'avviso al rivenditore." });
      } else {
        const { error: rpcError } = await photovoltaicDb.rpc("submit_fotovoltaico_unifilare_signed", {
          p_practice_id: id,
          p_attachment_id: inserted.id,
        });
        if (rpcError) throw rpcError;
        toast.success("Schema ricevuto", { description: "Pratica Rapida penserà a inserirlo nella pratica." });
      }
      setFile(null);
      await load();
    } catch (error) {
      toast.error("Caricamento non riuscito", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setWorking(false);
    }
  };

  const sendToReseller = async () => {
    if (!practice || !id) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke("photovoltaico-unifilare", {
        body: { action: "send_for_signature", practiceId: id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Invio non riuscito");
      toast.success(data.alreadySent ? "Schema già inviato" : "E-mail inviata al rivenditore");
      await load();
    } catch (error) {
      toast.error("E-mail non inviata", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Caricamento…</div>;
  if (!practice || practice.unifilare_choice !== "richiesto_a_pratica_rapida") {
    return <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>Schema non richiesto</CardTitle></CardHeader><CardContent>Questa pratica non comprende il servizio di preparazione dello schema unifilare.</CardContent></Card>;
  }

  const canReturn = !isInternal && practice.unifilare_status === "inviato_da_firmare";

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12">
      <Button asChild variant="ghost" size="sm"><Link to="/fotovoltaico/pratiche"><ArrowLeft className="mr-2 h-4 w-4" /> Torna alle pratiche</Link></Button>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Schema unifilare</CardTitle>
              <CardDescription>{practice.proprietario_nome || "Impianto fotovoltaico"} · {practice.companies?.ragione_sociale || "Rivenditore"}</CardDescription>
            </div>
            <Badge>{UNIFILARE_STATUS_LABELS[practice.unifilare_status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {isInternal ? (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                Il rivenditore ha acquistato la preparazione dello schema. Carica qui il PDF predisposto; l'e-mail partirà soltanto quando premi <strong>Invia al rivenditore</strong>.
              </div>
              <div className="space-y-2">
                <Label htmlFor="schema-draft">Schema predisposto da Pratica Rapida · PDF</Label>
                <Input id="schema-draft" type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                <Button onClick={() => void upload()} disabled={!file || working}><FileUp className="mr-2 h-4 w-4" /> Carica schema</Button>
              </div>
              {drafts.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Schema pronto</p>
                  <Button variant="outline" onClick={() => void download(drafts[0])}><Download className="mr-2 h-4 w-4" /> {drafts[0].original_name}</Button>
                  <Button onClick={() => void sendToReseller()} disabled={working || !["bozza_pronta", "inviato_da_firmare"].includes(practice.unifilare_status)}>
                    <Send className="mr-2 h-4 w-4" /> Invia al rivenditore
                  </Button>
                  <p className="text-xs text-muted-foreground"><Mail className="mr-1 inline h-3 w-3" /> Destinazione: {practice.companies?.email || "e-mail azienda non presente"}</p>
                </div>
              )}
              {signed.length > 0 && (
                <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-medium text-emerald-900"><FileCheck2 className="mr-2 inline h-4 w-4" /> Schema firmato e timbrato ricevuto</p>
                  <Button variant="outline" onClick={() => void download(signed[0])}><Download className="mr-2 h-4 w-4" /> Scarica documento ricevuto</Button>
                </div>
              )}
            </>
          ) : (
            <>
              {canReturn ? (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <strong>1.</strong> Scarica lo schema. <strong>2.</strong> Fallo controllare, firmare e timbrare dall'installatore/responsabile tecnico. <strong>3.</strong> Ricaricalo qui. Puoi usare un PDF firmato digitalmente, una scansione o una foto nitida e completa.
                  </div>
                  {drafts[0] && <Button size="lg" onClick={() => void download(drafts[0])}><Download className="mr-2 h-5 w-5" /> Scarica lo schema da firmare</Button>}
                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="schema-signed">Schema firmato e timbrato</Label>
                    <Input id="schema-signed" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                    <p className="text-xs text-muted-foreground">PDF firmato digitalmente, scansione oppure foto nitida, diritta e senza parti tagliate.</p>
                    <Button onClick={() => void upload()} disabled={!file || working}><FileUp className="mr-2 h-4 w-4" /> Ricarica lo schema firmato</Button>
                  </div>
                </>
              ) : practice.unifilare_status === "firmato_ricevuto" ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><FileCheck2 className="mr-2 inline h-5 w-5" /><strong>Documento ricevuto.</strong> Penseremo noi a inserirlo nella pratica.</div>
              ) : (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">Pratica Rapida sta preparando lo schema. Riceverai un'e-mail quando sarà disponibile.</div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
