/**
 * DichiarazioneTecnicaDialog — dialog modale che permette al superadmin di:
 *  1. visualizzare la "Dichiarazione Requisiti Tecnici" pre-compilata con
 *     i dati azienda fornitore + cliente finale + intervento
 *  2. modificare manualmente i campi (importo, checkbox dichiarative,
 *     tipo intervento)
 *  3. confermare e stampare/scaricare il PDF (window.print con @media print)
 *
 * I dati pratica vengono passati dall'esterno; i dati azienda completi
 * (P.IVA, indirizzo) vengono fetchati dal DB se il caller non li ha già.
 *
 * Salvataggio: per ora il flusso è "anteprima → stampa". Il salvataggio
 * come allegato pratica nel bucket è un follow-up (non blocca l'uso).
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, Eye, FileText, CheckCircle2, Loader2 } from "lucide-react";
import DichiarazioneTecnicaTemplate from "./DichiarazioneTecnicaTemplate";
import {
  buildDichiarazioneData,
  renderDichiarazioneHtml,
  type DichiarazioneTecnicaData,
} from "@shared/dichiarazione.ts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practice: {
    id: string;
    cliente_nome?: string | null;
    cliente_cognome?: string | null;
    cliente_cf?: string | null;
    cliente_indirizzo?: string | null;
    prodotto_installato?: string | null;
    reseller_id?: string | null;
  } | null;
}

export default function DichiarazioneTecnicaDialog({ open, onOpenChange, practice }: Props) {
  const [tab, setTab] = useState<"dati" | "anteprima">("dati");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dati azienda fornitrice — colonne reali della tabella `companies`:
  // `ragione_sociale`, `piva`, `indirizzo`, `citta`, `provincia`, `cap`.
  // (NON `indirizzo_sede` / `comune_sede` / `provincia_sede` — quelle colonne
  // non esistono nello schema.)
  const { data: company } = useQuery({
    queryKey: ["dichiarazione-company", practice?.reseller_id],
    enabled: !!practice?.reseller_id && open,
    queryFn: async () => {
      if (!practice?.reseller_id) return null;
      const { data } = await supabase
        .from("companies")
        .select("ragione_sociale, piva, indirizzo, citta, provincia, cap")
        .eq("id", practice.reseller_id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch dati_form della pratica — i dati immobile + residenza cliente sono
  // campi personalizzati salvati nel JSONB `enea_practices.dati_form` (popolato
  // quando il cliente compila il FormPubblico). Struttura:
  //   dati_form.richiedente.{nome,cognome,cf,...}
  //   dati_form.residenza.{comune,provincia,indirizzo,civico,cap}
  //   dati_form.appartamento_lavori.{comune,provincia,indirizzo,numero,cap}
  const { data: praticaDataForm } = useQuery({
    queryKey: ["dichiarazione-praticaform", practice?.id],
    enabled: !!practice?.id && open,
    queryFn: async () => {
      if (!practice?.id) return null;
      const { data } = await supabase
        .from("enea_practices")
        .select("dati_form")
        .eq("id", practice.id)
        .maybeSingle();
      return (data?.dati_form ?? null) as Record<string, unknown> | null;
    },
  });

  // Seed iniziale: stessa identica logica che usa la generazione automatica
  // lato server (on-stage-changed → "recensione"), così il documento salvato a
  // mano e quello generato da solo partono dagli stessi dati.
  const seedData = useMemo<DichiarazioneTecnicaData>(
    () => buildDichiarazioneData({ practice, company, datiForm: praticaDataForm ?? null }),
    [practice, company, praticaDataForm],
  );

  const [data, setData] = useState<DichiarazioneTecnicaData>(seedData);
  useEffect(() => { if (open) setData(seedData); }, [open, seedData]);

  // Mutation: conferma e salva il documento come allegato della pratica.
  // Pipeline:
  //  1. genera HTML standalone dal template + dati attuali
  //  2. upload come blob HTML al bucket Storage `documenti`
  //  3. insert riga in tabella `documenti` con tipo=dichiarazione_tecnica,
  //     visibilita=azienda_interno (così il rivenditore lo vede via RLS)
  //  4. invalidate query → il documento appare immediatamente nella card pratica
  const confirmAndSaveMut = useMutation({
    mutationFn: async () => {
      if (!practice?.id || !practice?.reseller_id) {
        throw new Error("Pratica o azienda non identificata");
      }
      if (!data.azienda_nome.trim()) {
        throw new Error("Manca il nome dell'azienda fornitrice");
      }
      if (!data.cliente_nome.trim() || !data.cliente_cognome.trim()) {
        throw new Error("Manca nome o cognome del cliente");
      }

      const html = renderDichiarazioneHtml(data);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const timestamp = Date.now();
      const filename = `dichiarazione_tecnica_${timestamp}.html`;
      const storagePath = `${practice.reseller_id}/${practice.id}/${filename}`;

      // 1. Upload al bucket Storage
      const { error: uploadErr } = await supabase.storage
        .from("documenti")
        .upload(storagePath, blob, { cacheControl: "3600", upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      // 2. Risolvi caricato_da (auth user corrente)
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Insert riga in documenti — visibilita=azienda_interno permette al
      //    rivenditore (membro della company) di vedere il documento
      const { error: insertErr } = await supabase.from("documenti").insert({
        company_id: practice.reseller_id,
        pratica_id: practice.id,
        nome_file: `Dichiarazione Requisiti Tecnici — ${data.cliente_nome} ${data.cliente_cognome}.html`,
        tipo: "dichiarazione_tecnica",
        mime_type: "text/html",
        size_bytes: blob.size,
        storage_path: storagePath,
        caricato_da: user?.id ?? null,
        visibilita: "azienda_interno",
      });
      if (insertErr) {
        // Rollback: rimuovi il file appena caricato per evitare orfani
        await supabase.storage.from("documenti").remove([storagePath]).catch(() => null);
        throw new Error(`Salvataggio metadata fallito: ${insertErr.message}`);
      }

      // Nota: il documento appare automaticamente nel gruppo "Documenti
      //       precompilati" del PracticeDetailSheet (kanban), che è una
      //       useQuery separata sulla tabella `documenti` filtrata per
      //       tipo='dichiarazione_tecnica' + pratica_id. Niente bisogno di
      //       appendere a documenti_aggiuntivi_urls — anzi, evita duplicati.
    },
    onSuccess: () => {
      // Invalida cache della lista documenti precompilati nel sheet kanban
      queryClient.invalidateQueries({ queryKey: ["practice-precompiled-docs", practice?.id] });
      queryClient.invalidateQueries({ queryKey: ["documenti"] });
      queryClient.invalidateQueries({ queryKey: ["enea-practices"] });
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
      toast({
        title: "Documento confermato ✓",
        description: "La dichiarazione è ora visibile nel gruppo \"Documenti precompilati\" della pratica.",
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Impossibile salvare il documento",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handlePrint = () => {
    document.body.classList.add("printing-document");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-document"), 500);
  };

  const update = <K extends keyof DichiarazioneTecnicaData>(k: K, v: DichiarazioneTecnicaData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Dichiarazione Requisiti Tecnici
          </DialogTitle>
          <DialogDescription>
            Documento precompilato con i dati della pratica. Verifica e modifica i campi prima
            di stampare, in particolare l'importo congruo e le caratteristiche dell'intervento.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dati">1. Dati e dichiarazioni</TabsTrigger>
            <TabsTrigger value="anteprima"><Eye className="h-3.5 w-3.5 mr-1.5" />2. Anteprima e stampa</TabsTrigger>
          </TabsList>

          <TabsContent value="dati" className="mt-4 space-y-5">
            {/* Tipo intervento */}
            <div>
              <Label className="mb-1.5 block">Tipo intervento</Label>
              <Select value={data.tipo_intervento} onValueChange={(v) => update("tipo_intervento", v as DichiarazioneTecnicaData["tipo_intervento"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="infissi">Solo infissi / serramenti</SelectItem>
                  <SelectItem value="schermature">Solo schermature solari</SelectItem>
                  <SelectItem value="entrambi">Entrambi (infissi + schermature)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dati azienda */}
            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Dati azienda fornitrice</h4>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Ragione sociale" value={data.azienda_nome} onChange={(v) => update("azienda_nome", v)} />
                <Field label="P.IVA" value={data.azienda_piva} onChange={(v) => update("azienda_piva", v)} />
                <Field label="Città" value={data.azienda_citta} onChange={(v) => update("azienda_citta", v)} />
                <Field label="Provincia" value={data.azienda_provincia} onChange={(v) => update("azienda_provincia", v)} />
                <Field label="Via" value={data.azienda_via} onChange={(v) => update("azienda_via", v)} />
                <Field label="Civico" value={data.azienda_civico} onChange={(v) => update("azienda_civico", v)} />
              </div>
            </section>

            {/* Dati cliente */}
            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Dati cliente finale</h4>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Nome" value={data.cliente_nome} onChange={(v) => update("cliente_nome", v)} />
                <Field label="Cognome" value={data.cliente_cognome} onChange={(v) => update("cliente_cognome", v)} />
                <Field label="Codice fiscale" value={data.cliente_cf} onChange={(v) => update("cliente_cf", v)} />
                <Field label="Città residenza" value={data.cliente_citta} onChange={(v) => update("cliente_citta", v)} />
                <Field label="Via residenza" value={data.cliente_via} onChange={(v) => update("cliente_via", v)} />
                <Field label="Civico residenza" value={data.cliente_civico} onChange={(v) => update("cliente_civico", v)} />
              </div>
            </section>

            {/* Dati immobile */}
            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Dati immobile oggetto intervento</h4>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Città" value={data.immobile_citta} onChange={(v) => update("immobile_citta", v)} />
                <Field label="Provincia" value={data.immobile_provincia} onChange={(v) => update("immobile_provincia", v)} />
                <Field label="CAP" value={data.immobile_cap} onChange={(v) => update("immobile_cap", v)} />
                <Field label="Via" value={data.immobile_via} onChange={(v) => update("immobile_via", v)} />
                <Field label="Civico" value={data.immobile_civico} onChange={(v) => update("immobile_civico", v)} />
              </div>
            </section>

            {/* Caratteristiche tecniche — il documento stampa sempre entrambe
                le sezioni (è un modulo unico infissi + schermature), quindi
                entrambi i gruppi restano modificabili: il "Tipo intervento"
                qui sopra decide solo quali caselle nascono spuntate. */}
            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Caratteristiche infissi</h4>
              <ToggleField
                label="Rispetta trasmittanza minima (D.M. 26/06/2015, EN ISO 10077-1)"
                checked={data.caratteristiche_infissi.rispetta_trasmittanza}
                onChange={(v) => update("caratteristiche_infissi", { ...data.caratteristiche_infissi, rispetta_trasmittanza: v })}
              />
            </section>

            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Caratteristiche schermature solari</h4>
              <div className="grid gap-1">
                  <ToggleField label="Schermatura mobile a norma EN 13561 / EN 13659"
                    checked={data.caratteristiche_schermature.norma_en}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, norma_en: v })} />
                  <ToggleField label="Marchiatura CE"
                    checked={data.caratteristiche_schermature.marchiatura_ce}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, marchiatura_ce: v })} />
                  <ToggleField label="GTOT inferiore a 0,35"
                    checked={data.caratteristiche_schermature.gtot_inferiore}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, gtot_inferiore: v })} />
                  <ToggleField label="Esposizione EST-OVEST passando per il SUD"
                    checked={data.caratteristiche_schermature.esposizione}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, esposizione: v })} />
                  <ToggleField label="Protegge una superficie vetrata"
                    checked={data.caratteristiche_schermature.superficie_vetrata}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, superficie_vetrata: v })} />
                  <ToggleField label="Applicata in modo solidale all'edificio"
                    checked={data.caratteristiche_schermature.solidale_edificio}
                    onChange={(v) => update("caratteristiche_schermature", { ...data.caratteristiche_schermature, solidale_edificio: v })} />
              </div>
            </section>

            <section className="border rounded-lg p-3 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">Dichiarazioni aggiuntive</h4>
              <div className="grid gap-1">
                <ToggleField
                  label="L'importo in fattura rispetta i massimali ed è congruo e detraibile"
                  checked={data.importo_congruo}
                  onChange={(v) => update("importo_congruo", v)}
                />
                <ToggleField
                  label="I lavori sono stati regolarmente eseguiti ed ultimati"
                  checked={data.lavori_ultimati}
                  onChange={(v) => update("lavori_ultimati", v)}
                />
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={() => setTab("anteprima")}>
                Anteprima documento <Eye className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="anteprima" className="mt-4">
            <div className="printable-area border rounded-lg overflow-auto bg-muted/40">
              <DichiarazioneTecnicaTemplate data={data} />
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              ℹ️ Il documento verrà stampato nel formato A4 ottimizzato per la firma.
              Solo l'area documento sarà visibile nella stampa (header, sidebar e
              controlli verranno nascosti automaticamente).
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmAndSaveMut.isPending}>
            Chiudi
          </Button>
          {tab === "anteprima" && (
            <Button variant="outline" onClick={handlePrint} disabled={confirmAndSaveMut.isPending} className="gap-1.5">
              <Printer className="h-4 w-4" />Stampa
            </Button>
          )}
          <Button
            onClick={() => confirmAndSaveMut.mutate()}
            disabled={
              confirmAndSaveMut.isPending
              || !data.azienda_nome.trim()
              || !data.cliente_nome.trim()
            }
            className="gap-1.5"
            title="Conferma il documento e rendilo disponibile nella card pratica"
          >
            {confirmAndSaveMut.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Salvataggio…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" />Conferma e salva nella card</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-xs flex-1">{label}</span>
    </div>
  );
}
