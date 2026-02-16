import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle2, Search } from "lucide-react";

interface Riga {
  id?: string;
  codice: string;
  nome_prodotto: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  prezzo_netto: number;
  sconto_pct: number;
  aliquota_iva: number;
}

const emptyRiga: Riga = {
  codice: "", nome_prodotto: "", descrizione: "", quantita: 1,
  unita_misura: "", prezzo_netto: 0, sconto_pct: 0, aliquota_iva: 22,
};

function calcImportoRiga(r: Riga) {
  return r.quantita * r.prezzo_netto * (1 - r.sconto_pct / 100);
}

export default function FatturaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [clienteId, setClienteId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [numero, setNumero] = useState("");
  const [dataEmissione, setDataEmissione] = useState("");
  const [lingua, setLingua] = useState("it");
  const [valuta, setValuta] = useState("EUR");
  const [oggetto, setOggetto] = useState("");
  const [note, setNote] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [scadenzaPagamento, setScadenzaPagamento] = useState("");
  const [righe, setRighe] = useState<Riga[]>([{ ...emptyRiga }]);
  const [loaded, setLoaded] = useState(false);

  // Fetch fattura
  const { data: fattura } = useQuery({
    queryKey: ["fattura", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fatture").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch righe
  const { data: righeDb = [] } = useQuery({
    queryKey: ["fattura_righe", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fattura_righe" as any)
        .select("*")
        .eq("fattura_id", id!)
        .order("ordine");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  // Clienti
  const { data: clienti = [] } = useQuery({
    queryKey: ["clienti", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("clienti_finali")
        .select("id, nome, cognome, ragione_sociale, indirizzo, citta, cap, provincia, piva, codice_fiscale")
        .eq("company_id", companyId).order("cognome");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Populate form when data loads
  useEffect(() => {
    if (fattura && !loaded) {
      setClienteId(fattura.cliente_finale_id || "");
      setNumero(fattura.numero || "");
      setDataEmissione(fattura.data_emissione || "");
      setOggetto((fattura as any).oggetto || "");
      setNote(fattura.note || "");
      setMetodoPagamento((fattura as any).metodo_pagamento || "");
      setScadenzaPagamento((fattura as any).scadenza_pagamento || "");
      setLingua((fattura as any).lingua || "it");
      setValuta((fattura as any).valuta || "EUR");
      setLoaded(true);
    }
  }, [fattura, loaded]);

  useEffect(() => {
    if (righeDb.length > 0 && loaded) {
      setRighe(righeDb.map((r: any) => ({
        id: r.id,
        codice: r.codice || "",
        nome_prodotto: r.nome_prodotto || "",
        descrizione: r.descrizione || "",
        quantita: Number(r.quantita) || 1,
        unita_misura: r.unita_misura || "",
        prezzo_netto: Number(r.prezzo_netto) || 0,
        sconto_pct: Number(r.sconto_pct) || 0,
        aliquota_iva: Number(r.aliquota_iva) || 22,
      })));
    }
  }, [righeDb, loaded]);

  const selectedCliente = clienti.find(c => c.id === clienteId);
  const filteredClienti = clienti.filter(c => {
    if (!clienteSearch) return true;
    const s = clienteSearch.toLowerCase();
    return c.nome?.toLowerCase().includes(s) || c.cognome?.toLowerCase().includes(s) || c.ragione_sociale?.toLowerCase().includes(s) || c.piva?.toLowerCase().includes(s);
  });

  const { imponibile, ivaDetails, totale } = useMemo(() => {
    const byAliquota: Record<number, number> = {};
    let imp = 0;
    righe.forEach(r => {
      const importo = calcImportoRiga(r);
      imp += importo;
      byAliquota[r.aliquota_iva] = (byAliquota[r.aliquota_iva] || 0) + importo * (r.aliquota_iva / 100);
    });
    const totalIva = Object.values(byAliquota).reduce((s, v) => s + v, 0);
    return { imponibile: imp, ivaDetails: byAliquota, totale: imp + totalIva };
  }, [righe]);

  const updateRiga = (idx: number, field: keyof Riga, value: any) => {
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRiga = (idx: number) => {
    setRighe(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const saveFattura = useMutation({
    mutationFn: async (stato: "bozza" | "emessa" | "pagata") => {
      if (!companyId || !id) throw new Error("Dati mancanti");
      const totalIva = Object.values(ivaDetails).reduce((s, v) => s + v, 0);

      const { error } = await supabase.from("fatture").update({
        cliente_finale_id: clienteId || null,
        numero, data_emissione: dataEmissione,
        oggetto, note, metodo_pagamento: metodoPagamento,
        scadenza_pagamento: scadenzaPagamento || null,
        lingua, valuta,
        imponibile: parseFloat(imponibile.toFixed(2)),
        aliquota_iva: righe[0]?.aliquota_iva || 22,
        iva: parseFloat(totalIva.toFixed(2)),
        totale: parseFloat(totale.toFixed(2)),
        stato,
      } as any).eq("id", id);
      if (error) throw error;

      // Delete old righe and re-insert
      await supabase.from("fattura_righe" as any).delete().eq("fattura_id", id);
      if (righe.length > 0) {
        const righeData = righe.map((r, idx) => ({
          fattura_id: id, company_id: companyId,
          codice: r.codice, nome_prodotto: r.nome_prodotto, descrizione: r.descrizione,
          quantita: r.quantita, unita_misura: r.unita_misura, prezzo_netto: r.prezzo_netto,
          sconto_pct: r.sconto_pct, aliquota_iva: r.aliquota_iva,
          importo_totale: parseFloat(calcImportoRiga(r).toFixed(2)), ordine: idx,
        }));
        const { error: re } = await supabase.from("fattura_righe" as any).insert(righeData as any);
        if (re) throw re;
      }
    },
    onSuccess: (_, stato) => {
      queryClient.invalidateQueries({ queryKey: ["fatture"] });
      queryClient.invalidateQueries({ queryKey: ["fattura", id] });
      toast({ title: stato === "bozza" ? "Bozza salvata" : "Fattura aggiornata" });
      navigate("/fatturazione");
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (!fattura && !loaded) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fatturazione")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Fattura #{numero || "—"}</h1>
          <p className="text-muted-foreground">Modifica i dati della fattura</p>
        </div>
      </div>

      {/* 3-column layout - same as NuovaFattura */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca per nome o P.IVA..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="pl-9" />
            </div>
            {!clienteId ? (
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {filteredClienti.map(c => (
                  <button key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch(""); }}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors">
                    <div className="font-medium">{c.ragione_sociale || `${c.nome} ${c.cognome}`}</div>
                    {c.piva && <div className="text-xs text-muted-foreground">P.IVA: {c.piva}</div>}
                  </button>
                ))}
              </div>
            ) : selectedCliente ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{selectedCliente.ragione_sociale || `${selectedCliente.nome} ${selectedCliente.cognome}`}</span>
                  <Button variant="ghost" size="sm" onClick={() => setClienteId("")} className="h-7 text-xs">Cambia</Button>
                </div>
                {selectedCliente.indirizzo && <div className="text-muted-foreground">{selectedCliente.indirizzo}</div>}
                {(selectedCliente.cap || selectedCliente.citta || selectedCliente.provincia) && (
                  <div className="text-muted-foreground">{[selectedCliente.cap, selectedCliente.citta, selectedCliente.provincia].filter(Boolean).join(", ")}</div>
                )}
                {selectedCliente.piva && <div className="text-muted-foreground">P.IVA: {selectedCliente.piva}</div>}
                {selectedCliente.codice_fiscale && <div className="text-muted-foreground">CF: {selectedCliente.codice_fiscale}</div>}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dati Documento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Data Emissione</Label><Input type="date" value={dataEmissione} onChange={e => setDataEmissione(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Numero</Label><Input value={numero} onChange={e => setNumero(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Lingua</Label>
                <Select value={lingua} onValueChange={setLingua}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="it">Italiano</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Valuta</Label>
                <Select value={valuta} onValueChange={setValuta}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EUR">EUR (€)</SelectItem><SelectItem value="USD">USD ($)</SelectItem><SelectItem value="GBP">GBP (£)</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Oggetto</Label><Input value={oggetto} onChange={e => setOggetto(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Note interne</Label><Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Opzioni</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Metodo di Pagamento</Label>
              <Select value={metodoPagamento} onValueChange={setMetodoPagamento}><SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent><SelectItem value="bonifico">Bonifico Bancario</SelectItem><SelectItem value="contanti">Contanti</SelectItem><SelectItem value="carta">Carta di Credito</SelectItem><SelectItem value="assegno">Assegno</SelectItem><SelectItem value="ri.ba">Ri.Ba</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Scadenza Pagamento</Label><Input type="date" value={scadenzaPagamento} onChange={e => setScadenzaPagamento(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Lista Articoli */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Lista Articoli</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setRighe(prev => [...prev, { ...emptyRiga }])}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Aggiungi voce
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Codice</TableHead>
                  <TableHead>Prodotto/Servizio</TableHead>
                  <TableHead className="w-[70px]">Qtà</TableHead>
                  <TableHead className="w-[70px]">U.M.</TableHead>
                  <TableHead className="w-[100px]">Prezzo</TableHead>
                  <TableHead className="w-[70px]">Sc. %</TableHead>
                  <TableHead className="w-[70px]">IVA %</TableHead>
                  <TableHead className="w-[100px] text-right">Importo</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Input value={r.codice} onChange={e => updateRiga(idx, "codice", e.target.value)} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input value={r.nome_prodotto} onChange={e => updateRiga(idx, "nome_prodotto", e.target.value)} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={r.quantita} onChange={e => updateRiga(idx, "quantita", parseFloat(e.target.value) || 0)} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input value={r.unita_misura} onChange={e => updateRiga(idx, "unita_misura", e.target.value)} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={r.prezzo_netto} onChange={e => updateRiga(idx, "prezzo_netto", parseFloat(e.target.value) || 0)} className="h-8 text-xs" step={0.01} /></TableCell>
                    <TableCell><Input type="number" value={r.sconto_pct} onChange={e => updateRiga(idx, "sconto_pct", parseFloat(e.target.value) || 0)} className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={r.aliquota_iva} onChange={e => updateRiga(idx, "aliquota_iva", parseFloat(e.target.value) || 0)} className="h-8 text-xs" /></TableCell>
                    <TableCell className="text-right font-medium text-sm">€ {calcImportoRiga(r).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRiga(idx)} disabled={righe.length === 1}><Trash2 className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Riepilogo */}
      <div className="flex flex-col lg:flex-row gap-6 items-start justify-end">
        <Card className="w-full lg:w-[360px]">
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Imponibile</span><span className="font-medium">€ {imponibile.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
            {Object.entries(ivaDetails).map(([aliquota, importo]) => (
              <div key={aliquota} className="flex justify-between text-sm"><span className="text-muted-foreground">IVA {aliquota}%</span><span>€ {(importo as number).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
            ))}
            <Separator />
            <div className="flex justify-between text-lg font-bold"><span>Totale</span><span>€ {totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => saveFattura.mutate("bozza")} disabled={saveFattura.isPending}>
                <Save className="mr-2 h-4 w-4" /> Salva
              </Button>
              <Button className="flex-1" onClick={() => saveFattura.mutate(fattura?.stato === "pagata" ? "pagata" : "emessa")} disabled={saveFattura.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Finalizza
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
