import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, Search, Mail, Phone, Building2, User } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import NuovoClienteDialog from "@/components/NuovoClienteDialog";
import type { Tables } from "@/integrations/supabase/types";

export default function Clienti() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Tables<"clienti_finali"> | null>(null);

  const { data: clienti = [], isLoading } = useQuery({
    queryKey: ["clienti", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("clienti_finali")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filtered = clienti.filter((c) =>
    `${c.ragione_sociale ?? ""} ${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.piva ?? ""} ${c.codice_fiscale ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenNew = () => {
    setEditingClient(null);
    setOpen(true);
  };

  const handleRowClick = (client: Tables<"clienti_finali">) => {
    setEditingClient(client);
    setOpen(true);
  };

  const handleDialogClose = () => {
    setOpen(false);
    setEditingClient(null);
  };

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
        <p className="text-sm text-muted-foreground">Contatta l'amministratore per essere assegnato a un'azienda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Clienti</h1>
          <p className="text-muted-foreground">Gestisci i tuoi clienti finali</p>
        </div>
        <Button onClick={handleOpenNew}><Plus className="mr-2 h-4 w-4" />Nuovo Cliente</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cerca clienti..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-display text-lg font-semibold">Nessun cliente</h3>
            <p className="text-sm text-muted-foreground">Aggiungi il tuo primo cliente per iniziare.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Denominazione</TableHead>
                  <TableHead>P.IVA / CF</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Creato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(c)}>
                    <TableCell className="font-medium">{c.ragione_sociale || `${c.nome} ${c.cognome}`}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.piva && <div>{c.piva}</div>}
                      {c.codice_fiscale && <div>{c.codice_fiscale}</div>}
                      {!c.piva && !c.codice_fiscale && "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                        {c.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefono}</span>}
                        {c.pec && <span className="flex items-center gap-1 text-muted-foreground">PEC: {c.pec}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.citta || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.tipo === "azienda" ? "default" : "secondary"} className="text-xs">
                        {c.tipo === "azienda" ? <><Building2 className="mr-1 h-3 w-3" />Azienda</> : <><User className="mr-1 h-3 w-3" />Persona</>}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString("it-IT")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {clienti.length >= 500 && (
            <p className="text-center text-xs text-muted-foreground">Mostrati i primi 500 clienti. Usa la ricerca per trovare quelli non visibili.</p>
          )}
        </>
      )}

      <NuovoClienteDialog
        open={open}
        onOpenChange={handleDialogClose}
        clienteData={editingClient}
        onClientCreated={() => handleDialogClose()}
      />
    </div>
  );
}
