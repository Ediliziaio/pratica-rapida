import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
  const { isImpersonating, impersonatedCompanyName, clearImpersonation } = useCompany();

  const handleExitImpersonation = () => {
    clearImpersonation();
    navigate("/aziende");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-auto">
          {isImpersonating && (
            <div className="flex items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span>Stai visualizzando: <strong>{impersonatedCompanyName}</strong></span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleExitImpersonation} className="h-7 gap-1 text-xs">
                <X className="h-3 w-3" />Esci
              </Button>
            </div>
          )}
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <GlobalSearch />
              <NotificationBell />
            </div>
          </header>
          <div className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </div>
          <DisclaimerBanner />
        </main>
      </div>
    </SidebarProvider>
  );
}
