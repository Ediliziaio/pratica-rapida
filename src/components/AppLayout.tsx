import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { useCompany } from "@/hooks/useCompany";
import { Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isImpersonating, impersonatedCompanyName, clearImpersonation } = useCompany();

  const handleExitImpersonation = () => {
    clearImpersonation();
    navigate("/aziende");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-auto min-w-0">
          {/* Impersonation banner */}
          {isImpersonating && (
            <div className="flex items-center justify-between gap-2 border-b bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm shrink-0">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>Stai visualizzando come: <strong>{impersonatedCompanyName}</strong></span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExitImpersonation}
                className="h-7 gap-1 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400"
              >
                <X className="h-3 w-3" /> Esci
              </Button>
            </div>
          )}

          {/* Top header */}
          <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md shrink-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <NotificationBell />
            </div>
          </header>

          {/* Page content */}
          <div key={location.pathname} className="flex-1 p-4 md:p-6 lg:p-8 page-enter">
            {children}
          </div>

          <DisclaimerBanner />
        </main>
      </div>
    </SidebarProvider>
  );
}
