import {
  FolderOpen,
  FilePlus,
  Building2,
  Settings,
  ListChecks,
  LogOut,
  BarChart3,
  Kanban,
  PlusCircle,
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
  FormInput,
  Download,
  Activity,
  BookOpen,
  PhoneCall,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, isSuperAdmin, isReseller } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
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
  /** Optional numeric badge (e.g., uncontacted leads count). Hidden if 0. */
  badge?: number;
  /** If true, render as external anchor opening in a new tab (used for static PDFs). */
  external?: boolean;
  /** If present, the row is a toggle that expands to show these sub-items
   *  (used for "Come usare il portale" → le tre guide). Il parent non naviga. */
  subItems?: NavItem[];
};

// Voce "Come usare il portale": una tendina con le tre guide PDF (statiche in
// /public, aperte in scheda nuova). Definita una volta e riusata nei due rami
// di menu (rivenditore standalone / azienda).
const TUTORIAL_NAV_ITEM: NavItem = {
  title: "Come usare il portale",
  url: "#tutorial",
  icon: BookOpen,
  subItems: [
    { title: "Inserire una pratica ENEA", url: "/guida-inserire-pratica-enea.pdf", icon: FilePlus, external: true },
    { title: "Come funziona il portale", url: "/guida-come-funziona-portale.pdf", icon: BookOpen, external: true },
    { title: "Documenti da scaricare", url: "/guida-documenti-da-scaricare.pdf", icon: Download, external: true },
  ],
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

  // Voce con sotto-guide (es. "Come usare il portale"): è un toggle, non un
  // link. Delegata a un componente dedicato per non appesantire il caso comune.
  if (item.subItems && item.subItems.length > 0) {
    return <NavItemWithSub item={item} collapsed={collapsed} />;
  }

  // Explicit active logic: with end=true → exact match, else prefix match
  const isActive = item.end
    ? pathname === item.url
    : pathname === item.url || pathname.startsWith(item.url + "/");

  const showBadge = !!item.badge && item.badge > 0;

  const linkClassName = [
    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-white hover:bg-white/[0.15] hover:text-white",
    isActive ? "sidebar-nav-active" : "",
  ].join(" ").trim();

  const linkContent = (
    <>
      <item.icon className="h-[1.05rem] w-[1.05rem] shrink-0 transition-all duration-200 group-hover:scale-110" />
      {!collapsed && <span className="truncate flex-1">{item.title}</span>}
      {showBadge && !collapsed && (
        <span
          className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold tabular-nums"
          aria-label={`${item.badge} elementi nuovi`}
        >
          {item.badge! > 99 ? "99+" : item.badge}
        </span>
      )}
      {showBadge && collapsed && (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500"
          aria-label="Nuovi elementi"
        />
      )}
    </>
  );

  const link = item.external ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {linkContent}
    </a>
  ) : (
    <Link to={item.url} className={linkClassName}>
      {linkContent}
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

// ── Nav item with expandable sub-items (dropdown a tendina) ────────────────────

// Evento pubblico (dispatchato dal pop-up di benvenuto alla chiusura): chiede
// alla sidebar di rendersi visibile ed evidenziare la voce "Come usare il
// portale". Gestito da AppSidebar, che è sempre montato.
export const HIGHLIGHT_TUTORIAL_EVENT = "highlight-tutorial-nav";
// Evento interno: emesso da AppSidebar DOPO aver aperto la sidebar/drawer, così
// la voce tutorial (che su mobile monta solo a drawer aperto) è già presente e
// può espandersi + evidenziarsi.
const TUTORIAL_EXPAND_EVENT = "highlight-tutorial-nav-inner";

function NavItemWithSub({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Solo la voce tutorial reagisce all'evento di evidenziazione.
  const isTutorial = item.url === "#tutorial";

  useEffect(() => {
    if (!isTutorial) return;
    const onHighlight = () => {
      setOpen(true);
      setHighlight(true);
      // Scroll in vista dopo che il ramo espanso è stato renderizzato
      // (setTimeout, non requestAnimationFrame: il btnRef nasce col re-render).
      window.setTimeout(() => {
        btnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 180);
      // Durata = animazione (2s) + il piccolo ritardo di scroll iniziale.
      window.setTimeout(() => setHighlight(false), 2200);
    };
    window.addEventListener(TUTORIAL_EXPAND_EVENT, onHighlight);
    return () => window.removeEventListener(TUTORIAL_EXPAND_EVENT, onHighlight);
  }, [isTutorial]);

  // In modalità compatta il parent non ha dove espandersi: mostriamo solo le
  // sotto-guide come icone (stesso approccio del CollapsibleGroup compatto).
  if (collapsed) {
    return (
      <>
        {item.subItems!.map((sub) => (
          <NavItemRow key={sub.url + sub.title} item={sub} collapsed />
        ))}
      </>
    );
  }

  const rowClassName = [
    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-white hover:bg-white/[0.15] hover:text-white",
    highlight ? "tutorial-highlight" : "",
  ].join(" ").trim();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button ref={btnRef} className={rowClassName}>
          <item.icon className="h-[1.05rem] w-[1.05rem] shrink-0 transition-all duration-200 group-hover:scale-110" />
          <span className="truncate flex-1 text-left">{item.title}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* Sotto-guide rientrate, con una guida verticale sul bordo sinistro. */}
        <div className="ml-4 mt-0.5 border-l border-white/15 pl-2">
          {item.subItems!.map((sub) => (
            <NavItemRow key={sub.url + sub.title} item={sub} collapsed={false} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
  const { state, setOpen: setSidebarOpen, setOpenMobile, isMobile } = useSidebar();
  const { isImpersonating } = useCompany();
  const collapsed = state === "collapsed";

  // Pop-up guide → rendi visibile la sidebar, poi (a contenuto montato) chiedi
  // alla voce tutorial di espandersi/evidenziarsi. Sta qui, non nella voce,
  // perché su mobile il contenuto del drawer non è montato finché è chiuso.
  useEffect(() => {
    const onHighlight = () => {
      if (isMobile) setOpenMobile(true);
      else setSidebarOpen(true);
      window.setTimeout(() => {
        window.dispatchEvent(new Event(TUTORIAL_EXPAND_EVENT));
      }, 260);
    };
    window.addEventListener(HIGHLIGHT_TUTORIAL_EVENT, onHighlight);
    return () => window.removeEventListener(HIGHLIGHT_TUTORIAL_EVENT, onHighlight);
  }, [isMobile, setSidebarOpen, setOpenMobile]);

  const superAdmin = isSuperAdmin(roles);
  // admin_interno = company admin → should see the azienda view, NOT the internal staff view
  const internal = roles.some(r => ["super_admin", "operatore"].includes(r));
  const rivenditore = isReseller(roles);

  // Count uncontacted leads from the public form so staff sees a "X new" badge
  // on the Aziende link. Only fetched for internal staff who can see the leads.
  // Polling 5min (era 60s): è un badge informativo, non richiede freschezza
  // istantanea. Riduce traffico ~5x e battery drain mobile. Quando lo staff
  // contatta un lead, l'invalidazione esplicita aggiorna il badge subito.
  const { data: uncontactedLeads = 0 } = useQuery({
    queryKey: ["uncontacted-public-leads"],
    enabled: internal,
    refetchInterval: 5 * 60_000, // 5min — badge non-urgente
    staleTime: 2 * 60_000,        // 2min — evita doppia fetch su rimount sidebar
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("source", "public_form")
        .is("contacted_at", null)
        .is("archived_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // Conteggio clienti "da chiamare": pratiche nelle prime due stage
  // (inviata / attesa_compilazione) col form non ancora compilato. Badge sulla
  // voce "Chiamate". Polling 5min: è informativo, non richiede freschezza live.
  const { data: daChiamare = 0 } = useQuery({
    queryKey: ["chiamate-da-fare-count"],
    enabled: internal,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data: stages, error: stErr } = await supabase
        .from("pipeline_stages")
        .select("id")
        .in("stage_type", ["inviata", "attesa_compilazione"]);
      if (stErr || !stages?.length) return 0;
      const stageIds = stages.map((s) => s.id);
      const { count, error } = await supabase
        .from("enea_practices")
        .select("id", { count: "exact", head: true })
        .in("current_stage_id", stageIds)
        .is("form_compilato_at", null)
        .is("archived_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

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
          { title: "Pratiche", url: "/kanban", icon: Kanban },
          { title: "Attività", url: "/coda-pratiche", icon: ListChecks },
          { title: "Chiamate", url: "/admin/chiamate", icon: PhoneCall, badge: daChiamare },
          { title: "Automazioni", url: "/admin/automazioni", icon: Zap },
        ],
      },
      {
        label: "Comunicazioni",
        collapsible: true,
        defaultOpen: false,
        items: [
          // "Chat" è l'inbox unificata (WhatsApp + email + attività) e
          // sostituisce nel menu le vecchie voci "WhatsApp" (pannello log)
          // e "Chat WhatsApp" — le route restano attive per i bookmark.
          { title: "Chat", url: "/admin/chat", icon: MessageCircle },
          { title: "Template Email", url: "/admin/email", icon: Mail },
          { title: "Log", url: "/admin/comunicazioni", icon: MessageSquare },
          { title: "Calendario", url: "/admin/calendario", icon: CalendarClock },
        ],
      },
      {
        label: "CRM",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Aziende", url: "/aziende", icon: Building2, badge: uncontactedLeads },
          { title: "Clienti", url: "/admin/clienti", icon: UserSearch },
          { title: "Promo", url: "/admin/promo", icon: Gift },
          { title: "Notizie Sito", url: "/admin/news", icon: Newspaper },
        ],
      },
      {
        label: "Risorse",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Documenti utili", url: "/documenti-utili", icon: Download },
        ],
      },
    ];
    // Configurazione — solo super_admin
    if (superAdmin) {
      groups.push({
        label: "Configurazione",
        collapsible: true,
        defaultOpen: false,
        items: [
          { title: "Moduli Form", url: "/admin/moduli", icon: FormInput },
          { title: "Integrazioni (Health)", url: "/admin/integrazioni", icon: Activity },
          { title: "WhatsApp Setup", url: "/admin/whatsapp-config", icon: MessageCircle },
        ],
      });
    }
    // Tutorial rivenditori — voce a tendina con le tre guide (ultima voce).
    groups.push({ items: [TUTORIAL_NAV_ITEM] });
  } else {
    // Aziende E rivenditori legacy condividono lo STESSO menu — la doppia
    // diramazione precedente era un bug: il branch `isReseller(roles)` veniva
    // raggiunto SOLO da `roles.includes("rivenditore")` (ruolo legacy), ma
    // tutti i clienti B2B reali sono `azienda_admin`/`azienda_user` →
    // cadevano nel branch default che NON aveva Dashboard ENEA, né Archivio
    // ENEA → menu mutilato per il 100% degli utenti azienda reali.
    // Unifichiamo: stesso menu completo per chiunque non sia staff interno.
    settingsItem = { title: "Impostazioni", url: "/impostazioni", icon: Settings };
    groups = [
      {
        items: [
          { title: "Dashboard ENEA", url: "/enea/dashboard", icon: BarChart3 },
          { title: "Le mie Pratiche", url: "/kanban", icon: Kanban },
          { title: "Nuova Pratica ENEA", url: "/enea/nuova", icon: FilePlus, end: true },
          { title: "Archivio ENEA", url: "/enea/archivio", icon: Archive },
          { title: "Documenti utili", url: "/documenti-utili", icon: Download },
          TUTORIAL_NAV_ITEM,
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
