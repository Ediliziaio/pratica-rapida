import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "admin_interno"
  | "operatore"
  | "azienda_admin"
  | "azienda_user"
  | "partner"
  | "rivenditore";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  // Derived role flags
  isAdmin: boolean;
  isOperatore: boolean;
  isReseller: boolean;
  isInternal: boolean;
  resellerId: string | null;
  isBlocked: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  roles: [],
  loading: true,
  isAdmin: false,
  isOperatore: false,
  isReseller: false,
  isInternal: false,
  resellerId: null,
  isBlocked: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRolesAndProfile = async (userId: string) => {
    // Fetch roles
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleData) {
      setRoles(roleData.map((r) => r.role as AppRole));
    }

    // If rivenditore, fetch company assignment and check if blocked
    const isRivenditore = roleData?.some((r) => r.role === "rivenditore");
    if (isRivenditore) {
      const { data: assignment } = await supabase
        .from("user_company_assignments")
        .select("company_id, companies(is_active, blocked_at)")
        .eq("user_id", userId)
        .single();

      if (assignment) {
        setResellerId(assignment.company_id);
        const company = assignment.companies as { is_active: boolean; blocked_at: string | null } | null;
        setIsBlocked(!company?.is_active || !!company?.blocked_at);
      }
    } else {
      setResellerId(null);
      setIsBlocked(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRolesAndProfile(session.user.id), 0);
        } else {
          setRoles([]);
          setResellerId(null);
          setIsBlocked(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRolesAndProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setResellerId(null);
    setIsBlocked(false);
  };

  const isAdminFlag = roles.includes("super_admin");
  const isOperatoreFlag = roles.some((r) => ["super_admin", "admin_interno", "operatore"].includes(r));
  const isResellerFlag = roles.includes("rivenditore");
  const isInternalFlag = roles.some((r) => ["super_admin", "admin_interno", "operatore"].includes(r));

  return (
    <AuthContext.Provider value={{
      session,
      user,
      roles,
      loading,
      isAdmin: isAdminFlag,
      isOperatore: isOperatoreFlag,
      isReseller: isResellerFlag,
      isInternal: isInternalFlag,
      resellerId,
      isBlocked,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Role helpers (backward compat)
export const isSuperAdmin = (roles: AppRole[]) => roles.includes("super_admin");
export const isInternal = (roles: AppRole[]) =>
  roles.some((r) => ["super_admin", "admin_interno", "operatore"].includes(r));
export const isAzienda = (roles: AppRole[]) =>
  roles.some((r) => ["azienda_admin", "azienda_user"].includes(r));
export const isReseller = (roles: AppRole[]) => roles.includes("rivenditore");
