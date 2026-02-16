import {
  LayoutDashboard,
  Users,
  FolderOpen,
  FilePlus,
  FileText,
  Wallet,
  Building2,
  Settings,
  ListChecks,
  BarChart3,
  Shield,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth, isSuperAdmin, isInternal, isAzienda } from "@/hooks/useAuth";
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
import { Separator } from "@/components/ui/separator";

export function AppSidebar() {
  const { roles, user, signOut } = useAuth();
  const { state } = useSidebar();
  const { isImpersonating } = useCompany();
  const collapsed = state === "collapsed";

  const superAdmin = isSuperAdmin(roles);
  const internal = isInternal(roles);
  const azienda = isAzienda(roles);

  const showAzienda = azienda || isImpersonating || !roles.length;
  const showInternal = internal && !isImpersonating;
  const showSuperAdmin = superAdmin && !isImpersonating;

  const aziendaItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Clienti", url: "/clienti", icon: Users },
    { title: "Nuova Pratica", url: "/pratiche/nuova", icon: FilePlus },
    { title: "Pratiche", url: "/pratiche", icon: FolderOpen },
    { title: "Fatturazione", url: "/fatturazione", icon: FileText },
    { title: "Wallet", url: "/wallet", icon: Wallet },
  ];

  const internalItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Coda Pratiche", url: "/coda-pratiche", icon: ListChecks },
    { title: "Aziende", url: "/aziende", icon: Building2 },
  ];

  const superAdminItems = [
    { title: "Utenti & Ruoli", url: "/utenti", icon: Shield },
    { title: "Listino Servizi", url: "/listino", icon: Settings },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Brand */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="flex items-center gap-3 px-2 py-4">
              {collapsed ? (
                <img src="/impresa-logo.png" alt="Impresa Leggera" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
              ) : (
                <img src="/impresa-logo.png" alt="Impresa Leggera" className="h-9" />
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator />

        {/* Azienda section */}
        {showAzienda && (
          <SidebarGroup>
            <SidebarGroupLabel>Area Azienda</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {aziendaItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} end={item.url === "/"} className="hover:bg-accent" activeClassName="bg-accent text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Internal section */}
        {showInternal && (
          <SidebarGroup>
            <SidebarGroupLabel>Area Interna</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {internalItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} end={item.url === "/"} className="hover:bg-accent" activeClassName="bg-accent text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Super Admin section */}
        {showSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {superAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} className="hover:bg-accent" activeClassName="bg-accent text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2">
          {!collapsed && user && (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          )}
          <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
