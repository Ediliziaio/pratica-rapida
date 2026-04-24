import {
  FolderOpen,
  FilePlus,
  Building2,
  Settings,
  ListChecks,
  LogOut,
  BarChart3,
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
  UserSearch,
  ChevronDown,
  Newspaper,
  Archive,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();

  // Explicit active logic: with end=true → exact match, else prefix match
  const isActive = item.end
    ? pathname === item.url
    : pathname === item.url || pathname.startsWith(item.url + "/");

  const link = (
    <Link
      to={item.url}
      className={[
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-white hover:bg-white/[0.15] hover:text-white",
        isActive ? "sidebar-nav-active" : "",
      ].join(" ").trim()}
    >
      <item.icon className="h-[1.05rem] w-[1.05rem] shrink-0 transition-all duration-200 group-hover:scale-110" />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </Link>
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
          <button className="flex w-full items-center justify-between px-3 py-1.5 mb-1 rounded-md text-[10px] font-bold uppercase tracking-[0.08em] text-white/70 hover:text-white transition-colors">
            <span>{group.label}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 text-white/70 ${open ? "rotate-0" : "-rotate-90"}`}
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
  // admin_interno = company admin → should see the azienda view, NOT the internal staff view
  const internal = roles.some(r => ["super_admin", "operatore"].includes(r));
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
        label: "Pratiche",
        collapsible: true,
        defaultOpen: true,
        items: [
          { title: "Pratiche", url: "/admin/pratiche", icon: FolderOpen },
          { title: "Gestionale", url: "/admin/gestionale", icon: Table2 },
          { title: "Pipeline ENEA", url: "/kanban?brand=enea", icon: Kanban },
          { title: "Pipeline Conto Termico", url: "/kanban?brand=conto_termico", icon: Kanban },
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
          { title: "Calendario", url: "/admin/calendario", icon: CalendarClock },
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
          { title: "News Sito", url: "/admin/news", icon: Newspaper },
          { title: "Ticket", url: "/admin/ticket", icon: LifeBuoy },
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
          { title: "Archivio ENEA", url: "/enea/archivio", icon: Archive },
        ],
      },
    ];
  } else {
    // Azienda (default / impersonating)
    settingsItem = { title: "Impostazioni", url: "/impostazioni", icon: Settings };
    groups = [
      {
        items: [
          { title: "Le mie Pratiche", url: "/pratiche", icon: FolderOpen, end: true },
          { title: "Nuova Pratica", url: "/pratiche/nuova", icon: FilePlus, end: true },
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
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>

        {/* Thin separator */}
        <div className="mx-3 mb-2 h-px bg-white/[0.09]" />

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          <NavGroups groups={groups} collapsed={collapsed} />
        </div>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <SidebarFooter className="px-0 pb-0">
        {/* Separator */}
        <div className="mx-3 h-px bg-white/[0.09]" />

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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold select-none ring-1 ring-white/30">
            {initials}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-white leading-tight">
                {user?.email ?? ""}
              </p>
              <p className="text-[10px] text-white/70 leading-tight mt-0.5">
                {superAdmin ? "Super Admin" : internal ? "Operatore" : rivenditore ? "Rivenditore" : "Azienda"}
              </p>
            </div>
          )}

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7 text-white/60 hover:text-red-300 hover:bg-white/10 transition-colors duration-200"
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
