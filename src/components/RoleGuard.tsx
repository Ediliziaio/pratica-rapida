import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "super_admin" | "admin_interno" | "operatore" | "azienda_admin" | "azienda_user" | "partner";

interface RoleGuardProps {
  children: ReactNode;
  allowed: AppRole[];
  fallback?: string;
}

export function RoleGuard({ children, allowed, fallback = "/" }: RoleGuardProps) {
  const { roles, loading } = useAuth();

  if (loading) return null;

  const hasAccess = roles.some(r => allowed.includes(r as AppRole));
  if (!hasAccess) return <Navigate to={fallback} replace />;

  return <>{children}</>;
}
