import { useAuth, isInternal, isReseller } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { DashboardAzienda } from "@/components/dashboard/DashboardAzienda";
import { DashboardInterno } from "@/components/dashboard/DashboardInterno";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const EneaDashboardContent = lazy(() => import("./EneaDashboard"));

function PageLoader() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
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
      <Tabs defaultValue="pratiche" className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
          <TabsList>
            <TabsTrigger value="pratiche">Pratiche</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline ENEA / CT</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pratiche" className="mt-0">
          <DashboardInterno />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-0">
          <Suspense fallback={<PageLoader />}>
            <EneaDashboardContent />
          </Suspense>
        </TabsContent>
      </Tabs>
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
