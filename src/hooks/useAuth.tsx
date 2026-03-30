import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
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
  /** True when the user landed via a password-reset link (PASSWORD_RECOVERY event) */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
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
  isPasswordRecovery: false,
  clearPasswordRecovery: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Guard against concurrent fetches for the same userId
  const fetchingForRef = useRef<string | null>(null);

  const fetchRolesAndProfile = async (userId: string) => {
    if (fetchingForRef.current === userId) return;
    fetchingForRef.current = userId;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleData) {
      setRoles(roleData.map((r) => r.role as AppRole));
    }

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
    fetchingForRef.current = null;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // User clicked the reset-password link — hold them on /auth, don't redirect
          setIsPasswordRecovery(true);
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          return; // do NOT fetch roles/profile in recovery mode
        }

        if (event === "SIGNED_OUT") {
          setIsPasswordRecovery(false);
          fetchingForRef.current = null;
          setSession(null);
          setUser(null);
          setRoles([]);
          setResellerId(null);
          setIsBlocked(false);
          setLoading(false);
          return;
        }

        // USER_UPDATED fires after successful updateUser (password change)
        if (event === "USER_UPDATED") {
          setIsPasswordRecovery(false);
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchingForRef.current = null;
          fetchRolesAndProfile(session.user.id).catch(console.error);
        }
        setLoading(false);
      }
    );

    // Initial session check — if the hash contains type=recovery Supabase will
    // fire PASSWORD_RECOVERY via onAuthStateChange above before this resolves,
    // so we only set session/loading here if not already in recovery mode.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(prev => prev ?? session);
      setUser(prev => prev ?? (session?.user ?? null));
      if (session?.user) {
        fetchRolesAndProfile(session.user.id).catch(console.error);
      }
      setLoading(false);
    }).catch(console.error);

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsPasswordRecovery(false);
    setRoles([]);
    setResellerId(null);
    setIsBlocked(false);
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const isAdminFlag = roles.includes("super_admin");
  const isOperatoreFlag = roles.some((r) => ["super_admin", "operatore"].includes(r));
  const isResellerFlag = roles.includes("rivenditore");
  const isInternalFlag = roles.some((r) => ["super_admin", "operatore"].includes(r));

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
      isPasswordRecovery,
      clearPasswordRecovery,
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
  roles.some((r) => ["super_admin", "operatore"].includes(r));
export const isAzienda = (roles: AppRole[]) =>
  roles.some((r) => ["azienda_admin", "azienda_user"].includes(r));
export const isReseller = (roles: AppRole[]) => roles.includes("rivenditore");
