import { useAuth, isInternal, isReseller } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { DashboardAzienda } from "@/components/dashboard/DashboardAzienda";
import { DashboardInterno } from "@/components/dashboard/DashboardInterno";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, Kanban, BarChart3 } from "lucide-react";

const EneaDashboardContent = lazy(() => import("./EneaDashboard"));
const AnalyticsContent = lazy(() => import("./Analytics"));

function PageLoader() {
  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["kpi-1", "kpi-2", "kpi-3", "kpi-4"].map((k) => (
          <Skeleton key={k} className="h-[100px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export default function Dashboard() {
  const { roles } = useAuth();
  const { companyId } = useCompany();
  const isInternalUser = isInternal(roles);
  const isResellerUser = isReseller(roles);

  // Internal users without impersonation → unified dashboard with tabs
  if (isInternalUser && !companyId) {
    return (
      <div className="space-y-0">
        <Tabs defaultValue="pratiche">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Panoramica</p>
              <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            </div>
            <TabsList className="bg-muted/60">
              <TabsTrigger value="pratiche" className="gap-1.5 text-xs">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Pratiche
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="gap-1.5 text-xs">
                <Kanban className="h-3.5 w-3.5" />
                Pipeline ENEA / CT
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pratiche" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <DashboardInterno />
          </TabsContent>

          <TabsContent value="pipeline" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <Suspense fallback={<PageLoader />}>
              <EneaDashboardContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <Suspense fallback={<PageLoader />}>
              <AnalyticsContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Reseller → pipeline dashboard only
  if (isResellerUser) {
    return (
      <Suspense fallback={<PageLoader />}>
        <EneaDashboardContent />
      </Suspense>
    );
  }

  // Company users (azienda_admin, azienda_user) or internal impersonating → company dashboard
  return <DashboardAzienda />;
}
