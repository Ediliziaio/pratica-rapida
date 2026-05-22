import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setUser as sentrySetUser } from "@/lib/sentry";

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
  /** True quando un super_admin ha forzato una password temporanea — l'utente
   *  deve cambiarla prima di poter usare l'app (ProtectedRoute lo reindirizza
   *  a /cambia-password). Aggiornato da `profiles.must_change_password`. */
  mustChangePassword: boolean;
  /** Resetta il flag dopo che l'utente ha cambiato password con successo. */
  clearMustChangePassword: () => void;
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
  mustChangePassword: false,
  clearMustChangePassword: () => {},
  clearPasswordRecovery: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  // Guard against concurrent fetches for the same userId
  const fetchingForRef = useRef<string | null>(null);
  // Mounted guard: protegge i setState async dentro onAuthStateChange e
  // fetchRolesAndProfile dal firing dopo unmount. Senza, React warning:
  // "Can't perform a React state update on an unmounted component" + leak.
  const mountedRef = useRef(true);

  const fetchRolesAndProfile = async (userId: string) => {
    if (fetchingForRef.current === userId) return;
    fetchingForRef.current = userId;

    // try/finally garantisce reset di fetchingForRef anche su throw.
    // mountedRef guard prima di ogni setState evita warning + leak se il
    // provider si è smontato durante la fetch. CRITICO: se questa fetch
    // fallisce silenziosamente (RLS deny, network), DEVE comunque chiamare
    // setRoles([]) esplicitamente — altrimenti `roles` resta `[]` iniziale
    // e RoleGuard ritorna null infinito (spinner senza fine). Stesso per
    // mustChangePassword e resellerId.
    try {
      const { data: roleData, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!mountedRef.current) return;

      // Esplicito anche su roleData null/errore: setRoles([]) chiude lo
      // "stato di caricamento" di RoleGuard. Pre-fix: solo se roleData
      // veniva valorizzato la UI sapeva che il fetch era completato.
      if (roleErr) {
        console.error("[useAuth] fetch user_roles failed:", roleErr);
      }
      setRoles(roleData ? roleData.map((r) => r.role as AppRole) : []);

      // resellerId resolves via user_company_assignments for ANY role that owns
      // practices in the new enea_practices table. Historically only "rivenditore"
      // needed it, but azienda_admin / azienda_user now also create practices via
      // /enea/nuova, and enea_practices RLS checks user_company_assignments via
      // get_reseller_company_id() regardless of role. Widen it here so the form
      // can submit and the kanban/archive queries resolve the right company.
      const ownsPracticesViaAssignment = roleData?.some((r) =>
        ["rivenditore", "azienda_admin", "azienda_user"].includes(r.role),
      );
      if (ownsPracticesViaAssignment) {
        const { data: assignment } = await supabase
          .from("user_company_assignments")
          .select("company_id, companies(is_active, blocked_at)")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!mountedRef.current) return;
        if (assignment) {
          setResellerId(assignment.company_id);
          const company = assignment.companies as { is_active: boolean; blocked_at: string | null } | null;
          setIsBlocked(!company?.is_active || !!company?.blocked_at);
        } else {
          setResellerId(null);
          setIsBlocked(false);
        }
      } else {
        setResellerId(null);
        setIsBlocked(false);
      }

      // Read profile flag for forced password change (set by super_admin via
      // set-company-password edge function).
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", userId)
        .maybeSingle();
      if (!mountedRef.current) return;
      setMustChangePassword(!!profile?.must_change_password);
    } catch (err) {
      // Fail-safe: qualunque errore non gestito → almeno chiudi lo stato
      // "caricamento ruoli" per evitare spinner infinito su RoleGuard.
      // L'utente vedrà fallback redirect a "/", non meglio ma almeno
      // l'app non è bloccata.
      console.error("[useAuth] fetchRolesAndProfile threw:", err);
      if (mountedRef.current) {
        setRoles([]);
        setResellerId(null);
        setIsBlocked(false);
        setMustChangePassword(false);
      }
    } finally {
      fetchingForRef.current = null;
    }
  };

  useEffect(() => {
    // Set initial mounted state. NB: mountedRef is on top-level useRef.
    // In React StrictMode, useEffect cleanup+setup fires once extra in dev.
    // mountedRef tracks "current effect lifecycle is alive".
    mountedRef.current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Race guard: se il provider si è smontato (logout veloce, route
        // change, hot-reload), evita di chiamare setState su unmounted.
        if (!mountedRef.current) return;

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
          setMustChangePassword(false);
          fetchingForRef.current = null;
          setSession(null);
          setUser(null);
          setRoles([]);
          setResellerId(null);
          setIsBlocked(false);
          setLoading(false);
          // CRITICO: clear della cache React Query dopo logout.
          // Senza, i dati dell'utente precedente restano in cache → quando
          // il nuovo utente fa login, vede momentaneamente i dati del
          // precedente prima che le query si refetch (info leak tra
          // utenti su computer condiviso, audit-trail incorretto).
          queryClient.clear();
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
      if (!mountedRef.current) return;
      setSession(prev => prev ?? session);
      setUser(prev => prev ?? (session?.user ?? null));
      if (session?.user) {
        fetchRolesAndProfile(session.user.id).catch(console.error);
      }
      setLoading(false);
    }).catch(console.error);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync the authenticated user into Sentry so errors carry identity.
  // No-op when Sentry is not configured (see src/lib/sentry.ts).
  useEffect(() => {
    if (user) {
      sentrySetUser({ id: user.id, email: user.email });
    } else {
      sentrySetUser(null);
    }
  }, [user]);

  const signOut = async () => {
    // Try/catch per evitare unhandled rejection se signOut Supabase fallisce
    // (network down, token già expired). In quel caso forziamo comunque
    // il clear state locale per non lasciare l'utente in stato "loggato a metà".
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[useAuth] signOut Supabase failed:", err);
      // Fallback: forziamo SIGNED_OUT event handler manualmente reset state.
      // Senza, l'utente avrebbe ancora session=valid ma UI inconsistente.
    }
    setIsPasswordRecovery(false);
    setMustChangePassword(false);
    setRoles([]);
    setResellerId(null);
    setIsBlocked(false);
    // Cache clear ulteriore (SIGNED_OUT handler dovrebbe averla fatto già,
    // ma se signOut fallisce sopra arriviamo qui senza evento → safety net).
    queryClient.clear();
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);
  const clearMustChangePassword = () => setMustChangePassword(false);

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
      mustChangePassword,
      clearMustChangePassword,
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
