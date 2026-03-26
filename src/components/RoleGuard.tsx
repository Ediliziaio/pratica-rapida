import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";

interface RoleGuardProps {
  children: ReactNode;
  allowed: AppRole[];
  fallback?: string;
}

export function RoleGuard({ children, allowed, fallback = "/" }: RoleGuardProps) {
  const { roles, loading, isBlocked, isReseller } = useAuth();

  if (loading) return null;

  // Reseller bloccato → redirect a /blocked
  if (isReseller && isBlocked) return <Navigate to="/blocked" replace />;

  const hasAccess = roles.some(r => allowed.includes(r as AppRole));
  if (!hasAccess) return <Navigate to={fallback} replace />;

  return <>{children}</>;
}
