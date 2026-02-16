import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle2, Search, UserPlus, ChevronUp, ChevronDown } from "lucide-react";
import NuovoClienteDialog from "@/components/NuovoClienteDialog";

interface Riga {
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
  codice: "",
  nome_prodotto: "",
  descrizione: "",
  quantita: 1,
  unita_misura: "",
  prezzo_netto: 0,
  sconto_pct: 0,
  aliquota_iva: 22,
};

function calcImportoRiga(r: Riga) {
  const scontato = r.prezzo_netto * (1 - r.sconto_pct / 100);
  return r.quantita * scontato;
}

export default function NuovaFattura() {
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Client
  const [clienteId, setClienteId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);

  // Dati documento
  const [numero, setNumero] = useState("");
  const [dataEmissione, setDataEmissione] = useState(new Date().toISOString().split("T")[0]);
  const [numerazione, setNumerazione] = useState("principale");
  const [lingua, setLingua] = useState("it");
  const [valuta, setValuta] = useState("EUR");
  const [oggetto, setOggetto] = useState("");
  const [oggettoInterno, setOggettoInterno] = useState("");
  const [centroRicavo, setCentroRicavo] = useState("");
  const [note, setNote] = useState("");

  // Fatturazione elettronica
  const [pubblicaAmministrazione, setPubblicaAmministrazione] = useState(false);
  const [codiceDestinatario, setCodiceDestinatario] = useState("");
  const [indirizzoPec, setIndirizzoPec] = useState("");
  const [esigibilitaIva, setEsigibilitaIva] = useState("non_specificata");
  const [emessoInSeguitoA, setEmessoInSeguitoA] = useState("non_specificato");

  // Opzioni pagamento
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [scadenzaPagamento, setScadenzaPagamento] = useState("");
  const [nomeIstitutoCredito, setNomeIstitutoCredito] = useState("");
  const [iban, setIban] = useState("");
  const [nomeBeneficiario, setNomeBeneficiario] = useState("");
  const [mostraDettagliPagamento, setMostraDettagliPagamento] = useState(false);
  const [mostraScadenze, setMostraScadenze] = useState(false);

  // Opzioni avanzate
  const [documentoTrasporto, setDocumentoTrasporto] = useState(false);
  const [fattAccompagnatoria, setFattAccompagnatoria] = useState(false);
  const [marcaBollo, setMarcaBollo] = useState(false);
  const [scontoMaggiorazioneTotale, setScontoMaggiorazioneTotale] = useState(false);

  // Contributi e ritenute
  const [cassaProfessionisti, setCassaProfessionisti] = useState(false);
  const [rivalsa, setRivalsa] = useState(true);
  const [rivalsaPct, setRivalsaPct] = useState(4);
  const [rivalsaBasePct, setRivalsaBasePct] = useState(100);
  const [ritenutaAcconto, setRitenutaAcconto] = useState(false);
  const [altraRitenuta, setAltraRitenuta] = useState(false);

  // Collapsible sections
  const [openCliente, setOpenCliente] = useState(true);
  const [openDatiDocumento, setOpenDatiDocumento] = useState(true);
  const [openOpzioni, setOpenOpzioni] = useState(true);
  const [openFattElettronica, setOpenFattElettronica] = useState(false);
  const [openContributi, setOpenContributi] = useState(false);
  const [openOpzioniAvanzate, setOpenOpzioniAvanzate] = useState(false);

  // Righe
  const [righe, setRighe] = useState<Riga[]>([{ ...emptyRiga }]);

  // Clienti query
  const { data: clienti = [] } = useQuery({
    queryKey: ["clienti", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("clienti_finali")
        .select("id, nome, cognome, ragione_sociale, indirizzo, citta, cap, provincia, piva, codice_fiscale, pec, email, codice_destinatario_sdi")
        .eq("company_id", companyId)
        .order("cognome");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredClienti = clienti.filter(c => {
    if (!clienteSearch) return true;
    const s = clienteSearch.toLowerCase();
    return (
      c.nome?.toLowerCase().includes(s) ||
      c.cognome?.toLowerCase().includes(s) ||
      c.ragione_sociale?.toLowerCase().includes(s) ||
      c.piva?.toLowerCase().includes(s)
    );
  });

  const selectedCliente = clienti.find(c => c.id === clienteId);

  // Auto-fill e-invoice fields from selected client
  const handleSelectCliente = (id: string) => {
    setClienteId(id);
    setClienteSearch("");
    const cl = clienti.find(c => c.id === id);
    if (cl) {
      if (cl.codice_destinatario_sdi) setCodiceDestinatario(cl.codice_destinatario_sdi);
      if (cl.pec) setIndirizzoPec(cl.pec);
    }
  };

  // Calculations
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
    mutationFn: async (stato: "bozza" | "emessa") => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!numero) throw new Error("Inserisci il numero fattura");

      const totalIva = Object.values(ivaDetails).reduce((s, v) => s + v, 0);

      const { data: fattura, error } = await supabase
        .from("fatture")
        .insert({
          company_id: companyId,
          cliente_finale_id: clienteId || null,
          numero,
          data_emissione: dataEmissione,
          oggetto,
          note,
          metodo_pagamento: metodoPagamento,
          scadenza_pagamento: scadenzaPagamento || null,
          lingua,
          valuta,
          imponibile: parseFloat(imponibile.toFixed(2)),
          aliquota_iva: righe[0]?.aliquota_iva || 22,
          iva: parseFloat(totalIva.toFixed(2)),
          totale: parseFloat(totale.toFixed(2)),
          stato,
          oggetto_interno: oggettoInterno,
          numerazione,
          centro_ricavo: centroRicavo,
          pubblica_amministrazione: pubblicaAmministrazione,
          codice_destinatario: codiceDestinatario,
          indirizzo_pec: indirizzoPec,
          esigibilita_iva: esigibilitaIva,
          emesso_in_seguito_a: emessoInSeguitoA,
          nome_istituto_credito: nomeIstitutoCredito,
          iban,
          nome_beneficiario: nomeBeneficiario,
          documento_trasporto: documentoTrasporto,
          fatt_accompagnatoria: fattAccompagnatoria,
          marca_bollo: marcaBollo,
          sconto_maggiorazione_totale: scontoMaggiorazioneTotale,
          cassa_professionisti: cassaProfessionisti,
          rivalsa,
          rivalsa_pct: rivalsaPct,
          rivalsa_base_pct: rivalsaBasePct,
          ritenuta_acconto: ritenutaAcconto,
          altra_ritenuta: altraRitenuta,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      if (fattura && righe.length > 0) {
        const righeData = righe.map((r, idx) => ({
          fattura_id: fattura.id,
          company_id: companyId,
          codice: r.codice,
          nome_prodotto: r.nome_prodotto,
          descrizione: r.descrizione,
          quantita: r.quantita,
          unita_misura: r.unita_misura,
          prezzo_netto: r.prezzo_netto,
          sconto_pct: r.sconto_pct,
          aliquota_iva: r.aliquota_iva,
          importo_totale: parseFloat(calcImportoRiga(r).toFixed(2)),
          ordine: idx,
        }));
        const { error: righeError } = await supabase
          .from("fattura_righe" as any)
          .insert(righeData as any);
        if (righeError) throw righeError;
      }
      return fattura;
    },
    onSuccess: (_, stato) => {
      queryClient.invalidateQueries({ queryKey: ["fatture"] });
      toast({ title: stato === "bozza" ? "Bozza salvata" : "Fattura finalizzata" });
      navigate("/fatturazione");
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fatturazione")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Fattura</h1>
          <p className="text-muted-foreground">Compila i dati per creare una nuova fattura</p>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Cliente */}
        <Collapsible open={openCliente} onOpenChange={setOpenCliente}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between">
                <CardTitle className="text-base">Cliente</CardTitle>
                {openCliente ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca per nome o P.IVA..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="pl-9" />
            </div>
            {!clienteId ? (
              <div className="space-y-1">
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {filteredClienti.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCliente(c.id)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                    >
                      <div className="font-medium">{c.ragione_sociale || `${c.nome} ${c.cognome}`}</div>
                      {c.piva && <div className="text-xs text-muted-foreground">P.IVA: {c.piva}</div>}
                    </button>
                  ))}
                  {filteredClienti.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nessun cliente trovato</p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowNewClientDialog(true)}>
                  <UserPlus className="mr-2 h-3.5 w-3.5" /> Crea nuovo cliente
                </Button>
              </div>
            ) : selectedCliente ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{selectedCliente.ragione_sociale || `${selectedCliente.nome} ${selectedCliente.cognome}`}</span>
                  <Button variant="ghost" size="sm" onClick={() => setClienteId("")} className="h-7 text-xs">Cambia</Button>
                </div>
                {selectedCliente.indirizzo && <div className="text-muted-foreground">{selectedCliente.indirizzo}</div>}
                {(selectedCliente.cap || selectedCliente.citta || selectedCliente.provincia) && (
                  <div className="text-muted-foreground">
                    {[selectedCliente.cap, selectedCliente.citta, selectedCliente.provincia].filter(Boolean).join(", ")}
                  </div>
                )}
                {selectedCliente.piva && <div className="text-muted-foreground">P.IVA: {selectedCliente.piva}</div>}
                {selectedCliente.codice_fiscale && <div className="text-muted-foreground">CF: {selectedCliente.codice_fiscale}</div>}
                {selectedCliente.pec && <div className="text-muted-foreground">PEC: {selectedCliente.pec}</div>}
              </div>
            ) : null}
          </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Center: Dati Documento */}
        <Collapsible open={openDatiDocumento} onOpenChange={setOpenDatiDocumento}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between">
                <CardTitle className="text-base">Dati Documento</CardTitle>
                {openDatiDocumento ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Emissione</Label>
                <Input type="date" value={dataEmissione} onChange={e => setDataEmissione(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Numero</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="FT-001" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Numerazione</Label>
                <Select value={numerazione} onValueChange={setNumerazione}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principale">Principale</SelectItem>
                    <SelectItem value="secondaria">Secondaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lingua</Label>
                <Select value={lingua} onValueChange={setLingua}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valuta</Label>
                <Select value={valuta} onValueChange={setValuta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Oggetto (visibile)</Label>
              <Input value={oggetto} onChange={e => setOggetto(e.target.value)} placeholder="Oggetto della fattura" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Oggetto interno (non visibile)</Label>
              <Input value={oggettoInterno} onChange={e => setOggettoInterno(e.target.value)} placeholder="Note interne sull'oggetto" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Centro di ricavo</Label>
              <Input value={centroRicavo} onChange={e => setCentroRicavo(e.target.value)} placeholder="Centro di ricavo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note interne</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note visibili solo internamente" />
            </div>
          </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Right: Opzioni */}
        <Collapsible open={openOpzioni} onOpenChange={setOpenOpzioni}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between">
                <CardTitle className="text-base">Opzioni</CardTitle>
                {openOpzioni ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Metodo di Pagamento</Label>
              <Select value={metodoPagamento} onValueChange={setMetodoPagamento}>
                <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_specificato">Non specificato</SelectItem>
                  <SelectItem value="contanti">Contanti</SelectItem>
                  <SelectItem value="bonifico">Bonifico Bancario</SelectItem>
                  <SelectItem value="carta">Carta di Credito</SelectItem>
                  <SelectItem value="assegno">Assegno</SelectItem>
                  <SelectItem value="ri.ba">Ri.Ba</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scadenza Pagamento</Label>
              <Input type="date" value={scadenzaPagamento} onChange={e => setScadenzaPagamento(e.target.value)} />
            </div>

            <Separator />

            <Collapsible open={openOpzioniAvanzate} onOpenChange={setOpenOpzioniAvanzate}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer py-1">
                  <Label className="text-xs font-semibold cursor-pointer">Opzioni avanzate</Label>
                  {openOpzioniAvanzate ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={mostraDettagliPagamento} onCheckedChange={(v) => setMostraDettagliPagamento(!!v)} />
                    <Label className="text-xs">Mostra dettagli di pagamento</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={mostraScadenze} onCheckedChange={(v) => setMostraScadenze(!!v)} />
                    <Label className="text-xs">Mostra scadenze</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={documentoTrasporto} onCheckedChange={(v) => setDocumentoTrasporto(!!v)} />
                    <Label className="text-xs">Documento di trasporto</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={fattAccompagnatoria} onCheckedChange={(v) => setFattAccompagnatoria(!!v)} />
                    <Label className="text-xs">Fatt. accompagnatoria</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={marcaBollo} onCheckedChange={(v) => setMarcaBollo(!!v)} />
                    <Label className="text-xs">Includi marca da bollo a tuo carico</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={scontoMaggiorazioneTotale} onCheckedChange={(v) => setScontoMaggiorazioneTotale(!!v)} />
                    <Label className="text-xs">Applica sconto/maggiorazione sul totale</Label>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      {/* Fatturazione Elettronica + Contributi e Ritenute */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Collapsible open={openFattElettronica} onOpenChange={setOpenFattElettronica}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between">
                <CardTitle className="text-base">Fatturazione Elettronica</CardTitle>
                {openFattElettronica ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={pubblicaAmministrazione} onCheckedChange={(v) => setPubblicaAmministrazione(!!v)} />
                  <Label className="text-xs">Pubblica Amministrazione</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Codice destinatario</Label>
                    <Input value={codiceDestinatario} onChange={e => setCodiceDestinatario(e.target.value)} placeholder="0000000" maxLength={7} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Indirizzo PEC</Label>
                    <Input type="email" value={indirizzoPec} onChange={e => setIndirizzoPec(e.target.value)} placeholder="pec@esempio.it" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Esigibilità IVA</Label>
                    <Select value={esigibilitaIva} onValueChange={setEsigibilitaIva}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non_specificata">Non specificata</SelectItem>
                        <SelectItem value="immediata">Immediata</SelectItem>
                        <SelectItem value="differita">Differita</SelectItem>
                        <SelectItem value="split_payment">Split payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Emesso in seguito a</Label>
                    <Select value={emessoInSeguitoA} onValueChange={setEmessoInSeguitoA}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non_specificato">Non specificato</SelectItem>
                        <SelectItem value="contratto">Contratto</SelectItem>
                        <SelectItem value="convenzione">Convenzione</SelectItem>
                        <SelectItem value="ordine_acquisto">Ordine di acquisto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome istituto di credito</Label>
                    <Input value={nomeIstitutoCredito} onChange={e => setNomeIstitutoCredito(e.target.value)} placeholder="Nome banca" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input value={iban} onChange={e => setIban(e.target.value)} placeholder="IT00A0000000000000000000000" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome beneficiario</Label>
                  <Input value={nomeBeneficiario} onChange={e => setNomeBeneficiario(e.target.value)} placeholder="Nome completo beneficiario" />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible open={openContributi} onOpenChange={setOpenContributi}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between">
                <CardTitle className="text-base">Contributi e Ritenute</CardTitle>
                {openContributi ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={cassaProfessionisti} onCheckedChange={(v) => setCassaProfessionisti(!!v)} />
                  <Label className="text-xs">Cassa professionisti</Label>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={rivalsa} onCheckedChange={(v) => setRivalsa(!!v)} />
                    <Label className="text-xs">Rivalsa</Label>
                  </div>
                  {rivalsa && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Percentuale (%)</Label>
                        <Input type="number" value={rivalsaPct} onChange={e => setRivalsaPct(parseFloat(e.target.value) || 0)} min={0} step={0.5} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Su base (%)</Label>
                        <Input type="number" value={rivalsaBasePct} onChange={e => setRivalsaBasePct(parseFloat(e.target.value) || 0)} min={0} max={100} className="h-8 text-xs" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={ritenutaAcconto} onCheckedChange={(v) => setRitenutaAcconto(!!v)} />
                  <Label className="text-xs">Ritenuta d'acconto</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={altraRitenuta} onCheckedChange={(v) => setAltraRitenuta(!!v)} />
                  <Label className="text-xs">Altra ritenuta</Label>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
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
                    <TableCell><Input value={r.nome_prodotto} onChange={e => updateRiga(idx, "nome_prodotto", e.target.value)} placeholder="Nome prodotto" className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={r.quantita} onChange={e => updateRiga(idx, "quantita", parseFloat(e.target.value) || 0)} className="h-8 text-xs" min={0} step={1} /></TableCell>
                    <TableCell><Input value={r.unita_misura} onChange={e => updateRiga(idx, "unita_misura", e.target.value)} placeholder="pz" className="h-8 text-xs" /></TableCell>
                    <TableCell><Input type="number" value={r.prezzo_netto} onChange={e => updateRiga(idx, "prezzo_netto", parseFloat(e.target.value) || 0)} className="h-8 text-xs" min={0} step={0.01} /></TableCell>
                    <TableCell><Input type="number" value={r.sconto_pct} onChange={e => updateRiga(idx, "sconto_pct", parseFloat(e.target.value) || 0)} className="h-8 text-xs" min={0} max={100} /></TableCell>
                    <TableCell><Input type="number" value={r.aliquota_iva} onChange={e => updateRiga(idx, "aliquota_iva", parseFloat(e.target.value) || 0)} className="h-8 text-xs" min={0} /></TableCell>
                    <TableCell className="text-right font-medium text-sm">€ {calcImportoRiga(r).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRiga(idx)} disabled={righe.length === 1}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Riepilogo + Azioni */}
      <div className="flex flex-col lg:flex-row gap-6 items-start justify-end">
        <Card className="w-full lg:w-[360px]">
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Imponibile</span>
              <span className="font-medium">€ {imponibile.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
            </div>
            {Object.entries(ivaDetails).map(([aliquota, importo]) => (
              <div key={aliquota} className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA {aliquota}%</span>
                <span>€ {(importo as number).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Totale</span>
              <span>€ {totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => saveFattura.mutate("bozza")} disabled={saveFattura.isPending}>
                <Save className="mr-2 h-4 w-4" /> Bozza
              </Button>
              <Button className="flex-1" onClick={() => saveFattura.mutate("emessa")} disabled={saveFattura.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Finalizza
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog creazione cliente inline */}
      <NuovoClienteDialog
        open={showNewClientDialog}
        onOpenChange={setShowNewClientDialog}
        onClientCreated={(newClientId) => {
          handleSelectCliente(newClientId);
          setShowNewClientDialog(false);
        }}
      />
    </div>
  );
}
