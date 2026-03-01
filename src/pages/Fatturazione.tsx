import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, CreditCard, Receipt, Trash2, Edit, Download, CheckCircle2, Clock, Search, AlertTriangle } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { format, differenceInDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const STATO_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  bozza: { label: "Bozza", className: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  emessa: { label: "Emessa", className: "bg-primary/10 text-primary", icon: <FileText className="h-3 w-3" /> },
  pagata: { label: "Pagata", className: "bg-success/10 text-success", icon: <CheckCircle2 className="h-3 w-3" /> },
};

function DeleteConfirmButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
          <AlertDialogDescription>
            Sei sicuro di voler eliminare {label}? Questa azione non può essere annullata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Fatturazione() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [filterStato, setFilterStato] = useState("tutti");
  const [searchQuery, setSearchQuery] = useState("");

  // ========== FATTURE ==========
  const { data: fatture = [] } = useQuery({
    queryKey: ["fatture", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("fatture")
        .select("*, clienti_finali(nome, cognome, ragione_sociale)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // ========== NOTE CREDITO ==========
  const { data: notecredito = [] } = useQuery({
    queryKey: ["note_credito", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("note_credito")
        .select("*, fatture(numero)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // ========== PROFORMA ==========
  const { data: proformaList = [] } = useQuery({
    queryKey: ["proforma", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("proforma")
        .select("*, clienti_finali(nome, cognome, ragione_sociale)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Monthly summary
  const monthlyStats = useMemo(() => {
    return MESI.map((_, idx) => {
      const monthFatture = fatture.filter(f => {
        const d = parseISO(f.data_emissione);
        return d.getFullYear() === selectedYear && d.getMonth() === idx;
      });
      return {
        count: monthFatture.length,
        total: monthFatture.reduce((sum, f) => sum + Number(f.totale), 0),
      };
    });
  }, [fatture, selectedYear]);

  // Filtered fatture
  const filteredFatture = useMemo(() => {
    return fatture.filter(f => {
      const d = parseISO(f.data_emissione);
      const matchMonth = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      const matchStato = filterStato === "tutti" || f.stato === filterStato;
      const clientName = f.clienti_finali
        ? `${(f.clienti_finali as any).ragione_sociale || ""} ${(f.clienti_finali as any).nome} ${(f.clienti_finali as any).cognome}`.toLowerCase()
        : "";
      const matchSearch = !searchQuery ||
        f.numero?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clientName.includes(searchQuery.toLowerCase()) ||
        (f as any).oggetto?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMonth && matchStato && matchSearch;
    });
  }, [fatture, selectedMonth, selectedYear, filterStato, searchQuery]);

  const totaleTotale = filteredFatture.reduce((s, f) => s + Number(f.totale), 0);

  const deleteFattura = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fatture").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture"] });
      toast({ title: "Fattura eliminata" });
    },
  });

  const updateStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase.from("fatture").update({ stato } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture"] });
      toast({ title: "Stato aggiornato" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Fatturazione</h1>
        <p className="text-muted-foreground">Gestisci fatture, note di credito e proforma</p>
      </div>

      {/* Monthly summary bar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {MESI.map((mese, idx) => {
              const stat = monthlyStats[idx];
              const isActive = idx === selectedMonth;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedMonth(idx)}
                  className={`flex flex-col items-center rounded-lg px-3 py-2 text-xs transition-colors min-w-[60px] ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <span className="font-semibold">{mese}</span>
                  <span className={`text-[10px] mt-0.5 ${isActive ? "text-primary-foreground/80" : ""}`}>
                    {stat.count > 0 ? `${stat.count} doc` : "—"}
                  </span>
                  {stat.total > 0 && (
                    <span className={`text-[10px] font-medium ${isActive ? "text-primary-foreground/90" : ""}`}>
                      €{stat.total.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="fatture">
        <TabsList>
          <TabsTrigger value="fatture" className="gap-2">
            <FileText className="h-4 w-4" /> Fatture
            <Badge variant="secondary" className="ml-1">{fatture.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="note" className="gap-2">
            <CreditCard className="h-4 w-4" /> Note di Credito
            <Badge variant="secondary" className="ml-1">{notecredito.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="proforma" className="gap-2">
            <Receipt className="h-4 w-4" /> Proforma
            <Badge variant="secondary" className="ml-1">{proformaList.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fatture">
          <Card>
            <CardContent className="pt-6">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <Select value={filterStato} onValueChange={setFilterStato}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Stato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutti">Tutti gli stati</SelectItem>
                    <SelectItem value="bozza">Bozza</SelectItem>
                    <SelectItem value="emessa">Emessa</SelectItem>
                    <SelectItem value="pagata">Pagata</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca per numero, cliente, oggetto..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredFatture.map(f => ({
                    numero: f.numero,
                    cliente: f.clienti_finali ? ((f.clienti_finali as any).ragione_sociale || `${(f.clienti_finali as any).nome} ${(f.clienti_finali as any).cognome}`) : "",
                    oggetto: (f as any).oggetto || "",
                    totale: Number(f.totale).toFixed(2),
                    stato: f.stato,
                    data: f.data_emissione,
                  })), "fatture-export", [
                    { key: "numero", label: "Numero" },
                    { key: "cliente", label: "Cliente" },
                    { key: "oggetto", label: "Oggetto" },
                    { key: "totale", label: "Totale" },
                    { key: "stato", label: "Stato" },
                    { key: "data", label: "Data" },
                  ])}>
                    <Download className="mr-2 h-4 w-4" />CSV
                  </Button>
                  <Button onClick={() => navigate("/fatturazione/nuova")}>
                    <Plus className="mr-2 h-4 w-4" /> Nuova Fattura
                  </Button>
                </div>
              </div>

              {/* Table */}
              {filteredFatture.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Nessuna fattura per {MESI[selectedMonth]} {selectedYear}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Stato</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Oggetto</TableHead>
                      <TableHead>Data e Numero</TableHead>
                      <TableHead>Prox. Scadenza</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead className="w-[120px]">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFatture.map(f => {
                      const cfg = STATO_CONFIG[f.stato] || STATO_CONFIG.bozza;
                      const clientName = f.clienti_finali
                        ? (f.clienti_finali as any).ragione_sociale || `${(f.clienti_finali as any).nome} ${(f.clienti_finali as any).cognome}`
                        : "—";
                      const scadenza = (f as any).scadenza_pagamento;
                      let scadenzaLabel = "—";
                      let scadenzaAlert = false;
                      if (scadenza) {
                        const scadDate = parseISO(scadenza);
                        const diff = differenceInDays(new Date(), scadDate);
                        if (diff > 0 && f.stato !== "pagata") {
                          scadenzaLabel = `Scaduta da ${diff}g`;
                          scadenzaAlert = true;
                        } else {
                          scadenzaLabel = format(scadDate, "dd/MM/yyyy");
                        }
                      }

                      return (
                        <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/fatturazione/${f.id}`)}>
                          <TableCell>
                            <Badge className={`${cfg.className} gap-1`}>
                              {cfg.icon} {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{clientName}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {(f as any).oggetto || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{format(parseISO(f.data_emissione), "dd MMM yyyy", { locale: it })}</div>
                            <div className="text-xs text-primary font-medium">#{f.numero || "—"}</div>
                          </TableCell>
                          <TableCell>
                            {scadenzaAlert ? (
                              <span className="flex items-center gap-1 text-destructive text-sm font-medium">
                                <AlertTriangle className="h-3.5 w-3.5" /> {scadenzaLabel}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">{scadenzaLabel}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            € {Number(f.totale).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/fatturazione/${f.id}`)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <DeleteConfirmButton label="questa fattura" onConfirm={() => deleteFattura.mutate(f.id)} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-medium">
                        {filteredFatture.length} document{filteredFatture.length !== 1 ? "i" : "o"}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        € {totaleTotale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="note">
          <NoteCreditoTab notecredito={notecredito} fatture={fatture} companyId={companyId} />
        </TabsContent>

        <TabsContent value="proforma">
          <ProformaTab proformaList={proformaList} companyId={companyId} navigate={navigate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================== NOTE CREDITO ===================
function NoteCreditoTab({ notecredito, fatture, companyId }: { notecredito: any[]; fatture: any[]; companyId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteNota = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("note_credito").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note_credito"] });
      toast({ title: "Nota di credito eliminata" });
    },
  });

  return (
    <Card>
      <CardContent className="pt-6">
        {notecredito.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nessuna nota di credito</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Fattura Rif.</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Causale</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notecredito.map(nc => (
                <TableRow key={nc.id}>
                  <TableCell className="font-medium">{nc.numero || "—"}</TableCell>
                  <TableCell>{nc.fatture ? (nc.fatture as any).numero || "—" : "—"}</TableCell>
                  <TableCell>{format(parseISO(nc.data_emissione), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-right font-semibold">€ {Number(nc.importo).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{nc.causale || "—"}</TableCell>
                  <TableCell>
                    <DeleteConfirmButton label="questa nota di credito" onConfirm={() => deleteNota.mutate(nc.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// =================== PROFORMA ===================
function ProformaTab({ proformaList, companyId, navigate }: { proformaList: any[]; companyId: string | null; navigate: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteProforma = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proforma").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proforma"] });
      toast({ title: "Proforma eliminata" });
    },
  });

  return (
    <Card>
      <CardContent className="pt-6">
        {proformaList.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nessun proforma</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proformaList.map(p => {
                const clientName = p.clienti_finali
                  ? (p.clienti_finali as any).ragione_sociale || `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome}`
                  : "—";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.numero || "—"}</TableCell>
                    <TableCell>{clientName}</TableCell>
                    <TableCell>{format(parseISO(p.data_emissione), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{p.scadenza ? format(parseISO(p.scadenza), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">€ {Number(p.importo).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <DeleteConfirmButton label="questo proforma" onConfirm={() => deleteProforma.mutate(p.id)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
