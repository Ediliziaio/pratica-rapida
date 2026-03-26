import { useAuth, isInternal } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { DashboardAzienda } from "@/components/dashboard/DashboardAzienda";
import { DashboardInterno } from "@/components/dashboard/DashboardInterno";

export default function Dashboard() {
  const { roles } = useAuth();
  const { companyId } = useCompany();
  const isInternalUser = isInternal(roles);

  // Internal users without company impersonation → admin dashboard
  // All company users (azienda_admin, azienda_user) → company dashboard
  // Internal users impersonating a company → company dashboard (context-aware)
  if (isInternalUser && !companyId) {
    return <DashboardInterno />;
  }

  return <DashboardAzienda />;
}
