import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Search, UserPlus, X, Building2, Plus, Users, Check,
  Eye, EyeOff, FileText, Download, MessageSquare, Trash2,
  ClipboardList, ChevronDown, ChevronUp,
} from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import type { OperatorPermissions } from "@/hooks/useOperatorPermissions";
import { DEFAULT_OPERATOR_PERMISSIONS } from "@/hooks/useOperatorPermissions";

type AppRole = Database["public"]["Enums"]["app_role"];

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin_interno: "Admin Interno",
  operatore: "Operatore",
  azienda_admin: "Azienda Admin",
  azienda_user: "Azienda User",
  rivenditore: "Rivenditore",
  partner: "Partner",
};

const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-destructive/10 text-destructive",
  admin_interno: "bg-primary/10 text-primary",
  operatore: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  azienda_admin: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  azienda_user: "bg-muted text-muted-foreground",
  rivenditore: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  partner: "bg-accent text-accent-foreground",
};

const newUserSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Minimo 8 caratteri"),
  role: z.enum(Constants.public.Enums.app_role as unknown as [string, ...string[]], { required_error: "Seleziona un ruolo" }),
});

// ─── Permission Definitions ───────────────────────────────────────────────────

interface PermDef {
  key: keyof OperatorPermissions;
  label: string;
  description: string;
  icon: React.ElementType;
  category: string;
  defaultValue: boolean;
  /** If true, the default for operatore should be false (restricted) */
  restrictedDefault?: boolean;
}

const PERMISSION_DEFS: PermDef[] = [
  // PRATICHE
  {
    key: "see_all_pratiche",
    label: "Vedi tutte le pratiche",
    description: "Accede a tutte le pratiche o solo quelle assegnate a lui",
    icon: ClipboardList,
    category: "Pratiche",
    defaultValue: true,
  },
  {
    key: "see_pricing",
    label: "Vedi importi economici",
    description: "Visualizza i prezzi (€) nelle pratiche, gestionale e dashboard",
    icon: Eye,
    category: "Pratiche",
    defaultValue: true,
    restrictedDefault: true,
  },
  {
    key: "can_create_pratiche",
    label: "Crea nuove pratiche",
    description: "Può aprire e inviare nuove pratiche",
    icon: FileText,
    category: "Pratiche",
    defaultValue: true,
  },
  {
    key: "can_delete_pratiche",
    label: "Elimina / Archivia pratiche",
    description: "Può archiviare o cancellare pratiche",
    icon: Trash2,
    category: "Pratiche",
    defaultValue: false,
    restrictedDefault: true,
  },
  // DATI
  {
    key: "can_manage_clients",
    label: "Gestisci clienti",
    description: "Può creare, modificare ed eliminare anagrafiche clienti",
    icon: Users,
    category: "Dati",
    defaultValue: true,
  },
  {
    key: "can_export",
    label: "Esporta dati (CSV/Excel)",
    description: "Può scaricare export di pratiche e reportistica",
    icon: Download,
    category: "Dati",
    defaultValue: true,
  },
  // COMUNICAZIONI
  {
    key: "can_use_communications",
    label: "Email & WhatsApp",
    description: "Accede ai template e ai log di comunicazione",
    icon: MessageSquare,
    category: "Comunicazioni",
    defaultValue: false,
    restrictedDefault: true,
  },
];

const PERM_CATEGORIES = [...new Set(PERMISSION_DEFS.map(p => p.category))];

// ─── Permissions Matrix (read-only reference) ─────────────────────────────────

type PermRole = "super_admin" | "admin_interno" | "operatore" | "azienda_admin" | "azienda_user" | "rivenditore";

const PERM_ROLES: PermRole[] = ["super_admin", "admin_interno", "operatore", "azienda_admin", "azienda_user", "rivenditore"];
const PERM_ROLE_LABELS: Record<PermRole, string> = { super_admin: "Super Admin", admin_interno: "Admin", operatore: "Operatore", azienda_admin: "Az. Admin", azienda_user: "Az. User", rivenditore: "Rivenditore" };
const PERM_ROLE_COLORS: Record<PermRole, string> = {
  super_admin: "bg-destructive/10 text-destructive",
  admin_interno: "bg-primary/10 text-primary",
  operatore: "bg-amber-100 text-amber-700",
  azienda_admin: "bg-emerald-100 text-emerald-700",
  azienda_user: "bg-muted text-muted-foreground",
  rivenditore: "bg-blue-100 text-blue-700",
};

interface PermRow { label: string; perms: Record<PermRole, boolean>; category?: string }
const PERM_MATRIX: PermRow[] = [
  { label: "Dashboard",               category: "GENERALE",       perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: true,  azienda_user: true,  rivenditore: false } },
  { label: "Kanban Board",            category: "PRATICHE",       perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: true  } },
  { label: "Pipeline ENEA/CT",                                    perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: true  } },
  { label: "Nuova Pratica",                                       perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: true,  azienda_user: true,  rivenditore: true  } },
  { label: "Pratiche (admin view)",                               perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Le mie Pratiche",                                     perms: { super_admin: false, admin_interno: false, operatore: false, azienda_admin: true,  azienda_user: true,  rivenditore: false } },
  { label: "Attività (coda)",                                     perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Pratiche (Kanban+Tabella)", category: "CRM",            perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: true,  azienda_user: true,  rivenditore: true  } },
  { label: "Automazioni",                                         perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Email/WhatsApp",                                      perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Calendari",                                           perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Aziende / CRM",                                       perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Promo",                                               perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Ticket (admin)",          category: "SUPPORTO",       perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Assistenza (cliente)",                                perms: { super_admin: false, admin_interno: false, operatore: false, azienda_admin: true,  azienda_user: true,  rivenditore: false } },
  { label: "Wallet / Estratto Conto",                             perms: { super_admin: false, admin_interno: false, operatore: false, azienda_admin: true,  azienda_user: true,  rivenditore: false } },
  { label: "Analytics",               category: "SISTEMA",        perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Audit Log",                                           perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Listino",                                             perms: { super_admin: true,  admin_interno: true,  operatore: true,  azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Utenti & Ruoli",                                      perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Impostazioni (admin)",                                perms: { super_admin: true,  admin_interno: false, operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Campi Personalizzati",                                perms: { super_admin: true,  admin_interno: false, operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
  { label: "Impersonificazione",                                  perms: { super_admin: true,  admin_interno: true,  operatore: false, azienda_admin: false, azienda_user: false, rivenditore: false } },
];

// ─── Operator Permissions Panel ───────────────────────────────────────────────

function OperatorPermissionsPanel({
  userId,
  currentPerms,
}: {
  userId: string;
  currentPerms: OperatorPermissions;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<OperatorPermissions>(currentPerms);
  const [dirty, setDirty] = useState(false);

  const toggle = (key: keyof OperatorPermissions) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (perms: OperatorPermissions) => {
      const { error } = await supabase
        .from("profiles")
        .update({ operator_permissions: perms as any })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["operator-permissions", userId] });
      setDirty(false);
      toast({ title: "Permessi salvati" });
    },
    onError: () => toast({ variant: "destructive", title: "Errore nel salvataggio" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Permessi Operatore</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configura cosa può vedere e fare questo operatore
          </p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(local)}
          >
            <Check className="h-3.5 w-3.5" />
            {saveMutation.isPending ? "Salvo..." : "Salva modifiche"}
          </Button>
        )}
      </div>

      {PERM_CATEGORIES.map(cat => {
        const defs = PERMISSION_DEFS.filter(d => d.category === cat);
        return (
          <div key={cat} className="rounded-xl border overflow-hidden">
            {/* Category header */}
            <div className="bg-muted/50 px-4 py-2 border-b">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{cat}</p>
            </div>

            <div className="divide-y">
              {defs.map(def => {
                const Icon = def.icon;
                const enabled = local[def.key];
                return (
                  <div
                    key={def.key}
                    className={`flex items-center justify-between px-4 py-3 transition-colors ${
                      enabled ? "bg-background" : "bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        enabled ? "bg-primary/10" : "bg-muted"
                      }`}>
                        <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                          {def.label}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {!enabled && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <EyeOff className="h-3 w-3" />Disabilitato
                        </span>
                      )}
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggle(def.key)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Quick preset buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => {
            // Preset: restricted operator (no pricing, no delete, only assigned practices)
            setLocal({
              see_all_pratiche: false,
              see_pricing: false,
              can_export: false,
              can_create_pratiche: true,
              can_manage_clients: true,
              can_use_communications: false,
              can_delete_pratiche: false,
            });
            setDirty(true);
          }}
        >
          🔒 Operatore base
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => {
            // Preset: full operator
            setLocal({
              see_all_pratiche: true,
              see_pricing: true,
              can_export: true,
              can_create_pratiche: true,
              can_manage_clients: true,
              can_use_communications: true,
              can_delete_pratiche: false,
            });
            setDirty(true);
          }}
        >
          🚀 Operatore avanzato
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 text-muted-foreground"
          onClick={() => { setLocal(DEFAULT_OPERATOR_PERMISSIONS); setDirty(true); }}
        >
          Reset default
        </Button>
      </div>
    </div>
  );
}

// ─── Permessi Matrix Tab ──────────────────────────────────────────────────────

function PermessiTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Matrice dei Permessi per Ruolo</h2>
        <p className="text-sm text-muted-foreground">
          Panoramica dei permessi base per ruolo. I permessi operatore possono essere personalizzati per singolo utente nel tab Utenti.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 sticky top-0 z-10">
              <th className="px-4 py-3 text-left font-semibold text-foreground min-w-[200px]">Sezione / Azione</th>
              {PERM_ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-medium min-w-[100px]">
                  <Badge className={`text-xs whitespace-nowrap ${PERM_ROLE_COLORS[role]}`}>
                    {PERM_ROLE_LABELS[role]}
                  </Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {PERM_MATRIX.map((row, idx) => (
              <>
                {row.category && (
                  <tr key={`cat-${row.category}`} className="bg-muted/30">
                    <td colSpan={PERM_ROLES.length + 1} className="px-4 py-1.5">
                      <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                        {row.category}
                      </span>
                    </td>
                  </tr>
                )}
                <tr key={row.label} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-4 py-2.5 font-medium">{row.label}</td>
                  {PERM_ROLES.map((role) => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {row.perms[role] ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                      ) : (
                        <span className="text-muted-foreground/40 font-medium">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-6 text-xs text-muted-foreground border rounded-lg px-4 py-2.5 bg-muted/20 w-fit">
        <span className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
          accesso attivo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/40 font-medium">—</span>
          nessun accesso
        </span>
        <span className="flex items-center gap-1.5 text-amber-600">
          <Shield className="h-3.5 w-3.5" />
          Operatore: personalizzabile per utente
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Utenti() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<AppRole | "">("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole | "">("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ nome: "", cognome: "", email: "", password: "", role: "" as AppRole | "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("cognome");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["admin-all-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_company_assignments").select("*, companies(ragione_sociale)");
      if (error) throw error;
      return data;
    },
  });

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-all-roles"] }); setNewRole(""); toast({ title: "Ruolo aggiunto" }); },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-all-roles"] }); toast({ title: "Ruolo rimosso" }); },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const assignCompany = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId: string }) => {
      const { error } = await supabase.from("user_company_assignments").insert({ user_id: userId, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-all-assignments"] }); setSelectedCompany(""); toast({ title: "Azienda assegnata" }); },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("user_company_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-all-assignments"] }); toast({ title: "Assegnazione rimossa" }); },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const createUser = useMutation({
    mutationFn: async (form: typeof newUserForm) => {
      const response = await supabase.functions.invoke("create-user", {
        body: { email: form.email, password: form.password, nome: form.nome, cognome: form.cognome, role: form.role },
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
      setFormErrors({});
      toast({ title: "Utente creato con successo" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleCreateUser = () => {
    setFormErrors({});
    const result = newUserSchema.safeParse(newUserForm);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach(e => { errs[e.path[0] as string] = e.message; });
      setFormErrors(errs);
      return;
    }
    createUser.mutate(newUserForm);
  };

  const getUserRoles = (userId: string) => allRoles.filter(r => r.user_id === userId);
  const getUserAssignments = (userId: string) => allAssignments.filter(a => a.user_id === userId);

  const filtered = profiles.filter(p => {
    const matchSearch = `${p.nome} ${p.cognome} ${p.email}`.toLowerCase().includes(search.toLowerCase());
    const userRoles = getUserRoles(p.id);
    const matchRole = !filterRole || userRoles.some(r => r.role === filterRole);
    return matchSearch && matchRole;
  });

  // Role counts for the stats bar
  const roleCounts = Object.keys(ROLE_LABELS).reduce((acc, role) => {
    acc[role] = allRoles.filter(r => r.role === role).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Utenti & Ruoli</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestisci utenti, ruoli e permessi operatori
          </p>
        </div>
        <Button onClick={() => setShowNewUser(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Nuovo Utente
        </Button>
      </div>

      <Tabs defaultValue="utenti">
        <TabsList>
          <TabsTrigger value="utenti" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />Utenti
          </TabsTrigger>
          <TabsTrigger value="permessi" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />Permessi
          </TabsTrigger>
        </TabsList>

        {/* ── UTENTI TAB ── */}
        <TabsContent value="utenti" className="mt-4 space-y-4">

          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" />
              {profiles.length} utenti
            </span>
            <span className="text-border">·</span>
            {Object.entries(ROLE_LABELS).map(([role, label]) => {
              const count = roleCounts[role] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={role}
                  onClick={() => setFilterRole(filterRole === role as AppRole ? "" : role as AppRole)}
                  className={`rounded-full px-2.5 py-0.5 text-xs border transition-all ${
                    filterRole === role
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : `border-transparent ${ROLE_COLORS[role as AppRole]} hover:border-border`
                  }`}
                >
                  {label}: {count}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, cognome o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* User list */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-2">
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Nessun utente trovato.</p>
                </div>
              )}

              {filtered.map(profile => {
                const roles = getUserRoles(profile.id);
                const assignments = getUserAssignments(profile.id);
                const isExpanded = selectedUser === profile.id;
                const isOperatore = roles.some(r => r.role === "operatore");
                const perms: OperatorPermissions = {
                  ...DEFAULT_OPERATOR_PERMISSIONS,
                  ...((profile as any).operator_permissions ?? {}),
                };

                return (
                  <Card
                    key={profile.id}
                    className={`transition-all ${isExpanded ? "ring-2 ring-primary/50 shadow-sm" : "hover:shadow-sm"}`}
                  >
                    <CardContent className="p-0">
                      {/* Header row — always visible */}
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer"
                        onClick={() => setSelectedUser(isExpanded ? null : profile.id)}
                      >
                        {/* Avatar */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm select-none">
                          {(profile.nome?.[0] ?? "").toUpperCase()}{(profile.cognome?.[0] ?? "").toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm leading-tight">
                            {profile.nome} {profile.cognome}
                          </p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>

                        {/* Permission pills for operatore */}
                        {isOperatore && (
                          <div className="hidden sm:flex items-center gap-1.5">
                            {!perms.see_pricing && (
                              <span className="flex items-center gap-1 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-medium">
                                <EyeOff className="h-2.5 w-2.5" />€ nascosti
                              </span>
                            )}
                            {!perms.see_all_pratiche && (
                              <span className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
                                <ClipboardList className="h-2.5 w-2.5" />Solo assegnate
                              </span>
                            )}
                          </div>
                        )}

                        {/* Role badges */}
                        <div className="flex flex-wrap gap-1 justify-end shrink-0 max-w-[180px]">
                          {roles.map(r => (
                            <Badge key={r.id} className={`text-xs ${ROLE_COLORS[r.role]}`}>
                              {ROLE_LABELS[r.role]}
                            </Badge>
                          ))}
                          {roles.length === 0 && (
                            <Badge variant="outline" className="text-xs">Nessun ruolo</Badge>
                          )}
                        </div>

                        {/* Expand icon */}
                        <div className="text-muted-foreground shrink-0">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {/* Expanded section */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t space-y-5 pt-4">

                          {/* Roles management */}
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ruoli</Label>
                            <div className="flex flex-wrap gap-2">
                              {roles.map(r => (
                                <Badge key={r.id} className={`${ROLE_COLORS[r.role]} gap-1 pr-1`}>
                                  {ROLE_LABELS[r.role]}
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button className="ml-1 rounded-full hover:bg-black/10 p-0.5">
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Rimuovere il ruolo?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Stai per rimuovere il ruolo <strong>{ROLE_LABELS[r.role]}</strong> da{" "}
                                          <strong>{profile.nome} {profile.cognome}</strong>.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => removeRole.mutate(r.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >Rimuovi</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </Badge>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Select value={newRole} onValueChange={v => setNewRole(v as AppRole)}>
                                <SelectTrigger className="w-44 h-8 text-sm">
                                  <SelectValue placeholder="Aggiungi ruolo..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {Constants.public.Enums.app_role
                                    .filter(r => !roles.some(ur => ur.role === r))
                                    .map(r => (
                                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="h-8"
                                disabled={!newRole}
                                onClick={() => { if (newRole) addRole.mutate({ userId: profile.id, role: newRole }); }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi
                              </Button>
                            </div>
                          </div>

                          {/* Operator permissions panel — only for operatore role */}
                          {isOperatore && (
                            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 overflow-hidden">
                              <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                                <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                  Configurazione Permessi — Operatore
                                </span>
                              </div>
                              <div className="p-4">
                                <OperatorPermissionsPanel userId={profile.id} currentPerms={perms} />
                              </div>
                            </div>
                          )}

                          {/* Company assignments */}
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aziende Assegnate</Label>
                            <div className="flex flex-wrap gap-2">
                              {assignments.map(a => {
                                const companyName = (a.companies as { ragione_sociale: string } | null)?.ragione_sociale || "—";
                                return (
                                  <Badge key={a.id} variant="outline" className="gap-1 pr-1">
                                    <Building2 className="h-3 w-3" />
                                    {companyName}
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button className="ml-1 rounded-full hover:bg-muted p-0.5">
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Rimuovere l'assegnazione?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            <strong>{profile.nome} {profile.cognome}</strong> non avrà più accesso a <strong>{companyName}</strong>.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => removeAssignment.mutate(a.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >Rimuovi</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </Badge>
                                );
                              })}
                              {assignments.length === 0 && (
                                <span className="text-sm text-muted-foreground">Nessuna azienda assegnata</span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                                <SelectTrigger className="w-48 h-8 text-sm">
                                  <SelectValue placeholder="Assegna azienda..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {companies
                                    .filter(c => !assignments.some(a => a.company_id === c.id))
                                    .map(c => (
                                      <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="h-8"
                                disabled={!selectedCompany}
                                onClick={() => { if (selectedCompany) assignCompany.mutate({ userId: profile.id, companyId: selectedCompany }); }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />Assegna
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
        </TabsContent>

        {/* ── PERMESSI TAB ── */}
        <TabsContent value="permessi" className="mt-4">
          <PermessiTab />
        </TabsContent>
      </Tabs>

      {/* New User Dialog */}
      <Dialog open={showNewUser} onOpenChange={(open) => {
        setShowNewUser(open);
        if (!open) { setNewUserForm({ nome: "", cognome: "", email: "", password: "", role: "" }); setFormErrors({}); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Nuovo Utente</DialogTitle>
            <DialogDescription>L'utente potrà accedere immediatamente dopo la creazione.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={newUserForm.nome} onChange={e => setNewUserForm(f => ({ ...f, nome: e.target.value }))} placeholder="Mario" />
                {formErrors.nome && <p className="text-xs text-destructive mt-1">{formErrors.nome}</p>}
              </div>
              <div>
                <Label>Cognome *</Label>
                <Input value={newUserForm.cognome} onChange={e => setNewUserForm(f => ({ ...f, cognome: e.target.value }))} placeholder="Rossi" />
                {formErrors.cognome && <p className="text-xs text-destructive mt-1">{formErrors.cognome}</p>}
              </div>
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} placeholder="mario@esempio.it" />
              {formErrors.email && <p className="text-xs text-destructive mt-1">{formErrors.email}</p>}
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={newUserForm.password} onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimo 8 caratteri" />
              {formErrors.password && <p className="text-xs text-destructive mt-1">{formErrors.password}</p>}
            </div>
            <div>
              <Label>Ruolo *</Label>
              <Select value={newUserForm.role} onValueChange={v => setNewUserForm(f => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona ruolo..." /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.app_role.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.role && <p className="text-xs text-destructive mt-1">{formErrors.role}</p>}
            </div>
            <Button className="w-full" disabled={createUser.isPending} onClick={handleCreateUser}>
              {createUser.isPending ? "Creazione in corso..." : "Crea Utente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
