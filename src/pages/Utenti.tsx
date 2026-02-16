import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, UserPlus, X, Building2, Plus } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin_interno: "Admin Interno",
  operatore: "Operatore",
  azienda_admin: "Azienda Admin",
  azienda_user: "Azienda User",
  partner: "Partner",
};

const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-destructive/10 text-destructive",
  admin_interno: "bg-primary/10 text-primary",
  operatore: "bg-warning/10 text-warning",
  azienda_admin: "bg-success/10 text-success",
  azienda_user: "bg-muted text-muted-foreground",
  partner: "bg-accent text-accent-foreground",
};

export default function Utenti() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole | "">("");
  const [assignCompanyUser, setAssignCompanyUser] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  
  // New user dialog state
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ nome: "", cognome: "", email: "", password: "", role: "" as AppRole | "" });

  // Fetch all profiles (internal users can see all)
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("cognome");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all roles
  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all assignments
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["admin-all-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_company_assignments").select("*, companies(ragione_sociale)");
      if (error) throw error;
      return data;
    },
  });

  // Companies for assignment
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-list"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale").order("ragione_sociale");
      return data || [];
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-roles"] });
      setNewRole("");
      toast({ title: "Ruolo aggiunto" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-roles"] });
      toast({ title: "Ruolo rimosso" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const assignCompany = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId: string }) => {
      const { error } = await supabase.from("user_company_assignments").insert({ user_id: userId, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-assignments"] });
      setAssignCompanyUser(null);
      setSelectedCompany("");
      toast({ title: "Azienda assegnata" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("user_company_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-assignments"] });
      toast({ title: "Assegnazione rimossa" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // Create user mutation via edge function
  const createUser = useMutation({
    mutationFn: async (form: typeof newUserForm) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non autenticato");

      const response = await supabase.functions.invoke("create-user", {
        body: {
          email: form.email,
          password: form.password,
          nome: form.nome,
          cognome: form.cognome,
          role: form.role,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-roles"] });
      setShowNewUser(false);
      setNewUserForm({ nome: "", cognome: "", email: "", password: "", role: "" });
      toast({ title: "Utente creato con successo" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const filtered = profiles.filter(p =>
    `${p.nome} ${p.cognome} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const getUserRoles = (userId: string) => allRoles.filter(r => r.user_id === userId);
  const getUserAssignments = (userId: string) => allAssignments.filter(a => a.user_id === userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Utenti & Ruoli</h1>
          <p className="text-muted-foreground">Gestisci utenti, ruoli e assegnazioni aziendali</p>
        </div>
        <Button onClick={() => setShowNewUser(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Nuovo Utente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cerca utenti..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(profile => {
            const roles = getUserRoles(profile.id);
            const assignments = getUserAssignments(profile.id);
            const isExpanded = selectedUser === profile.id;

            return (
              <Card key={profile.id} className={isExpanded ? "ring-2 ring-primary" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 cursor-pointer" onClick={() => setSelectedUser(isExpanded ? null : profile.id)}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {profile.nome?.[0]}{profile.cognome?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{profile.nome} {profile.cognome}</p>
                      <p className="text-sm text-muted-foreground">{profile.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {roles.map(r => (
                        <Badge key={r.id} className={`text-xs ${ROLE_COLORS[r.role]}`}>
                          {ROLE_LABELS[r.role]}
                        </Badge>
                      ))}
                      {roles.length === 0 && <Badge variant="outline" className="text-xs">Nessun ruolo</Badge>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {/* Roles management */}
                      <div>
                        <Label className="text-sm font-medium">Ruoli</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {roles.map(r => (
                            <Badge key={r.id} className={`${ROLE_COLORS[r.role]} gap-1`}>
                              {ROLE_LABELS[r.role]}
                              <button onClick={() => removeRole.mutate(r.id)} className="ml-1 hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Select value={newRole} onValueChange={v => setNewRole(v as AppRole)}>
                            <SelectTrigger className="w-48"><SelectValue placeholder="Aggiungi ruolo..." /></SelectTrigger>
                            <SelectContent>
                              {Constants.public.Enums.app_role
                                .filter(r => !roles.some(ur => ur.role === r))
                                .map(r => (
                                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={!newRole} onClick={() => {
                            if (newRole) addRole.mutate({ userId: profile.id, role: newRole });
                          }}>
                            <UserPlus className="mr-1 h-4 w-4" />Aggiungi
                          </Button>
                        </div>
                      </div>

                      {/* Company assignments */}
                      <div>
                        <Label className="text-sm font-medium">Aziende Assegnate</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignments.map(a => (
                            <Badge key={a.id} variant="outline" className="gap-1">
                              <Building2 className="h-3 w-3" />
                              {(a.companies as any)?.ragione_sociale || "—"}
                              <button onClick={() => removeAssignment.mutate(a.id)} className="ml-1 hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                          {assignments.length === 0 && <span className="text-sm text-muted-foreground">Nessuna azienda</span>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <SelectTrigger className="w-48"><SelectValue placeholder="Assegna azienda..." /></SelectTrigger>
                            <SelectContent>
                              {companies
                                .filter(c => !assignments.some(a => a.company_id === c.id))
                                .map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={!selectedCompany} onClick={() => {
                            if (selectedCompany) assignCompany.mutate({ userId: profile.id, companyId: selectedCompany });
                          }}>
                            <Plus className="mr-1 h-4 w-4" />Assegna
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New User Dialog */}
      <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Nuovo Utente</DialogTitle>
            <DialogDescription>Crea un nuovo utente con ruolo assegnato. L'utente potrà accedere immediatamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={newUserForm.nome} onChange={e => setNewUserForm(f => ({ ...f, nome: e.target.value }))} placeholder="Mario" />
              </div>
              <div>
                <Label>Cognome</Label>
                <Input value={newUserForm.cognome} onChange={e => setNewUserForm(f => ({ ...f, cognome: e.target.value }))} placeholder="Rossi" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} placeholder="mario@esempio.it" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={newUserForm.password} onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimo 6 caratteri" />
            </div>
            <div>
              <Label>Ruolo</Label>
              <Select value={newUserForm.role} onValueChange={v => setNewUserForm(f => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona ruolo..." /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.app_role.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!newUserForm.nome || !newUserForm.cognome || !newUserForm.email || !newUserForm.password || !newUserForm.role || createUser.isPending}
              onClick={() => createUser.mutate(newUserForm)}
            >
              {createUser.isPending ? "Creazione in corso..." : "Crea Utente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
