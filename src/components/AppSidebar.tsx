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
import { useAuth, isSuperAdmin, isInternal, isReseller } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

// ── Single nav item row ────────────────────────────────────────────────────────

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.url}
      end={item.end ?? false}
      className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground sidebar-nav-active"
    >
      <item.icon className="h-[1.05rem] w-[1.05rem] shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

// ── Plain group (no label, no collapsible) ─────────────────────────────────────

function NavGroup({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  return (
    <div className="px-2 pb-1">
      {group.items.map((item) => (
        <NavItemRow key={item.url + item.title} item={item} collapsed={collapsed} />
      ))}
    </div>
  );
}

// ── Collapsible group ──────────────────────────────────────────────────────────

function CollapsibleGroup({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  if (collapsed) {
    // In collapsed mode render items directly without the label
    return (
      <div className="px-2 pb-1">
        {group.items.map((item) => (
          <NavItemRow key={item.url + item.title} item={item} collapsed={true} />
        ))}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="px-2 pb-1">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-3 py-1.5 mb-0.5 rounded-md text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors">
            <span>{group.label}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {group.items.map((item) => (
            <NavItemRow key={item.url + item.title} item={item} collapsed={false} />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── All nav groups ─────────────────────────────────────────────────────────────

function NavGroups({ groups, collapsed }: { groups: NavGroup[]; collapsed: boolean }) {
  return (
    <>
      {groups.map((group, i) =>
        group.collapsible && group.label ? (
          <CollapsibleGroup key={i} group={group} collapsed={collapsed} />
        ) : (
          <NavGroup key={i} group={group} collapsed={collapsed} />
        )
      )}
    </>
  );
}

// ── Main sidebar ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { roles, user, signOut } = useAuth();
  const { state } = useSidebar();
  const { isImpersonating } = useCompany();
  const collapsed = state === "collapsed";

  const superAdmin = isSuperAdmin(roles);
  const internal = isInternal(roles);
  const rivenditore = isReseller(roles);

  // Initials for avatar
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "PR";

  // ── Nav groups per role ──────────────────────────────────────────────────────

  let groups: NavGroup[] = [];
  // Settings item that gets pinned to bottom (removed from nav groups)
  let settingsItem: NavItem | null = null;

  if (internal && !isImpersonating) {
    settingsItem = { title: "Impostazioni", url: "/admin/impostazioni", icon: Settings };
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
    settingsItem = { title: "Impostazioni", url: "/impostazioni", icon: Settings };
    groups = [
      {
        items: [
          { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
          { title: "Nuova Pratica", url: "/pratiche/nuova", icon: FilePlus },
          { title: "Le mie Pratiche", url: "/pratiche", icon: FolderOpen },
          { title: "Estratto Conto", url: "/wallet", icon: Receipt },
          { title: "Assistenza", url: "/assistenza", icon: LifeBuoy },
        ],
      },
    ];
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sidebar collapsible="icon">
      {/* ── Content ────────────────────────────────────────────────────────── */}
      <SidebarContent className="overflow-x-hidden">
        {/* Logo */}
        <div className={`flex items-center px-4 ${collapsed ? "py-3 justify-center" : "py-4 gap-3"}`}>
          <img
            src="/pratica-rapida-logo.png"
            alt="Pratica Rapida"
            className={collapsed ? "h-8 w-8 rounded-lg object-cover" : "h-8"}
          />
        </div>

        {/* Thin separator */}
        <div className="mx-3 mb-2 h-px bg-sidebar-border/60" />

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          <NavGroups groups={groups} collapsed={collapsed} />
        </div>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <SidebarFooter className="px-0 pb-0">
        {/* Separator */}
        <div className="mx-3 h-px bg-sidebar-border/60" />

        {/* Pinned: Impostazioni */}
        {settingsItem && (
          <div className="px-2 pt-1">
            <NavItemRow item={settingsItem} collapsed={collapsed} />
          </div>
        )}

        {/* User card */}
        <div
          className={`flex items-center gap-2.5 px-3 py-3 ${collapsed ? "justify-center" : ""}`}
        >
          {/* Avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary text-xs font-bold select-none">
            {initials}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-accent-foreground leading-tight">
                {user?.email ?? ""}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight mt-0.5">
                {superAdmin ? "Super Admin" : internal ? "Admin" : rivenditore ? "Rivenditore" : "Azienda"}
              </p>
            </div>
          )}

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={signOut}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Esci</TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
