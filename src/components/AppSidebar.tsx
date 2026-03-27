import {
  LayoutDashboard,
  FolderOpen,
  FilePlus,
  Receipt,
  Building2,
  Settings,
  ListChecks,
  LogOut,
  Users,
  BookOpen,
  BarChart3,
  Shield,
  LifeBuoy,
  Kanban,
  PlusCircle,
  Table2,
  Zap,
  MessageSquare,
  CalendarClock,
  Mail,
  MessageCircle,
  Gift,
  CalendarDays,
  UserSearch,
  ChevronDown,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth, isSuperAdmin, isInternal, isAzienda, isReseller } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

type NavGroup = {
  label?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: NavItem[];
};

function NavItems({ groups }: { groups: NavGroup[] }) {
  return (
    <>
      {groups.map((group, gi) => (
        group.collapsible && group.label ? (
          <CollapsibleGroup key={gi} group={group} />
        ) : (
          <SidebarGroup key={gi}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavItemRow key={item.url + item.title} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      ))}
    </>
  );
}

function CollapsibleGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(group.defaultOpen ?? true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer flex items-center justify-between hover:text-foreground transition-colors">
            {group.label}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItemRow key={item.url + item.title} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function NavItemRow({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title}>
        <NavLink
          to={item.url}
          end={item.end ?? false}
          className="hover:bg-accent"
          activeClassName="bg-accent text-primary font-medium"
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { roles, user, signOut } = useAuth();
  const { state } = useSidebar();
  const { isImpersonating } = useCompany();
  const collapsed = state === "collapsed";

  const superAdmin = isSuperAdmin(roles);
  const internal = isInternal(roles);
  const azienda = isAzienda(roles);
  const rivenditore = isReseller(roles);

  // ── Navigation per role ───────────────────────────────────────────────────

  let groups: NavGroup[] = [];

  if (internal && !isImpersonating) {
    groups = [
      {
        items: [
          { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
          { title: "Kanban Board", url: "/kanban", icon: Kanban },
        ],
      },
      {
        label: "Pratiche",
        collapsible: true,
        defaultOpen: true,
        items: [
          { title: "Gestionale", url: "/admin/gestionale", icon: Table2 },
          { title: "Pratiche", url: "/admin/pratiche", icon: FolderOpen },
          { title: "Attività", url: "/coda-pratiche", icon: ListChecks },
          { title: "Automazioni", url: "/admin/automazioni", icon: Zap },
        ],
      },
      {
        label: "Comunicazioni",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Email", url: "/admin/email", icon: Mail },
          { title: "WhatsApp", url: "/admin/whatsapp", icon: MessageCircle },
          { title: "Log", url: "/admin/comunicazioni", icon: MessageSquare },
          { title: "Calendario Chiamate", url: "/admin/calendario", icon: CalendarClock },
          { title: "Calendario", url: "/admin/calendario-eventi", icon: CalendarDays },
        ],
      },
      {
        label: "CRM",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Aziende", url: "/aziende", icon: Building2 },
          { title: "Clienti", url: "/admin/clienti", icon: UserSearch },
          { title: "Promo", url: "/admin/promo", icon: Gift },
          { title: "Ticket", url: "/admin/ticket", icon: LifeBuoy },
        ],
      },
      {
        label: "Sistema",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Utenti", url: "/utenti", icon: Users },
          { title: "Listino", url: "/listino", icon: BookOpen },
          { title: "Analytics", url: "/analytics", icon: BarChart3 },
          { title: "Audit Log", url: "/admin/audit-log", icon: Shield },
          { title: "Impostazioni", url: "/admin/impostazioni", icon: Settings },
        ],
      },
    ];
  } else if (rivenditore) {
    groups = [
      {
        items: [
          { title: "Dashboard ENEA", url: "/enea/dashboard", icon: BarChart3 },
          { title: "Nuova Pratica ENEA", url: "/enea/nuova", icon: PlusCircle },
          { title: "Kanban Board", url: "/kanban", icon: Kanban },
        ],
      },
    ];
  } else {
    // Azienda (default / impersonating)
    groups = [
      {
        items: [
          { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
          { title: "Nuova Pratica", url: "/pratiche/nuova", icon: FilePlus },
          { title: "Le mie Pratiche", url: "/pratiche", icon: FolderOpen },
          { title: "Estratto Conto", url: "/wallet", icon: Receipt },
          { title: "Assistenza", url: "/assistenza", icon: LifeBuoy },
          { title: "Impostazioni", url: "/impostazioni", icon: Settings },
        ],
      },
    ];
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="flex items-center gap-3 px-2 py-4">
              {collapsed ? (
                <img
                  src="/pratica-rapida-logo.png"
                  alt="Pratica Rapida"
                  className="h-9 w-9 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-9" />
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavItems groups={groups} />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2">
          {!collapsed && user && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              {superAdmin && (
                <p className="text-xs font-medium text-primary">Super Admin</p>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={signOut}
            title="Esci"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
